import { PASSWORD_HASH_ALGORITHM } from "../auth/auth.constants";
import { hashPassword } from "../../services/password.service";
import { constantTimeEqual } from "../../utils/crypto";
import { withErrorStep } from "../../utils/error-step";
import { AppError, ValidationError } from "../../utils/errors";

import { BOOTSTRAP_MESSAGES } from "./bootstrap.constants";
import * as repository from "./bootstrap.repository";
import type { BootstrapInitializeInput, BootstrapStatus } from "./bootstrap.types";

const bearerToken = (authorization: string | null | undefined): string | null => {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
};

const assertBootstrapToken = (env: Env, authorization: string | null | undefined): void => {
  if (!env.BOOTSTRAP_ADMIN_TOKEN) {
    throw new AppError(BOOTSTRAP_MESSAGES.tokenNotConfigured, "BOOTSTRAP_TOKEN_NOT_CONFIGURED", 500);
  }

  const token = bearerToken(authorization);
  if (!token || !constantTimeEqual(token, env.BOOTSTRAP_ADMIN_TOKEN)) {
    throw new AppError(BOOTSTRAP_MESSAGES.invalidToken, "BOOTSTRAP_TOKEN_INVALID", 401);
  }
};

export const getBootstrapStatus = async (env: Env): Promise<BootstrapStatus> => {
  const bootstrapState = await repository.findSystemBootstrap(env);
  const [companyCount, userCount, superAdminCount] = await Promise.all([
    repository.countCompanies(env),
    repository.countUsers(env),
    repository.countSuperAdmins(env),
  ]);

  if (bootstrapState?.is_initialized === 1) {
    return {
      setup_required: false,
    };
  }

  return {
    setup_required: userCount === 0 && superAdminCount === 0 && companyCount === 0,
  };
};

export const initializeBootstrap = async (
  env: Env,
  input: BootstrapInitializeInput,
  authorization: string | null | undefined,
) => {
  assertBootstrapToken(env, authorization);

  const status = await getBootstrapStatus(env);
  if (!status.setup_required) {
    throw new AppError(BOOTSTRAP_MESSAGES.completed, "BOOTSTRAP_ALREADY_COMPLETED", 409);
  }

  const seedRole = await repository.findSeedSuperAdminRole(env);
  if (!seedRole) {
    throw new AppError(BOOTSTRAP_MESSAGES.roleMissing, "BOOTSTRAP_ROLE_MISSING", 409);
  }

  if (input.outlet?.outlet_code) {
    const existingOutlet = await repository.findOutletByCode(env, "__bootstrap_pending__", input.outlet.outlet_code);
    if (existingOutlet) {
      throw new ValidationError("This outlet code is already in use.");
    }
  }

  const companyId = crypto.randomUUID();
  const outletId = input.outlet ? crypto.randomUUID() : null;
  const userId = crypto.randomUUID();
  const passwordHash = await withErrorStep(
    "hash_super_admin_password",
    () => hashPassword(input.super_admin.password, env.PASSWORD_PEPPER, env),
  );

  try {
    await repository.cloneCompanyDefaults(env, companyId, input.company);
  } catch (error) {
    console.warn("Bootstrap default role templates could not be fully copied", { error });
  }

  await repository.ensureCompanySuperAdminRole(env, companyId, seedRole);
  await repository.ensureProductionFallbackDefaults(env, companyId);
  const companyRole = await repository.findCompanyRoleByKey(env, companyId, "super_admin");
  if (!companyRole) {
    throw new AppError(BOOTSTRAP_MESSAGES.roleMissing, "BOOTSTRAP_ROLE_MISSING", 409);
  }

  try {
    await repository.createBootstrapCore(env, {
      companyId,
      company: input.company,
      outletId,
      outlet: input.outlet,
      userId,
      user: input.super_admin,
      passwordHash,
      passwordAlgo: PASSWORD_HASH_ALGORITHM,
      roleId: companyRole.id,
    });
  } catch (error) {
    // D1 batch keeps the user, role assignment, and audit together. If a future
    // adapter weakens that guarantee, this is the safe place to disable user.
    console.error("Initial setup could not be completed", { error });
    throw new AppError("Initial setup could not be completed. Please review the setup details and try again.", "BOOTSTRAP_INITIALIZE_FAILED", 500);
  }

  try {
    await repository.markSystemBootstrapInitialized(env, {
      companyId,
      initializedByUserId: userId,
    });
  } catch (error) {
    console.warn("System bootstrap status could not be marked initialized", { error });
  }

  return {
    company: {
      id: companyId,
      company_name: input.company.company_name,
      legal_name: input.company.legal_name,
      country: input.company.country,
      timezone: input.company.timezone,
      currency: input.company.currency,
      status: "active",
    },
    super_admin: {
      id: userId,
      full_name: input.super_admin.full_name,
      email: input.super_admin.email,
      status: "active",
      role: "super_admin",
    },
    outlet: input.outlet && outletId ? {
      id: outletId,
      outlet_name: input.outlet.outlet_name,
      outlet_code: input.outlet.outlet_code ?? null,
      status: "active",
    } : null,
  };
};
