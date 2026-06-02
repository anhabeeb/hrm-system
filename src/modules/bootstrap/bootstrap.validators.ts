import { ValidationError } from "../../utils/errors";

import { DEFAULT_COUNTRY, DEFAULT_CURRENCY, DEFAULT_TIMEZONE, BOOTSTRAP_MESSAGES } from "./bootstrap.constants";
import type { BootstrapInitializeInput } from "./bootstrap.types";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const asBool = (value: unknown): boolean | undefined =>
  value === true || value === "true" ? true : value === false || value === "false" ? false : undefined;

const requireString = (value: unknown, message: string): string => {
  const parsed = asString(value);
  if (!parsed) throw new ValidationError(message);
  return parsed;
};

export const isStrongBootstrapPassword = (password: string): boolean =>
  password.length >= 12 &&
  /[A-Z]/.test(password) &&
  /[a-z]/.test(password) &&
  /\d/.test(password) &&
  /[^A-Za-z0-9]/.test(password);

export const validateBootstrapInitialize = (payload: unknown): BootstrapInitializeInput => {
  if (!isObject(payload) || !isObject(payload.company) || !isObject(payload.super_admin)) {
    throw new ValidationError();
  }

  const email = requireString(payload.super_admin.email, "Email is required.").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("Please enter a valid email address.");
  }

  const password = requireString(payload.super_admin.password, BOOTSTRAP_MESSAGES.weakPassword);
  if (!isStrongBootstrapPassword(password)) {
    throw new ValidationError(BOOTSTRAP_MESSAGES.weakPassword);
  }

  const outlet = isObject(payload.outlet) ? {
    outlet_name: requireString(payload.outlet.outlet_name, "Outlet name is required."),
    outlet_code: asString(payload.outlet.outlet_code) ?? null,
    is_primary: asBool(payload.outlet.is_primary) ?? true,
  } : undefined;

  return {
    company: {
      company_name: requireString(payload.company.company_name, "Company name is required."),
      legal_name: asString(payload.company.legal_name) ?? null,
      registration_number: asString(payload.company.registration_number) ?? null,
      country: asString(payload.company.country) ?? DEFAULT_COUNTRY,
      timezone: asString(payload.company.timezone) ?? DEFAULT_TIMEZONE,
      currency: asString(payload.company.currency) ?? DEFAULT_CURRENCY,
    },
    super_admin: {
      full_name: requireString(payload.super_admin.full_name, "Full name is required."),
      email,
      password,
    },
    outlet,
  };
};
