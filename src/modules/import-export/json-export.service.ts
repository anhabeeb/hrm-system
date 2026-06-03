import { sanitizeSensitivePayload } from "../../utils/sanitize";

export const toSafeJson = (value: unknown): string =>
  JSON.stringify(sanitizeSensitivePayload(value), null, 2);
