import { Hono } from "hono";

import * as authController from "../modules/auth/auth.controller";
import type { AppContext } from "../types/api.types";
import { authMiddleware } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";

const authRoutes = new Hono<AppContext>();

authRoutes.post("/auth/login", authController.login);
authRoutes.post("/auth/forgot-password", authController.forgotPassword);
authRoutes.post("/auth/reset-password", authController.resetPassword);
authRoutes.post("/auth/2fa/verify", authController.verifyLoginTwoFactor);

authRoutes.post("/auth/logout", authMiddleware, authController.logout);
authRoutes.get("/auth/me", authMiddleware, authController.authMe);
authRoutes.get("/auth/sessions", authMiddleware, requirePermission("auth.sessions.view_own"), authController.listSessions);
authRoutes.post("/auth/sessions/:id/revoke", authMiddleware, requirePermission("auth.sessions.revoke_own"), authController.revokeSession);
authRoutes.post("/auth/change-password", authMiddleware, authController.changePassword);
authRoutes.post("/auth/2fa/setup", authMiddleware, authController.setupTwoFactor);
authRoutes.post("/auth/2fa/confirm", authMiddleware, authController.verifyTwoFactor);
authRoutes.post("/auth/2fa/disable", authMiddleware, authController.disableTwoFactor);
authRoutes.post("/auth/2fa/backup-code", authMiddleware, authController.useBackupCode);

authRoutes.get("/me", authMiddleware, authController.myProfile);
authRoutes.get("/me/security", authMiddleware, authController.mySecurity);
authRoutes.get("/me/sessions", authMiddleware, requirePermission("auth.sessions.view_own"), authController.listSessions);
authRoutes.post("/me/sessions/:id/revoke", authMiddleware, requirePermission("auth.sessions.revoke_own"), authController.revokeSession);
authRoutes.get("/me/2fa/status", authMiddleware, authController.twoFactorStatus);
authRoutes.post("/me/change-password", authMiddleware, authController.changePassword);
authRoutes.post("/me/2fa/setup", authMiddleware, authController.setupTwoFactor);
authRoutes.post("/me/2fa/verify", authMiddleware, authController.verifyTwoFactor);
authRoutes.post("/me/2fa/confirm", authMiddleware, authController.verifyTwoFactor);
authRoutes.post("/me/2fa/disable", authMiddleware, authController.disableTwoFactor);
authRoutes.get("/me/kyc-requests", authMiddleware, authController.listKycRequests);
authRoutes.post("/me/kyc-requests", authMiddleware, authController.createKycRequest);
authRoutes.get("/me/kyc-requests/:id", authMiddleware, authController.getKycRequest);

export { authRoutes };
