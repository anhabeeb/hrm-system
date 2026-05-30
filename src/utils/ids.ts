export type IdPrefix =
  | "id"
  | "req"
  | "emp"
  | "user"
  | "pay"
  | "doc"
  | "audit"
  | "notif";

const sanitizePrefix = (prefix: string): string => {
  const sanitized = prefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return sanitized || "id";
};

const randomSegment = (): string => crypto.randomUUID().replace(/-/g, "");

export const createPrefixedId = (prefix = "id"): string =>
  `${sanitizePrefix(prefix)}_${randomSegment()}`;

export const createEntityId = (prefix: Exclude<IdPrefix, "req"> = "id"): string =>
  createPrefixedId(prefix);

export const createRequestId = (): string => createPrefixedId("req");
