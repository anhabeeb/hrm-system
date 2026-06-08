export const putBackupObject = async (env: Env, companyId: string, body: string) => {
  const fileKey = `backups/${companyId}/${crypto.randomUUID()}.json`;
  if (!env.BACKUP_BUCKET) {
    return { fileKey: null, fileName: fileKey.split("/").pop() ?? "backup.json", fileSize: body.length };
  }
  await env.BACKUP_BUCKET.put(fileKey, body, { httpMetadata: { contentType: "application/json" } });
  return { fileKey, fileName: fileKey.split("/").pop() ?? "backup.json", fileSize: body.length };
};

export const getBackupObject = (env: Env, fileKey: string) => env.BACKUP_BUCKET?.get(fileKey) ?? null;
