import {
  PASSWORD_HASH_ALGORITHM,
  PASSWORD_HASH_ITERATIONS,
} from "../modules/auth/auth.constants";
import {
  base64ToBytes,
  bytesToBase64,
  constantTimeEqual,
  encodeUtf8,
  randomBytes,
} from "../utils/crypto";

const derivePasswordHash = async (
  password: string,
  pepper: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> => {
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
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    256,
  );

  return new Uint8Array(bits);
};

export const hashPassword = async (
  password: string,
  pepper: string,
): Promise<string> => {
  const salt = randomBytes(16);
  const hash = await derivePasswordHash(
    password,
    pepper,
    salt,
    PASSWORD_HASH_ITERATIONS,
  );

  return [
    PASSWORD_HASH_ALGORITHM,
    String(PASSWORD_HASH_ITERATIONS),
    bytesToBase64(salt),
    bytesToBase64(hash),
  ].join("$");
};

export const verifyPassword = async (
  password: string,
  encodedHash: string | null,
  pepper: string,
): Promise<boolean> => {
  if (!encodedHash) {
    return false;
  }

  const [algorithm, iterationsValue, saltValue, hashValue] = encodedHash.split("$");

  if (algorithm !== PASSWORD_HASH_ALGORITHM || !iterationsValue || !saltValue || !hashValue) {
    return false;
  }

  const iterations = Number(iterationsValue);

  if (!Number.isInteger(iterations) || iterations < 100_000) {
    return false;
  }

  const hash = await derivePasswordHash(
    password,
    pepper,
    base64ToBytes(saltValue),
    iterations,
  );

  return constantTimeEqual(bytesToBase64(hash), hashValue);
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
