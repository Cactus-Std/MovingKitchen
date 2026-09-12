# 本地 MediaPipe 资源

- `hand_landmarker.task`：Google MediaPipe Hand Landmarker float16 模型，第1版。
- 来源：https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
- 官方任务说明：https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker
- `wasm/*`：来自 npm `@mediapipe/tasks-vision@1.0.1`，与 package-lock.json 中运行库一致。保留SIMD、非SIMD及module文件以支持运行库选择。
- npm包声明许可：Apache-2.0。WASM的JS文件保留上游版权头。官方任务页面链接的[模型卡（第2页）](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20(Lite_Full)%20with%20Fairness%20Oct%202021.pdf)同样声明 Apache License, Version 2.0；许可全文见 `HAND_MODEL_LICENSE.txt`。
- 下载日期：2026-09-11（America/New_York）。这些是运行必需资源，不是临时验证文件。

更新运行库时必须同步更新WASM并重新验证模型初始化与实际推理，不能只升级 npm 包。

模型 SHA-256：`fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`。
