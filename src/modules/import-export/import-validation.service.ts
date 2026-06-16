import { ValidationError } from "../../utils/errors";

type ImportValidationError = { row: number; message: string };
type ImportValidationResult = { total_rows: number; valid_rows: number; invalid_rows: number; errors: ImportValidationError[]; preview_rows: Record<string, string>[] };

const excelMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const requiredHeaders: Record<string, string[]> = {
  employees: ["employee_no", "full_name"],
  attendance_manual: ["employee_no", "date"],
  leave_balances: ["employee_no", "leave_type"],
  assets: ["employee_no", "asset_name"],
  uniforms: ["employee_no", "uniform_type"],
  documents_metadata: ["employee_no", "document_type"],
};

const decoder = new TextDecoder();
const readUint16 = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8);
const readUint32 = (bytes: Uint8Array, offset: number) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const unescapeXml = (value: string) => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const columnIndex = (letters: string) => {
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
};

const inflateRaw = async (bytes: Uint8Array) => {
  if (typeof DecompressionStream === "undefined") {
    throw new ValidationError("Excel parsing is not available in this runtime.");
  }
  const stream = new Response(bytes).body;
  if (!stream) throw new ValidationError("Excel workbook could not be parsed.");
  const inflated = stream.pipeThrough(new DecompressionStream("deflate-raw" as any));
  return new Uint8Array(await new Response(inflated).arrayBuffer());
};

const readZipEntries = async (bytes: Uint8Array) => {
  if (bytes.length < 4 || readUint32(bytes, 0) !== 0x04034b50) {
    throw new ValidationError("The uploaded file is not a valid Excel workbook.");
  }
  const entries = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 30 <= bytes.length && readUint32(bytes, offset) === 0x04034b50) {
    const flags = readUint16(bytes, offset + 6);
    const method = readUint16(bytes, offset + 8);
    const compressedSize = readUint32(bytes, offset + 18);
    const nameLength = readUint16(bytes, offset + 26);
    const extraLength = readUint16(bytes, offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    if ((flags & 0x08) !== 0 || compressedSize === 0xffffffff) {
      throw new ValidationError("This Excel workbook uses an unsupported ZIP layout. Please use the provided template.");
    }
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    const content = method === 0 ? compressed : method === 8 ? await inflateRaw(compressed) : null;
    if (content) entries.set(name, content);
    offset = dataStart + compressedSize;
  }
  return entries;
};

const extractSharedStrings = (xml?: string) => {
  if (!xml) return [];
  const strings: string[] = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = siRegex.exec(xml))) {
    const text = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => unescapeXml(part[1])).join("");
    strings.push(text);
  }
  return strings;
};

const cellValue = (cellXml: string, cellType: string | undefined, sharedStrings: string[]) => {
  const inline = cellXml.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1];
  if (inline !== undefined) return unescapeXml(inline).trim();
  const raw = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
  if (cellType === "s") return (sharedStrings[Number(raw)] ?? "").trim();
  return unescapeXml(raw).trim();
};

const parseWorksheet = (sheetXml: string, sharedStrings: string[]) => {
  const rows: string[][] = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(sheetXml))) {
    const row: string[] = [];
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
      const attrs = cellMatch[1];
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const index = ref ? columnIndex(ref) : row.length;
      row[index] = cellValue(cellMatch[2], type, sharedStrings);
    }
    if (row.some((value) => value?.trim())) rows.push(row);
  }
  return rows;
};

export const validateImportContent = async (content: Uint8Array, mimeType: string, importType: string): Promise<ImportValidationResult> => {
  if (mimeType !== excelMime) {
    throw new ValidationError("Only Excel .xlsx import files are supported.");
  }
  const entries = await readZipEntries(content);
  const sheetEntry = [...entries.keys()].find((key) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(key));
  if (!sheetEntry) throw new ValidationError("The Excel workbook does not contain a worksheet.");
  const sharedStrings = extractSharedStrings(entries.has("xl/sharedStrings.xml") ? decoder.decode(entries.get("xl/sharedStrings.xml")) : undefined);
  const rows = parseWorksheet(decoder.decode(entries.get(sheetEntry)), sharedStrings);
  if (rows.length === 0) throw new ValidationError("The Excel workbook is empty.");

  const headers = rows[0].map((header) => normalizeHeader(header));
  const expected = requiredHeaders[importType] ?? ["employee_no"];
  const missing = expected.filter((header) => !headers.includes(header));
  const dataRows = rows.slice(1).filter((row) => row.some((value) => value?.trim()));
  const errors: ImportValidationError[] = [];
  if (missing.length > 0) {
    errors.push({ row: 1, message: `Missing required column(s): ${missing.join(", ")}.` });
  }

  const employeeNoIndex = headers.indexOf("employee_no");
  const previewRows: Record<string, string>[] = [];
  let validRows = 0;
  dataRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const mapped = Object.fromEntries(headers.map((header, cellIndex) => [header || `column_${cellIndex + 1}`, row[cellIndex] ?? ""]));
    if (previewRows.length < 10) previewRows.push(mapped);
    if (employeeNoIndex >= 0 && !(row[employeeNoIndex] ?? "").trim()) {
      errors.push({ row: rowNumber, message: "Employee number is required." });
      return;
    }
    validRows += missing.length > 0 ? 0 : 1;
  });

  return {
    total_rows: dataRows.length,
    valid_rows: validRows,
    invalid_rows: errors.length,
    errors,
    preview_rows: previewRows,
  };
};
