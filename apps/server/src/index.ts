import { fileURLToPath } from "node:url";
import { createGameServer } from "./server.js";
const production = process.env.NODE_ENV === "production";
const server = createGameServer({
  allowDebug:
    process.env.ALLOW_DEBUG_IDENTITY === "true" ||
    (!production && process.env.ALLOW_DEBUG_IDENTITY !== "false"),
  origins:
    process.env.CLIENT_ORIGINS?.split(",").map((s) => s.trim()) ??
    (production
      ? [
          `http://localhost:${process.env.PORT ?? 3001}`,
          `http://127.0.0.1:${process.env.PORT ?? 3001}`,
        ]
      : undefined),
  staticDir: production
    ? fileURLToPath(new URL("../../client/dist/", import.meta.url))
    : undefined,
});
server.http.listen(
  Number(process.env.PORT ?? 3001),
  process.env.HOST ?? "0.0.0.0",
  () => console.log(`Moving Kitchen listening on ${process.env.PORT ?? 3001}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
