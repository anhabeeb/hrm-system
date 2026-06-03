import {
  PASSWORD_HASH_ALGORITHM,
  PASSWORD_HASH_DIGEST,
  PASSWORD_HASH_ITERATIONS,
  PASSWORD_HASH_VERSION,
  PBKDF2_MAX_WORKERS_ITERATIONS,
} from "../modules/auth/auth.constants";
import {
  base64ToBytes,
  bytesToBase64,
  constantTimeEqual,
  encodeUtf8,
  randomBytes,
} from "../utils/crypto";
import { ConfigurationError } from "../utils/errors";

export interface PasswordHashConfig {
  algorithm: typeof PASSWORD_HASH_ALGORITHM;
  digest: typeof PASSWORD_HASH_DIGEST;
  version: typeof PASSWORD_HASH_VERSION;
  iterations: number;
}

const parseRequestedIterations = (env?: Pick<Env, "PASSWORD_HASH_ITERATIONS">): number => {
  const raw = env?.PASSWORD_HASH_ITERATIONS;
  if (raw === undefined || raw === null || raw === "") return PASSWORD_HASH_ITERATIONS;

  const requested = Number(raw);
  if (!Number.isInteger(requested) || requested <= 0) {
    throw new ConfigurationError({
      code: "PASSWORD_HASH_CONFIGURATION_ERROR",
      title: "Password hashing configuration error",
      message: "The password hash iteration setting is not valid.",
      technicalMessage: `Invalid PASSWORD_HASH_ITERATIONS value: ${raw}`,
      suggestedAction: "Set PASSWORD_HASH_ITERATIONS to a positive integer no greater than 100000 for Cloudflare Workers.",
      retryable: false,
    });
  }

  return requested;
};

export const resolvePasswordHashConfig = (
  env?: Pick<Env, "PASSWORD_HASH_ITERATIONS">,
): PasswordHashConfig => {
  const requestedIterations = parseRequestedIterations(env);
  const iterations = Math.min(requestedIterations, PBKDF2_MAX_WORKERS_ITERATIONS);

  if (requestedIterations > PBKDF2_MAX_WORKERS_ITERATIONS) {
    console.warn("PASSWORD_HASH_ITERATIONS exceeds Cloudflare Workers PBKDF2 limit; clamped to 100000", {
      requestedIterations,
      usedIterations: iterations,
    });
  }

  return {
    algorithm: PASSWORD_HASH_ALGORITHM,
    digest: PASSWORD_HASH_DIGEST,
    version: PASSWORD_HASH_VERSION,
    iterations,
  };
};

const derivePasswordHash = async (
  password: string,
  pepper: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> => {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encodeUtf8(`${password}${pepper}`),
      "PBKDF2",
      false,
      ["deriveBits"],
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: PASSWORD_HASH_DIGEST,
        salt,
        iterations,
      },
      key,
      256,
    );

    return new Uint8Array(bits);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/iteration counts above 100000 are not supported/i.test(message)) {
      throw new ConfigurationError({
        code: "PASSWORD_HASH_CONFIGURATION_ERROR",
        title: "Password hashing configuration error",
        message: "The password could not be securely hashed because the configured PBKDF2 iteration count is not supported by the current runtime.",
        technicalMessage: message,
        suggestedAction: "Set PASSWORD_HASH_ITERATIONS to 100000 or lower for Cloudflare Workers, then retry.",
        retryable: false,
        cause: error,
      });
    }
    throw error;
  }
};

export const hashPassword = async (
  password: string,
  pepper: string,
  env?: Pick<Env, "PASSWORD_HASH_ITERATIONS">,
): Promise<string> => {
  const config = resolvePasswordHashConfig(env);
  const salt = randomBytes(16);
  const hash = await derivePasswordHash(
    password,
    pepper,
    salt,
    config.iterations,
  );

  return [
    config.algorithm,
    config.version,
    String(config.iterations),
    bytesToBase64(salt),
    bytesToBase64(hash),
  ].join("$");
};

const parseEncodedHash = (encodedHash: string): {
  algorithm: string;
  version: string;
  iterations: number;
  saltValue: string;
  hashValue: string;
} | null => {
  const parts = encodedHash.split("$");
  const [algorithm] = parts;

  if (algorithm !== PASSWORD_HASH_ALGORITHM) return null;

  if (parts.length === 4) {
    const [, iterationsValue, saltValue, hashValue] = parts;
    const iterations = Number(iterationsValue);
    if (!Number.isInteger(iterations) || iterations <= 0 || !saltValue || !hashValue) return null;
    return {
      algorithm,
      version: "legacy",
      iterations,
      saltValue,
      hashValue,
    };
  }

  if (parts.length === 5) {
    const [, version, iterationsValue, saltValue, hashValue] = parts;
    const iterations = Number(iterationsValue);
    if (!version || !Number.isInteger(iterations) || iterations <= 0 || !saltValue || !hashValue) return null;
    return {
      algorithm,
      version,
      iterations,
      saltValue,
      hashValue,
    };
  }

  return null;
};

export const passwordNeedsRehash = (
  encodedHash: string | null,
  env?: Pick<Env, "PASSWORD_HASH_ITERATIONS">,
): boolean => {
  if (!encodedHash) return false;
  const parsed = parseEncodedHash(encodedHash);
  if (!parsed) return false;
  const current = resolvePasswordHashConfig(env);

  return (
    parsed.version !== current.version ||
    parsed.iterations < current.iterations ||
    parsed.iterations > PBKDF2_MAX_WORKERS_ITERATIONS
  );
};

export const verifyPassword = async (
  password: string,
  encodedHash: string | null,
  pepper: string,
): Promise<boolean> => {
  if (!encodedHash) {
    return false;
  }

  const parsed = parseEncodedHash(encodedHash);
  if (!parsed) {
    return false;
  }

  if (parsed.iterations > PBKDF2_MAX_WORKERS_ITERATIONS) {
    return false;
  }

  const hash = await derivePasswordHash(
    password,
    pepper,
    base64ToBytes(parsed.saltValue),
    parsed.iterations,
  );

  return constantTimeEqual(bytesToBase64(hash), parsed.hashValue);
};

export interface PasswordValidationResult {
  valid: boolean;
  message?: string;
}

const weakPasswords = new Set([
  "password",
  "password123",
  "1234567890",
  "qwerty12345",
  "admin12345",
  "letmein123",
]);

export const validateNewPassword = (
  password: string,
  confirmPassword: string,
): PasswordValidationResult => {
  if (password !== confirmPassword) {
    return {
      valid: false,
      message: "The new password and confirmation do not match.",
    };
  }

  if (password.length < 10) {
    return {
      valid: false,
      message: "Your password must be at least 10 characters long.",
    };
  }

  if (!/[A-Za-z]/.test(password)) {
    return {
      valid: false,
      message: "Your password must include at least one letter.",
    };
  }

  if (!/\d/.test(password)) {
    return {
      valid: false,
      message: "Your password must include at least one number.",
    };
  }

  if (weakPasswords.has(password.toLowerCase())) {
    return {
      valid: false,
      message: "Please choose a stronger password.",
    };
  }

  return { valid: true };
};
