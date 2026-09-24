import { buildApp } from "./app.js";
import { db } from "./lib/db.js";

const app = await buildApp();

try {
  const { config } = await import("./config.js");
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  app.log.info(`showplan api listening on ${config.PORT}`);
  try {
    const [items, packages] = await Promise.all([
      db.item.count(),
      db.packageTemplate.count(),
    ]);
    app.log.info({ items, packages }, "catalogue");
    if (items === 0) {
      app.log.warn(
        "catalogue is empty — palette will have nothing to place. " +
          "Run: npm run import:catalogue -- ./bundle",
      );
    }
  } catch (err) {
    app.log.error(err, "catalogue count failed");
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    app.log.info(`${signal} received, closing`);
    void app.close().then(() => process.exit(0));
  });
}
