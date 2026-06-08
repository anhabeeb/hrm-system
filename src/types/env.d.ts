declare global {
  interface Env {
    DB: D1Database;
    ASSETS?: Fetcher;
    DOCUMENTS_BUCKET: R2Bucket;
    BACKUP_BUCKET: R2Bucket;
    REALTIME_ROOM: DurableObjectNamespace;
    ENVIRONMENT: string;
    APP_VERSION?: string;
    GIT_BRANCH?: string;
    GIT_COMMIT_SHA?: string;
    BUILD_TIMESTAMP?: string;
    CORS_ALLOWED_ORIGINS?: string;
    SESSION_SECRET: string;
    JWT_SECRET: string;
    PASSWORD_PEPPER: string;
    PASSWORD_HASH_ITERATIONS?: string;
    DEVICE_TOKEN_SECRET: string;
    TOTP_ENCRYPTION_KEY: string;
    BOOTSTRAP_ADMIN_TOKEN?: string;
    EMAIL_NOTIFICATIONS_ENABLED?: string;
    EMAIL_PROVIDER?: string;
    EMAIL_FROM_ADDRESS?: string;
    EMAIL_FROM_NAME?: string;
    EMAIL_REPLY_TO?: string;
    EMAIL_DRY_RUN?: string;
    RESEND_API_KEY?: string;
  }
}

export {};
