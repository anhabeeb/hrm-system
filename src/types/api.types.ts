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
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetails;
  request_id?: string;
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
