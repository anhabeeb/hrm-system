export interface Pagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface ApiErrorPayload {
  code: string;
  title?: string;
  message: string;
  technicalMessage?: string;
  requestId?: string;
  route?: string;
  method?: string;
  step?: string;
  status?: number;
  retryable?: boolean;
  suggestedAction?: string;
  fieldErrors?: Record<string, string>;
  details?: unknown;
}

export interface ApiResponse<T> {
  success: true;
  data: T;
  pagination?: Pagination;
  message?: string;
  request_id?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorPayload;
  request_id?: string;
  requestId?: string;
  message?: string;
}

export type StandardApiResponse<T> = ApiResponse<T> | ApiErrorResponse;
