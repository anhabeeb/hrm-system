# Phase 13B Security Hardening

This note documents the current HRM security model for developers and reviewers. It is not exposed as an application page.

## Auth And Sessions

- User sessions use random session tokens and store only HMAC/PBKDF-derived token hashes in D1.
- Session cookies are `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`.
- Login uses generic failure messaging and tracks failed attempts with account lockout.
- Password hashing uses the project password service with `PASSWORD_PEPPER` from Worker secrets.
- Password change verifies the current password and revokes other sessions.
- Password reset tokens are hashed at rest, expire, and are marked used after reset.
- TOTP secrets are stored encrypted/protected, and backup codes are hashed.

## Browser Request Safety

- API responses include security headers such as `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Content-Security-Policy`, `Permissions-Policy`, and no-store API cache control.
- CORS uses an explicit allowlist from defaults plus `CORS_ALLOWED_ORIGINS`; wildcard credentialed CORS is not allowed.
- Cookie-auth mutating requests reject disallowed `Origin` values and simple form/text content types.
- Device-token endpoints remain separated from cookie CSRF checks.

## Sensitive Data Policy

- API DTOs must omit or redact password hashes, reset/session tokens, TOTP secrets, backup codes, device tokens/hashes, raw biometric payloads, R2 storage keys, provider secrets, and unsafe metadata.
- Payroll, identity, document, audit, export, backup, and timeline paths must sanitize metadata before response/log/export.
- Security-critical download routes re-check permission/scope and use sanitized `Content-Disposition` filenames.

## Device And File Security

- Device tokens are hashed at rest, and raw tokens are only surfaced during registration/rotation flows.
- Revoked/suspended device handling remains enforced by device auth services.
- Document, export, and backup downloads use safe filenames, no-store cache control, and permission checks at download time.
- Malware scanning is not implemented in this phase; file type and size validation remain the current safeguards.

## Import/Export/Backup/Restore/Archive

- Export uses source-report permission and scope, redacts sensitive columns, and protects CSV formula injection.
- Import preview masks sensitive fields, and apply enforces target module permissions and scope.
- Backup snapshots exclude secrets/tokens/raw payloads, verify stable content, and downloads re-check permission.
- Restore validates checksum/company/schema and requires confirmation plus strong permissions.
- Data retention archive/restore requires reason/confirmation and backup presence where configured.

## Known Limits

- Durable global rate limiting is not introduced in Phase 13B; auth failed-attempt tracking and verifier checks cover the highest-risk existing flows.
- Server-side malware scanning and full CSP tuning for any future non-API static hosting remain future hardening topics.
