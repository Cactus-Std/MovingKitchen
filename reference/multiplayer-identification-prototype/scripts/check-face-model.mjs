import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import * as ort from 'onnxruntime-web';

const modelPath = new URL(
  '../apps/client/public/models/facex_tiny.enc',
  import.meta.url,
);
const keyPartOne = Uint8Array.from([
  0x42, 0x8a, 0x2f, 0x98, 0xd7, 0x28, 0xae, 0x22, 0x71, 0x37, 0x44, 0x91, 0x23,
  0xef, 0x65, 0xcd, 0xb5, 0xc0, 0xfb, 0xcf, 0xec, 0x4d, 0x3b, 0x2f, 0xe9, 0xb5,
  0xdb, 0xa5, 0x81, 0x89, 0xdb, 0xbc,
]);
const keyPartTwo = Uint8Array.from([
  0xb7, 0x4d, 0xb2, 0x24, 0xec, 0x76, 0x04, 0xe4, 0xcb, 0x46, 0xc8, 0x02, 0x97,
  0x3c, 0x33, 0xfa, 0x8b, 0xb0, 0x11, 0x60, 0x0c, 0xd5, 0x02, 0xf3, 0xac, 0xb8,
  0x62, 0x0c, 0xf3, 0xad, 0x54, 0x01,
]);

const encrypted = new Uint8Array(await readFile(modelPath));
const keyBytes = keyPartOne.map(
  (value, index) => value ^ (keyPartTwo[index] ?? 0),
);
const key = await webcrypto.subtle.importKey(
  'raw',
  keyBytes,
  { name: 'AES-GCM' },
  false,
  ['decrypt'],
);
const modelBytes = new Uint8Array(
  await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: encrypted.subarray(0, 12) },
    key,
    encrypted.subarray(12),
  ),
);
const session = await ort.InferenceSession.create(modelBytes, {
  executionProviders: ['wasm'],
});

console.log(
  `Face model ready: ${session.inputNames.join(', ')} -> ${session.outputNames.join(', ')} (${modelBytes.length} decrypted bytes)`,
);

session.release();
modelBytes.fill(0);
keyBytes.fill(0);
