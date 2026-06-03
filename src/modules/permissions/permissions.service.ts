import * as permissionsRepository from "./permissions.repository";
import type { AuthActor } from "../../types/api.types";

export const listPermissions = (_env: Env, _context: AuthActor) =>
  permissionsRepository.listPermissions(_env);
