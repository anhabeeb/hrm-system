declare module "*.mjs" {
  export const buildPermissionAuditInventory: (baseDir?: string) => {
    route_inventory: Array<Record<string, unknown>>;
    backend_permissions: string[];
    frontend_permissions: string[];
    seeded_permissions: string[];
    route_allowlist: string[];
  };
  export const extractExplicitPermissions: (
    files: string[],
    baseDir?: string,
  ) => Map<string, Set<string>>;
  export const extractSeededPermissions: (baseDir?: string) => Set<string>;
  export const verifyPermissionAudit: (baseDir?: string) => {
    ok: boolean;
    failures: string[];
    warnings: string[];
    inventory_summary: {
      routes: number;
      backend_permissions: number;
      frontend_permissions: number;
      seeded_permissions: number;
      public_allowlist: string[];
    };
  };
  export const smokeChecks: Array<{
    label: string;
    path: string;
    kind: string;
    expectedStatus?: number;
    target?: string;
    method?: string;
  }>;
  export const protectedApiPaths: string[];
  export const classifySmokeResponse: (
    check: { label: string; path: string; kind: string; expectedStatus?: number },
    response: {
      status: number;
      contentType?: string;
      body?: string;
      headers?: Record<string, string>;
    },
  ) => { ok: boolean; reason: string };
  export const validateAcceptanceConfig: (
    env?: Record<string, string | undefined>,
  ) => { ok: boolean; reason: string };
  export const runStagingAcceptance: (options?: {
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
    logger?: Pick<Console, "log" | "error">;
  }) => Promise<{ ok: boolean; results: Array<Record<string, unknown>> }>;
}
