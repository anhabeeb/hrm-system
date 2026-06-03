import { parseCsvPreview } from "./csv.service";

export const validateImportContent = (content: string, mimeType: string) => {
  if (mimeType === "application/json") {
    try {
      const parsed = JSON.parse(content);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return { total_rows: rows.length, valid_rows: rows.length, invalid_rows: 0, errors: [] };
    } catch {
      return { total_rows: 0, valid_rows: 0, invalid_rows: 1, errors: [{ row: 1, message: "JSON file could not be parsed." }] };
    }
  }
  return parseCsvPreview(content);
};
