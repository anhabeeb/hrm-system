import type {
  ApiErrorResponse,
  ApiPaginatedResponse,
  ApiSuccessResponse,
  PaginationMeta,
  ResponseOptions,
} from "../types/api.types";

import { UNKNOWN_ERROR_MESSAGE } from "../config/constants";
import type { AppError } from "./errors";

const titleFromCode = (code: string): string =>
  code
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

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
  const requestId = options.requestId ?? "req_unavailable";
  const payload: ApiErrorResponse = {
    success: false,
    message,
    data: options.data,
    error: {
      code,
      title: options.title ?? titleFromCode(code),
      message,
      technicalMessage: options.technicalMessage,
      requestId,
      route: options.route,
      method: options.method,
      step: options.step,
      status,
      retryable: options.retryable ?? status >= 500,
      suggestedAction: options.suggestedAction,
      fieldErrors: options.fieldErrors,
      details: options.details,
    },
    request_id: requestId,
    requestId,
  };

  return json(payload, status, options);
};

export const appErrorResponse = (
  error: AppError,
  options: ResponseOptions = {},
): Response =>
  errorResponse(error.statusCode, error.code, error.message, {
    ...options,
    title: error.title,
    retryable: error.retryable,
    technicalMessage: error.technicalMessage,
    suggestedAction: error.suggestedAction,
    step: error.step ?? options.step,
    fieldErrors: error.fieldErrors,
    details: error.details,
  });

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
