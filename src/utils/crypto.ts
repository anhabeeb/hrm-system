const encoder = new TextEncoder();
const decoder = new TextDecoder();

const bytesToHex = (value: Uint8Array): string =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const bytesToBase64 = (value: Uint8Array): string => {
  let binary = "";

  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
};

export const base64ToBytes = (value: string): Uint8Array =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

const bytesToBase64Url = (value: Uint8Array): string =>
  bytesToBase64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

export const generateSecureToken = (byteLength = 32): string => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
};

export const hashToken = async (token: string, secret = ""): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${token}${secret}`),
  );

  return bytesToHex(new Uint8Array(digest));
};

export const constantTimeEqual = (left: string, right: string): boolean => {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return difference === 0;
};

export const randomBytes = (byteLength: number): Uint8Array => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytes;
};

export const encodeUtf8 = (value: string): Uint8Array => encoder.encode(value);

export const decodeUtf8 = (value: Uint8Array): string => decoder.decode(value);
