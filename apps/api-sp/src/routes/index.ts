import type { FastifyInstance } from "fastify";
import { healthRoutes } from "./health.js";
import { authRoutes } from "./auth.js";
import { projectRoutes } from "./projects.js";
import { basemapRoutes } from "./basemap.js";
import { catalogueRoutes } from "./catalogue.js";
import { instanceRoutes } from "./instances.js";
import { showItemRoutes } from "./show-items.js";
import { measurementRoutes } from "./measurements.js";
import { boqRoutes } from "./boq.js";

/**
 * Every route lives under /api/* except the health probes, which sit at the
 * root so platform health checks need no prefix knowledge.
 *
 * As slices land, register them here.
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(projectRoutes, { prefix: "/api/projects" });
  await app.register(basemapRoutes, { prefix: "/api/projects" });
  await app.register(instanceRoutes, { prefix: "/api/projects" });
  await app.register(showItemRoutes, { prefix: "/api/projects" });
  await app.register(measurementRoutes, { prefix: "/api/projects" });
  await app.register(boqRoutes, { prefix: "/api/projects" });
  await app.register(catalogueRoutes, { prefix: "/api/catalogue" });

  app.get("/api/version", async () => ({
    name: "showplan",
    version: process.env.npm_package_version ?? "0.1.0",
    commit: process.env.RENDER_GIT_COMMIT ?? "local",
  }));
}
