import { createAuditLog } from "../../services/audit.service";
import type { AuthActor } from "../../types/api.types";
import { AppError, NotFoundError } from "../../utils/errors";
import * as repository from "./company.repository";
import type { CompanyProfile, UpdateCompanyProfileInput } from "./company.types";

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const profileFromRows = async (env: Env, context: AuthActor): Promise<CompanyProfile> => {
  const company = await repository.findCompany(env, context.companyId);
  if (!company) throw new NotFoundError("Company information could not be found.");

  const setting = await repository.getCompanyProfileSetting(env, context.companyId);
  const extra = parseJson<Partial<CompanyProfile>>(setting?.setting_value_json, {});

  return {
    company_name: company.name,
    legal_name: company.legal_name,
    registration_number: extra.registration_number ?? null,
    tax_number: extra.tax_number ?? null,
    company_email: extra.company_email ?? null,
    company_phone: extra.company_phone ?? null,
    website: extra.website ?? null,
    country: extra.country ?? null,
    timezone: company.timezone,
    currency: company.currency,
    address_line_1: extra.address_line_1 ?? null,
    address_line_2: extra.address_line_2 ?? null,
    city: extra.city ?? null,
    state_region: extra.state_region ?? null,
    postal_code: extra.postal_code ?? null,
    logo_url: company.logo_url,
    updated_at: company.updated_at,
  };
};

export const getCompanyProfile = (env: Env, context: AuthActor) =>
  profileFromRows(env, context);

export const updateCompanyProfile = async (
  env: Env,
  context: AuthActor,
  input: UpdateCompanyProfileInput,
) => {
  const oldProfile = await profileFromRows(env, context);
  const nextProfile: CompanyProfile = {
    ...oldProfile,
    ...input,
    company_name: input.company_name ?? oldProfile.company_name,
    legal_name: input.legal_name === undefined ? oldProfile.legal_name : input.legal_name,
    timezone: input.timezone ?? oldProfile.timezone,
    currency: input.currency ?? oldProfile.currency,
    logo_url: input.logo_url === undefined ? oldProfile.logo_url : input.logo_url,
    updated_at: new Date().toISOString(),
  };

  await repository.updateCompanyCore(env, context.companyId, {
    name: nextProfile.company_name,
    legalName: nextProfile.legal_name,
    logoUrl: nextProfile.logo_url,
    currency: nextProfile.currency,
    timezone: nextProfile.timezone,
  });
  await repository.upsertCompanyProfileSetting(
    env,
    context.companyId,
    JSON.stringify({
      registration_number: nextProfile.registration_number,
      tax_number: nextProfile.tax_number,
      company_email: nextProfile.company_email,
      company_phone: nextProfile.company_phone,
      website: nextProfile.website,
      country: nextProfile.country,
      address_line_1: nextProfile.address_line_1,
      address_line_2: nextProfile.address_line_2,
      city: nextProfile.city,
      state_region: nextProfile.state_region,
      postal_code: nextProfile.postal_code,
    }),
    context.actorUserId,
  );

  const audit = await createAuditLog(env, {
    companyId: context.companyId,
    module: "settings",
    action: "company_profile_updated",
    severity: "info",
    entityType: "company",
    entityId: context.companyId,
    actorId: context.actorUserId,
    oldValueJson: JSON.stringify(oldProfile),
    newValueJson: JSON.stringify(nextProfile),
    reason: input.reason,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  if (!audit.created) {
    throw new AppError("Company information audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
  }

  return { profile: await profileFromRows(env, context) };
};
