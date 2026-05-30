declare global {
  interface Env {
    DB: D1Database;
    DOCUMENTS_BUCKET: R2Bucket;
    BACKUP_BUCKET: R2Bucket;
    REALTIME_ROOM: DurableObjectNamespace;
    ENVIRONMENT: string;
    SESSION_SECRET: string;
    JWT_SECRET: string;
    PASSWORD_PEPPER: string;
    DEVICE_TOKEN_SECRET: string;
    TOTP_ENCRYPTION_KEY: string;
  }
}

export {};
