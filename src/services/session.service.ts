import { SESSION_COOKIE_NAME, SESSION_TTL_DAYS } from "../modules/auth/auth.constants";
import { createEntityId } from "../utils/ids";
import { generateSecureToken, hashToken } from "../utils/crypto";

export interface NewSessionToken {
  id: string;
  token: string;
  tokenHash: string;
  expiresAt: string;
}

export const createSessionToken = async (
  sessionSecret: string,
): Promise<NewSessionToken> => {
  const token = generateSecureToken(48);
  const tokenHash = await hashToken(token, sessionSecret);
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  return {
    id: createEntityId("user").replace("user_", "sess_"),
    token,
    tokenHash,
    expiresAt,
  };
};

export const buildSessionCookie = (token: string, expiresAt: string): string =>
  [
    `${SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ].join("; ");

export const buildClearSessionCookie = (): string =>
  [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ].join("; ");

export const parseCookie = (cookieHeader: string | null, name: string): string | null => {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const prefix = `${name}=`;
  const match = cookies.find((cookie) => cookie.startsWith(prefix));

  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
};
