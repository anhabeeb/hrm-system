import { AppError } from "../../utils/errors";
import type { ImportTemplate } from "./imports.types";

export const MAX_IMPORT_FILE_BYTES = 2_000_000;
export const MAX_IMPORT_ROWS = 5_000;
const formulaPrefix = /^[=+\-@]/;

const normalizeHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const sanitizeImportValue = (value: unknown) => {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/\0/g, "").trim();
  return formulaPrefix.test(text) ? `'${text}` : text;
};

export const sanitizeRow = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), sanitizeImportValue(value)]));

export const parseCsv = (content: string) => {
  const bytes = new TextEncoder().encode(content).length;
  if (!content.trim()) throw new AppError("Please provide CSV content before previewing an import.", "IMPORT_FILE_REQUIRED", 400);
  if (bytes > MAX_IMPORT_FILE_BYTES) throw new AppError("This import file is too large. Please split it into smaller files.", "IMPORT_FILE_TOO_LARGE", 413);

  const input = content.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let current = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      record.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      record.push(current);
      if (record.some((cell) => cell.trim().length > 0)) rows.push(record);
      record = [];
      current = "";
    } else {
      current += char;
    }
  }
  record.push(current);
  if (record.some((cell) => cell.trim().length > 0)) rows.push(record);
  if (inQuotes) throw new AppError("CSV quotes are not balanced. Please check the file formatting.", "IMPORT_PARSE_FAILED", 400);
  if (rows.length === 0) throw new AppError("CSV header row is required.", "IMPORT_INVALID_HEADERS", 400);

  const headers = rows[0].map(normalizeHeader);
  if (headers.length === 0 || headers.some((header) => !header)) throw new AppError("CSV headers cannot be blank.", "IMPORT_INVALID_HEADERS", 400);
  if (new Set(headers).size !== headers.length) throw new AppError("CSV headers must be unique.", "IMPORT_INVALID_HEADERS", 400);

  const dataRows = rows.slice(1).map((cells, index) => {
    const row: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      row[header] = sanitizeImportValue(cells[columnIndex] ?? "");
    });
    return { row_number: index + 2, row };
  });
  if (dataRows.length > MAX_IMPORT_ROWS) throw new AppError("This import has too many rows. Please split it into smaller batches.", "IMPORT_TOO_MANY_ROWS", 413);
  return { headers, rows: dataRows };
};

export const validateHeaders = (headers: string[], template: ImportTemplate) => {
  const required = template.columns.filter((column) => column.required).map((column) => column.key);
  const missing = required.filter((key) => !headers.includes(key));
  if (missing.length > 0) {
    throw new AppError(`Missing required import columns: ${missing.join(", ")}.`, "IMPORT_INVALID_HEADERS", 400);
  }
  return {
    missing,
    extra: headers.filter((header) => !template.columns.some((column) => column.key === header)),
  };
};

export const templateToCsv = (template: ImportTemplate) => {
  const headers = template.columns.map((column) => column.key).join(",");
  const example = template.columns.map((column) => {
    const value = column.example ?? "";
    return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }).join(",");
  return `${headers}\n${example}\n`;
};
