import type {
  ApiErrorResponse,
  ApiPaginatedResponse,
  ApiSuccessResponse,
  PaginationMeta,
  ResponseOptions,
} from "../types/api.types";

import { UNKNOWN_ERROR_MESSAGE } from "../config/constants";

const createHeaders = (options: ResponseOptions = {}): Headers => {
  const headers = new Headers(options.headers);

  if (options.requestId) {
    headers.set("x-request-id", options.requestId);
  }

  return headers;
};

const json = <T>(
  payload: T,
  status: number,
  options: ResponseOptions = {},
): Response =>
  Response.json(payload, {
    status,
    headers: createHeaders(options),
  });

export const ok = <T>(
  data: T,
  message = "Request completed successfully.",
  options: ResponseOptions = {},
): Response => {
  const payload: ApiSuccessResponse<T> = {
    success: true,
    data,
    message,
  };

  return json(payload, 200, options);
};

export const created = <T>(
  data: T,
  message = "Created successfully.",
  options: ResponseOptions = {},
): Response => {
  const payload: ApiSuccessResponse<T> = {
    success: true,
    data,
    message,
  };

  return json(payload, 201, options);
};

export const paginated = <T>(
  data: T[],
  pagination: PaginationMeta,
  message = "Request completed successfully.",
  options: ResponseOptions = {},
): Response => {
  const payload: ApiPaginatedResponse<T> = {
    success: true,
    data,
    pagination,
    message,
  };

  return json(payload, 200, options);
};

export const errorResponse = (
  status: number,
  code: string,
  message: string,
  options: ResponseOptions = {},
): Response => {
  const payload: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
    },
    ...(options.requestId ? { request_id: options.requestId } : {}),
  };

  return json(payload, status, options);
};

export const badRequest = (
  message = "We could not process this request. Please review the details and try again.",
  code = "BAD_REQUEST",
  options: ResponseOptions = {},
): Response => errorResponse(400, code, message, options);

export const unauthorized = (
  message = "Please sign in to continue.",
  code = "UNAUTHORIZED",
  options: ResponseOptions = {},
): Response => errorResponse(401, code, message, options);

export const forbidden = (
  message = "You do not have permission to perform this action.",
  code = "FORBIDDEN",
  options: ResponseOptions = {},
): Response => errorResponse(403, code, message, options);

export const notFound = (
  message = "The requested record could not be found.",
  code = "NOT_FOUND",
  options: ResponseOptions = {},
): Response => errorResponse(404, code, message, options);

export const conflict = (
  message = "This action could not be completed because the data is already in use or has changed.",
  code = "CONFLICT",
  options: ResponseOptions = {},
): Response => errorResponse(409, code, message, options);

export const serverError = (
  message = UNKNOWN_ERROR_MESSAGE,
  options: ResponseOptions = {},
): Response => errorResponse(500, "SERVER_ERROR", message, options);
