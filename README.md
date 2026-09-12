# NextKitchen

MovingKitchen 是一款四人、多电脑、跨屏合作的体感做菜游戏。完整玩法见 [`SPEC.md`](./SPEC.md)。

## Multiplayer 与玩家身份开发资料

多人房间、Socket.IO/WebSocket 同步、玩家添加、人脸 enrollment、identity recognition、sticky identity、active-device lease 和 server authorization 的完整接入契约见：

- [`MULTIPLAYER_IDENTITY_INTEGRATION.md`](./MULTIPLAYER_IDENTITY_INTEGRATION.md)
- Reference repository: [Cactus-Std/multiplayer-identification](https://github.com/Cactus-Std/multiplayer-identification)

MovingKitchen repository 内还包含一份参考代码快照：

```text
reference/multiplayer-identification-prototype/
```

该目录包含 reference project 的 client、server、shared contracts、vision pipeline、tests、model assets、build scripts 和技术文档。它不包含原项目的 `.git` metadata，由 **MovingKitchen 自己的 Git repository** 作为普通源码目录跟踪和提交。

### 如何使用这份参考代码

1. 先读 `MULTIPLAYER_IDENTITY_INTEGRATION.md`，确定 MovingKitchen 自己的 domain model 和 event contracts。
2. 在本地快照中查看已经验证过的实现方式，尤其是 `packages/shared`、`apps/server/src/roomManager.ts`、`apps/server/src/socketHandlers.ts`、`apps/client/src/networking`、`apps/client/src/vision` 和相关 hooks。
3. 把需要的 pattern 或代码迁入 MovingKitchen 的正式目录，并根据厨房玩法调整；不要从正式代码通过相对路径 import 这个 reference directory，也不要把它配置成 workspace dependency。
4. 如需对照 reference project 的独立历史或获取后续更新，可另外 clone canonical repository：

   ```bash
   git clone https://github.com/Cactus-Std/multiplayer-identification.git
   ```

5. 若要独立运行仓库内的快照，在该目录执行 `npm install`，然后参考其中的 README。快照刻意不包含 `node_modules`、`dist`、`.env.local` 和生成的 MediaPipe/ONNX Runtime WASM；安装脚本会重新生成所需 runtime assets。

这份代码是 implementation reference，不是 MovingKitchen 最终架构的强制依赖。最终游戏可以采用不同 UI、state model、部署拓扑或 gameplay events，但应保留 shared typed contracts、authoritative server、local-only camera processing、identity/presence trust boundary 和跨设备控制权唯一性等核心方法论。

## Web UI 与玩法交互原型

仓库还包含当前可独立运行的游戏界面参考快照：

```text
reference/web-ui-prototype/
```

该目录包含完整的 Vite/Three.js 源码、锁文件、场景背景、annotated 坐标图和透明工具素材，可用于参考：

- Create/Join Room 与四人 Lobby 布局；
- 摄像头预览和录脸 UI 流程；
- 四个厨房场景的视觉布局与交互热区；
- 鼠标模拟手势、绿色悬停圆环、工具和单物品携带；
- 3D 番茄清洗、切菜、垃圾桶、有限水量和烤箱流程。

运行方式、当前范围和已知缺口见 [`reference/web-ui-prototype/README.md`](./reference/web-ui-prototype/README.md)。

此目录是 **implementation/UX reference**，不是正式架构或强制依赖。最终开发可以迁移其中的素材、坐标或玩法代码，也可以采用完全不同的 React/TypeScript 结构。正式代码不应通过相对路径依赖 reference 目录。多人状态、人脸 embedding、presence 与 server authorization 应以 [`MULTIPLAYER_IDENTITY_INTEGRATION.md`](./MULTIPLAYER_IDENTITY_INTEGRATION.md) 和 `reference/multiplayer-identification-prototype/` 为基线。
