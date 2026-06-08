export const sanitizeDownloadFileName = (fileName: string | null | undefined, fallback = "download"): string => {
  const raw = String(fileName ?? fallback).trim() || fallback;
  const baseName = raw
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f"<>:|?*\r\n]/g, "_")
    .replace(/^\.+$/, "")
    .slice(0, 180)
    .trim();

  return baseName || fallback;
};

export const safeAttachmentHeader = (fileName: string | null | undefined, fallback = "download"): string => {
  const safeName = sanitizeDownloadFileName(fileName, fallback);
  const encodedName = encodeURIComponent(safeName).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${safeName.replace(/"/g, "_")}"; filename*=UTF-8''${encodedName}`;
};
