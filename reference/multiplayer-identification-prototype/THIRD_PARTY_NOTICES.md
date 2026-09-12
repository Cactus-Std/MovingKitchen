# Third-Party Notices

This project currently contains application dependencies distributed under their respective open-source licenses. See `package-lock.json` after installation for the resolved dependency tree.

## MediaPipe Tasks Vision and BlazeFace

- **Runtime:** `@mediapipe/tasks-vision` 0.10.35, copied from the installed npm package and served from the application origin.
- **Detection model:** MediaPipe BlazeFace short-range, float16 version 1.
- **Source:** `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`
- **SHA-256:** `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f`
- **License:** Apache License 2.0, as stated in the official BlazeFace short-range model card.
- **Input:** 128 × 128 RGB values normalized to `[-1, 1]`; MediaPipe performs preprocessing.
- **Output:** face bounding boxes, six approximate facial keypoints, and detection confidence.

The detector is used only to locate faces locally. It does not identify a person.

## Face embedding model

### FaceX Tiny recognition model

- **Model:** FaceX Tiny MobileFaceNet recognition weights from `facex-engine/facex`, repository commit `af7ca9937705a10901ca4b72c4eb19ef49a4ac53`.
- **Source:** `https://github.com/facex-engine/facex`
- **Bundled file:** `apps/client/public/models/facex_tiny.enc`
- **SHA-256:** `ed7e3fa87363eb67c4963dadf8718ec8f02eeda6bd0d57869ba6cb4e6f53fd05`
- **License:** Apache License 2.0, covering the project's custom code and model weights as stated by the upstream repository.
- **Input:** one aligned 112 × 112 RGB face, planar CHW layout, normalized with `(channel - 127.5) / 128`.
- **Output:** a 512-dimensional L2-normalized face embedding.

The encrypted upstream model file is decrypted locally with WebCrypto immediately before it is handed to ONNX Runtime. The temporary plaintext JavaScript buffer is zeroed after session creation. Encryption is packaging, not a security boundary.

### ONNX Runtime Web

- **Runtime:** `onnxruntime-web` 1.29.0.
- **Source:** `https://github.com/microsoft/onnxruntime`
- **License:** MIT.

The application serves the required WASM runtime files from its own origin. Face crops and camera frames remain in the browser; only the resulting embedding can be synchronized through the room server.
