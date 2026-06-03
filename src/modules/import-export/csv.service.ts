export const toCsv = (rows: Record<string, unknown>[]): string => {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0] ?? {});
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
};

export const parseCsvPreview = (content: string) => {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = lines[0]?.split(",").map((header) => header.trim()) ?? [];
  return {
    total_rows: Math.max(0, lines.length - 1),
    valid_rows: headers.length > 0 ? Math.max(0, lines.length - 1) : 0,
    invalid_rows: headers.length > 0 ? 0 : Math.max(0, lines.length - 1),
    errors: headers.length > 0 ? [] : [{ row: 1, message: "Header row is required." }],
  };
};
