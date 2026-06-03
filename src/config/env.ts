import { APP_NAME } from "./constants";

export const getEnvironment = (env: Env): string =>
  env.ENVIRONMENT?.trim() || "local";

export const isProduction = (env: Env): boolean =>
  getEnvironment(env) === "production";

export const getRuntimeInfo = (env: Env) => ({
  status: "ok" as const,
  service: APP_NAME,
  environment: getEnvironment(env),
});
