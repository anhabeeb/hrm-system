import { Hono } from "hono";

import * as controller from "../modules/bootstrap/bootstrap.controller";
import type { AppContext } from "../types/api.types";

const bootstrapRoutes = new Hono<AppContext>();

bootstrapRoutes.get("/status", controller.status);
bootstrapRoutes.post("/initialize", controller.initialize);
bootstrapRoutes.post("/super-admin", controller.initialize);

export { bootstrapRoutes };
