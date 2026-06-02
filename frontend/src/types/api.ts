export interface Pagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
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
}

export type StandardApiResponse<T> = ApiResponse<T> | ApiErrorResponse;
