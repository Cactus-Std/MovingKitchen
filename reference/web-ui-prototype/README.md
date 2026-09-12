# MovingKitchen Web UI Prototype

这是 MovingKitchen 在黑客松期间制作的可运行 Web/鼠标交互原型。它用于展示和验证视觉布局、场景坐标、基础玩法与交互手感，供最终开发参考。

> 这是 reference snapshot，不是最终产品架构，也不是 `multiplayer-identification-prototype` 的替代品。正式开发可以复制、重构或完全重写这里的实现，不应从产品代码直接 import 此目录。

## 已实现内容

- Create/Join Room 起始页；
- 最多四名玩家的 Lobby、颜色、原位改名与录脸 UI；
- 浏览器摄像头预览；
- 储物＋水池、两块菜板、烤箱＋出餐四个场景；
- 鼠标模拟虚拟手和绿色悬停圆环；
- 单物品携带、工具拿取/归还；
- 3D 番茄旋转、局部污渍清洗和有限水量；
- 切菜、垃圾桶与浪费计数；
- Pizza 配料和烤箱基础流程；
- `BroadcastChannel` 多窗口状态同步。

## 尚未正式接入

- Lobby 的录脸按钮当前只模拟完成状态，未执行真实 embedding enrollment；
- Create/Join Room 尚未连接 Socket.IO server；
- 游戏状态目前使用 `localStorage` 与 `BroadcastChannel`，不是 authoritative multiplayer state；
- 手势输入仍由鼠标代替；
- 烤箱、卫生、成品切割等机制仍是简化版本。

正式接入人脸识别和多人网络时，请同时参考：

- [`../../MULTIPLAYER_IDENTITY_INTEGRATION.md`](../../MULTIPLAYER_IDENTITY_INTEGRATION.md)
- [`../multiplayer-identification-prototype/`](../multiplayer-identification-prototype/)

## 本地运行

要求 Node.js 20+。推荐使用 pnpm：

```bash
cd reference/web-ui-prototype
corepack enable
pnpm install
pnpm dev
```

也可以使用 npm：

```bash
cd reference/web-ui-prototype
npm install
npm run dev
```

打开终端显示的 Local 地址。主要页面：

```text
/#home     Create / Join Room
/#join     Player Lobby / face enrollment UI
/#sink     Storage + Sink
/#board1   Cutting Board 1
/#board2   Cutting Board 2
/#oven     Oven + Serving
```

摄像头测试请使用 `localhost` 并允许浏览器摄像头权限。

## 目录说明

```text
reference/web-ui-prototype/
├── index.html
├── package.json
├── pnpm-lock.yaml
├── public/assets/
│   ├── backgrounds/   # 场景背景与 annotated 坐标参考图
│   └── tools/         # 工具原图与透明 PNG
└── src/
    ├── main.js        # 当前 UI、状态与玩法逻辑
    └── style.css      # 背景坐标、交互热区和视觉样式
```

不要提交 `node_modules`、`dist`、`.pnpm-store`、系统缓存或本地摄像头数据。

## 如何用于最终开发

建议把本目录当作视觉和交互参考：

1. 复用 `public/assets` 中需要的图片素材；
2. 参考 `style.css` 中基于 1920×1080 标注图换算出的百分比热区；
3. 参考 `main.js` 中的清洗、切菜、工具、垃圾桶和 Lobby 流程；
4. 将本地状态更新改为 server command 与 canonical snapshot；
5. 将鼠标坐标替换为本地手势识别输出；
6. 将模拟录脸替换为 reference identity prototype 的真实 enrollment pipeline。

最终工程可以采用 React、TypeScript、不同组件结构或完全不同的状态模型。本 reference 的价值是保留已经讨论和测试过的体验，而不是限制最终实现。
