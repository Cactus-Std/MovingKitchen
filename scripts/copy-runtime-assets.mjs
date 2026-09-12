import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
for (const [source, target] of [
  ["@mediapipe/tasks-vision/wasm", "models/wasm"],
  ["@mediapipe/face-vision/wasm", "mediapipe"],
]) {
  await cp(
    resolve(root, "node_modules", source),
    resolve(root, "apps/client/public", target),
    { recursive: true },
  );
}
const onnx = resolve(root, "node_modules/onnxruntime-web/dist");
const target = resolve(root, "apps/client/public/onnxruntime");
await mkdir(target, { recursive: true });
for (const file of [
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
])
  await cp(resolve(onnx, file), resolve(target, file));
console.log("Copied matching hand, face, and ONNX runtime assets.");
