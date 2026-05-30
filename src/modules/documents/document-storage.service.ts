import type { DocumentUploadInput } from "./documents.types";
import { createPrefixedId } from "../../utils/ids";

export const decodeDocumentBase64 = (value: string): Uint8Array => {
  let binary = "";
  try {
    binary = atob(value);
  } catch {
    throw new Error("invalid_base64");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

export const buildDocumentKey = (companyId: string, employeeId: string, fileName: string) =>
  `${companyId}/employees/${employeeId}/${createPrefixedId("doc_file")}-${fileName.replace(/[^A-Za-z0-9._-]/g, "_")}`;

export const storeDocument = async (env: Env, companyId: string, input: DocumentUploadInput) => {
  const fileKey = buildDocumentKey(companyId, input.employee_id, input.file_name);
  const bytes = decodeDocumentBase64(input.content_base64!);
  if (bytes.byteLength === 0) throw new Error("empty_file");
  await env.DOCUMENTS_BUCKET.put(fileKey, bytes, {
    httpMetadata: { contentType: input.mime_type },
    customMetadata: { employee_id: input.employee_id, document_type: input.document_type },
  });
  return fileKey;
};

export const loadDocument = (env: Env, fileKey: string) => env.DOCUMENTS_BUCKET.get(fileKey);
