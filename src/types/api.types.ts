export interface RequestContextVariables {
  requestId: string;
  authUser?: AuthActor;
  authSession?: AuthSessionContext;
  deviceAuth?: DeviceAuthContext;
}

export type AppContext = {
  Bindings: Env;
  Variables: RequestContextVariables;
};

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message: string;
}

export interface ApiErrorDetails {
  code: string;
  title: string;
  message: string;
  technicalMessage?: string;
  requestId: string;
  route?: string;
  method?: string;
  step?: string;
  status: number;
  retryable: boolean;
  suggestedAction?: string;
  fieldErrors?: Record<string, string>;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetails;
  data?: unknown;
  request_id?: string;
  requestId?: string;
  message?: string;
}

export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface ApiPaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: PaginationMeta;
  message?: string;
}

export interface ResponseOptions {
  headers?: HeadersInit;
  requestId?: string;
  route?: string;
  method?: string;
  step?: string;
  title?: string;
  retryable?: boolean;
  technicalMessage?: string;
  suggestedAction?: string;
  fieldErrors?: Record<string, string>;
  details?: unknown;
  data?: unknown;
}

export interface AuthActor {
  requestId?: string;
  companyId: string;
  actorUserId: string;
  fullName: string;
  email: string | null;
  roles: string[];
  roleKeys: string[];
  permissions: string[];
  outletIds: string[];
  isSuperAdmin: boolean;
  isAdmin: boolean;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuthSessionContext {
  id: string;
  tokenHash: string;
  expiresAt: string;
}

export interface DeviceAuthContext {
  requestId: string;
  companyId: string;
  deviceId: string;
  outletId: string | null;
  deviceType: string;
}
