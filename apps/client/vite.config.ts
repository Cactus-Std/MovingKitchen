import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "local-onnx-runtime",
      configureServer(server) {
        // ONNX dynamically imports these public modules; they must bypass Vite transforms.
        server.middlewares.use((req, res, next) => {
          const path = req.url?.split("?")[0];
          if (
            ![
              "/onnxruntime/ort-wasm-simd-threaded.mjs",
              "/onnxruntime/ort-wasm-simd-threaded.jsep.mjs",
            ].includes(path ?? "")
          )
            return next();
          void readFile(new URL(`./public${path}`, import.meta.url))
            .then((content) => {
              res.setHeader("Content-Type", "text/javascript");
              res.end(content);
            })
            .catch(() => {
              res.statusCode = 500;
              res.end("Local ONNX runtime missing. Run npm install.");
            });
        });
      },
    },
  ],
  resolve: { conditions: ["onnxruntime-web-use-extern-wasm"] },
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      "/socket.io": { target: "http://127.0.0.1:3001", ws: true },
      "/health": "http://127.0.0.1:3001",
      "/api": "http://127.0.0.1:3001",
    },
  },
});
