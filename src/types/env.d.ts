declare global {
  interface Env {
    DB: D1Database;
    DOCUMENTS_BUCKET: R2Bucket;
    BACKUP_BUCKET: R2Bucket;
    REALTIME_ROOM: DurableObjectNamespace;
    ENVIRONMENT: string;
    APP_VERSION?: string;
    CORS_ALLOWED_ORIGINS?: string;
    SESSION_SECRET: string;
    JWT_SECRET: string;
    PASSWORD_PEPPER: string;
    PASSWORD_HASH_ITERATIONS?: string;
    DEVICE_TOKEN_SECRET: string;
    TOTP_ENCRYPTION_KEY: string;
    BOOTSTRAP_ADMIN_TOKEN?: string;
  }
}

export {};
