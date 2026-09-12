import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mediaPipeSourceDirectory = resolve(
  repositoryRoot,
  'node_modules/@mediapipe/tasks-vision/wasm',
);
const mediaPipeTargetDirectory = resolve(
  repositoryRoot,
  'apps/client/public/mediapipe',
);
const mediaPipeAssets = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_module_internal.js',
  'vision_wasm_module_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

const onnxSourceDirectory = resolve(
  repositoryRoot,
  'node_modules/onnxruntime-web/dist',
);
const onnxTargetDirectory = resolve(
  repositoryRoot,
  'apps/client/public/onnxruntime',
);
const onnxAssets = [
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
];

await Promise.all([
  mkdir(mediaPipeTargetDirectory, { recursive: true }),
  mkdir(onnxTargetDirectory, { recursive: true }),
]);
await Promise.all(
  mediaPipeAssets.map((asset) =>
    copyFile(
      resolve(mediaPipeSourceDirectory, asset),
      resolve(mediaPipeTargetDirectory, asset),
    ),
  ),
);
await Promise.all(
  onnxAssets.map((asset) =>
    copyFile(
      resolve(onnxSourceDirectory, asset),
      resolve(onnxTargetDirectory, asset),
    ),
  ),
);

console.log(
  `Copied ${mediaPipeAssets.length} MediaPipe and ${onnxAssets.length} ONNX runtime assets.`,
);
