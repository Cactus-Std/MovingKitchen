# MovingKitchen 旁观者模式 Spec

> 状态：Approved Scope / Implementation Spec  
> 适用对象：MovingKitchen 前端、后端、Shared Contracts、QA 与产品设计  
> 范围决定：实施 Phase 1 与 Phase 2；Phase 3 仅保留为未来观察项，不进入当前交付  
> 关联文档：玩法规则见 [`SPEC.md`](./SPEC.md)；多人同步、身份、权限和隐私边界见 [`MULTIPLAYER_IDENTITY_INTEGRATION.md`](./MULTIPLAYER_IDENTITY_INTEGRATION.md)

## 1. 背景与目标

MovingKitchen 当前由四台玩家电脑分别负责一个工位。每台玩家电脑只渲染自己绑定的工位，并通过 Socket.IO 接收服务器维护的权威厨房状态。

旁观者模式允许额外设备使用房间码以只读身份进入房间，在不占用玩家设备名额、不请求摄像头权限、不取得任何游戏控制权的前提下，同时观看四个工位的实时游戏画面和团队进度。

本功能的产品目标：

- 支持展览、课堂、比赛和现场大屏展示。
- 用 2×2 监控墙同时展示四个工位。
- 展示剩余时间、订单进度、分数、水量和浪费等关键信息。
- 在 Phase 2 中展示玩家的实时手势光标、悬停进度和当前活动，让旁观画面更接近直播。
- 保持服务器权威状态、玩家身份绑定和现有四人协作规则不变。
- 不上传玩家摄像头画面，不传输真实屏幕视频。

## 2. 核心产品决定

### 2.1 “四个玩家屏幕”的定义

旁观者看到的是客户端根据权威游戏状态重建的四个工位画面，不是玩家电脑的截图、屏幕录制或摄像头视频。

四个监控格固定对应：

1. `storage-sink`：储物区与水池
2. `board-1`：1 号菜板
3. `board-2`：2 号菜板
4. `oven-pass`：烤箱与出餐区

玩家身份可以在设备之间移动，因此监控格不能永久绑定某位玩家。每个工位格显示当前在该设备取得控制权的玩家姓名和颜色；没有已确认玩家时显示“等待玩家”。

### 2.2 确定范围

本轮确定实施：

- Phase 1：只读旁观身份、四工位监控墙、公开状态投影、进度展示和完整权限隔离。
- Phase 2：低延迟临时活动数据，包括手势光标、悬停目标、悬停进度和动作状态。

本轮不实施：

- Phase 3：WebRTC 屏幕共享、摄像头直播、音视频通话、录制和回放。

## 3. 用户流程

### 3.1 首页身份选择

首页加入区域增加身份选择：

```text
你的身份
[ 厨师 ] [ 旁观者 ]

[ 输入四位房间码 ] [ 加入 ]
```

行为要求：

- 默认选择“厨师”，保持现有用户流程兼容。
- “创建厨房”始终以玩家/房主身份创建；旁观者不能创建房间。
- 选择“旁观者”后，用户输入房间码并点击“观看比赛”。
- 旁观者可以在 Lobby、游戏进行中或结算后加入，并立即收到当前 snapshot。
- 客户端应将所选身份保存在当前 tab 的 `sessionStorage` 中，用于断线重连。
- 切换身份不能沿用另一个身份的已加入会话；必须先离开当前房间。

### 3.2 旁观者加入 Lobby

旁观者可以在游戏开始前加入并看到：

- 房间码。
- 当前玩家人数和已连接玩家设备数。
- 四个工位的在线/未连接状态。
- 房主尚未开局的等待提示。
- 当前旁观人数。

旁观者看不到：

- 人脸 enrollment 操作。
- 摄像头预览或摄像头开启按钮。
- 工位选择。
- 添加玩家、开始游戏或其他房主管理操作。
- 人脸模板、识别置信度或控制权 token。

### 3.3 游戏进行中

游戏开始后，旁观者进入 2×2 监控墙。每个监控格渲染对应工位的背景、工具、食材、环境状态和当前玩家状态。

旁观页面必须始终为只读。监控格中的热点不能被点击、悬停触发或通过键盘激活。

### 3.4 游戏结束

旁观者看到与玩家一致的结算结果，包括：

- 成功、超时或烤焦结果。
- 最终分数。
- 剩余水量。
- 食材浪费。
- 剩余时间。

旁观者不能点击“再开一单”。房主重开后，旁观页面自动回到新的监控状态。

### 3.5 退出和重连

- 旁观者可以随时退出并返回首页。
- 网络断开后显示只读重连提示，不丢失身份选择和房间码。
- 重连使用旁观者事件恢复，不得暂时以玩家身份加入。
- 房间不存在或已销毁时，旁观者返回首页并得到明确提示。

## 4. 页面与视觉规格

### 4.1 桌面监控墙

在宽度大于或等于 900px 时使用固定 2×2 布局：

```text
┌──────────────────────────────────────────────────────┐
│ Moving Kitchen · ABCD   03:42   420 分   旁观 3 人   │
│ 番茄 ✓  香肠 60%  芝士 ✓  面团 25%  烤箱 2/4       │
├──────────────────────────┬───────────────────────────┤
│ 储物与水池 · Alice       │ 1 号菜板 · Bob            │
│                          │                           │
│       工位实时画面        │       工位实时画面         │
│                          │                           │
│ 番茄清洁度 74% · 水 63%  │ 香肠切割 60% · 案板干净   │
├──────────────────────────┼───────────────────────────┤
│ 2 号菜板 · Charlie       │ 烤箱与出餐 · Dana         │
│                          │                           │
│       工位实时画面        │       工位实时画面         │
│                          │                           │
│ 面团展开 25%             │ 食材 2/4 · 等待入炉       │
└──────────────────────────┴───────────────────────────┘
```

每个工位格包含：

- 工位名称。
- 设备在线状态。
- 当前确认的玩家姓名与玩家颜色。
- 玩家当前携带的食材或工具。
- 工位主画面。
- 当前最相关的一项局部进度。
- Phase 2 的实时光标和活动标签。

### 4.2 窄屏行为

- 600–899px：保持两列，允许页面纵向滚动，顶部统计压缩为两行。
- 小于 600px：切换为单列四卡片，避免缩小到无法辨认。
- 旁观者界面不要求在手机上一屏同时看到四个工位；可读性优先。
- 全屏快捷键和背景音乐开关沿用现有游戏行为。

### 4.3 可访问性

- 监控格使用有意义的区域标题，例如“1 号菜板，Bob，在线”。
- 视觉进度条同时提供 `role="progressbar"`、`aria-valuemin`、`aria-valuemax` 和 `aria-valuenow`。
- 颜色不能作为在线状态或进度的唯一表达方式。
- 只读画面中的游戏热点不得进入 Tab 顺序。
- 动画遵循 `prefers-reduced-motion`。

## 5. Phase 1：权威状态监控

### 5.1 Shared Contracts

新增角色和旁观事件。推荐使用独立事件，不复用现有玩家加入事件，以减少权限混淆并保持现有客户端兼容。

```ts
export type ConnectionRole = "player" | "spectator";

export interface SpectatorJoinPayload extends CommandMeta {
  roomCode: string;
  deviceId: string;
}

export interface PublicPlayer {
  id: string;
  name: string;
  color: PlayerColor;
}

export interface PublicStationPresence {
  connected: boolean;
  playerId: string | null;
}

export interface SpectatorState {
  snapshotVersion: 1;
  code: string;
  revision: number;
  serverNow: number;
  status: KitchenState["status"];
  players: PublicPlayer[];
  stationPresence: Record<StationId, PublicStationPresence>;
  kitchen: KitchenState;
  spectatorCount: number;
}
```

Client → Server：

```ts
"spectator:join": Handler<SpectatorJoinPayload, SpectatorState>;
"spectator:resync": Handler<RoomCommand, SpectatorState>;
"room:leave": Handler<RoomCommand, null>;
```

Server → Client：

```ts
"spectator:state": (state: SpectatorState) => void;
```

`KitchenState` 可以进入旁观投影，因为它只描述游戏对象；以下字段不得进入 `SpectatorState`：

- `hostDeviceId`
- `connectedDeviceIds`
- `stationByDevice`
- `presenceByDevice`
- `controlLeaseByPlayer`
- control token
- device ID
- 人脸 `IdentityCandidate` 和 embedding
- 原始手部、脸部或摄像头数据

`stationPresence` 由服务器从设备/工位绑定和有效 presence 派生，旁观者不需要知道设备 ID。

### 5.2 服务器连接模型

Room entry 应分别维护玩家和旁观者连接：

```ts
interface Entry {
  playerSockets: Map<string, Set<string>>; // deviceId -> socketIds
  spectatorSockets: Set<string>; // socketIds
  // existing authoritative state and command tracking
}
```

规则：

- 玩家设备上限保持 4 台。
- 旁观者不计入 `connectedDeviceIds`，不占工位，也不影响开始条件。
- 每个房间默认最多允许 20 个同时连接的旁观 socket。
- 旁观者不能成为房主，也不能在房主断线后继承房主权限。
- 旁观者连接不能单独延长房间生命周期；房间销毁仍以玩家连接和现有空房间规则为准。
- 房间销毁时向旁观者发送房间不可用状态，然后断开其房间订阅。

Socket data 必须记录角色：

```ts
interface SocketData {
  roomCode?: string;
  deviceId?: string;
  role?: ConnectionRole;
}
```

### 5.3 房间频道与广播隔离

玩家和旁观者必须使用不同的 Socket.IO 目标频道：

```text
room:<code>:players
room:<code>:spectators
```

- 完整 `RoomState` 只广播给玩家频道。
- `SpectatorState` 只广播给旁观者频道。
- `identity:roster` 只发送给玩家 socket。
- command 成功响应、错误恢复和强制 resync 都必须根据 socket role 返回对应状态；通用错误处理路径不得向旁观者回退发送完整 `RoomState`。
- 每次权威厨房状态变化和现有 500ms tick 后，服务器生成新的公开投影并广播给旁观者。
- 投影函数必须集中实现并进行单元测试，禁止在多个 socket handler 中手写字段过滤。

推荐纯函数：

```ts
function toSpectatorState(entry: Entry, now: number): SpectatorState;
```

### 5.4 服务端授权

前端隐藏按钮不构成授权。服务器必须按 socket role 检查事件：

| 事件                          | 玩家                    | 旁观者 |
| ----------------------------- | ----------------------- | ------ |
| `room:create`                 | 允许                    | 不适用 |
| `room:join`                   | 允许                    | 拒绝   |
| `spectator:join`              | 拒绝已加入玩家的 socket | 允许   |
| `room:leave`                  | 允许                    | 允许   |
| `spectator:resync`            | 拒绝                    | 允许   |
| `player:add`                  | 按现有规则              | 拒绝   |
| `player:enroll`               | 按现有规则              | 拒绝   |
| `game:start` / `game:restart` | 按现有规则              | 拒绝   |
| `station:select`              | 按现有规则              | 拒绝   |
| `identity:presence`           | 按现有规则              | 拒绝   |
| `kitchen:action`              | 按现有规则              | 拒绝   |
| Phase 2 `station:telemetry`   | 允许且校验              | 拒绝   |

角色必须从 `socket.data.role` 读取，不能信任每个 command payload 自报角色。

### 5.5 客户端状态

网络层增加互斥的连接模式：

```ts
type ClientMode =
  | { role: "player"; room: RoomState }
  | { role: "spectator"; room: SpectatorState }
  | { role: null; room: null };
```

旁观者模式下：

- 不启动人脸识别 provider。
- 不启动手部追踪和游戏输入 controller。
- 不请求摄像头权限。
- 不发送 presence heartbeat。
- 不构造 `KitchenAction`。
- 仅监听 `spectator:state` 和 Phase 2 telemetry。

断线自动重连必须从 `sessionStorage` 恢复 `{ code, role }`。旧的只保存房间码的 session 数据按 `player` 解释，以保持向后兼容。

### 5.6 可复用工位渲染

当前玩家工位画面应重构为可复用、以 props 驱动的组件：

```tsx
<StationScene
  kitchen={state.kitchen}
  station="board-1"
  player={player}
  held={heldItem}
  mode="spectator"
  telemetry={telemetry}
/>
```

约束：

- `StationScene` 不读取全局 socket state。
- `mode="player"` 时允许本地输入、热点按钮、摄像头姿态和动作反馈。
- `mode="spectator"` 时所有热点为纯视觉元素，不能发送 command。
- 玩家和旁观者必须复用同一套背景、素材、物品位置、烤箱动画和进度计算。
- 工位 view model 应由纯函数生成并单元测试，避免在四个卡片中重复业务判断。

## 6. Phase 1：进度展示

### 6.1 顶部全局状态

旁观页面顶部始终显示：

- 房间码。
- 游戏状态：等待、进行中或已结束。
- 剩余时间。
- 当前分数。
- 剩余水量。
- 浪费食材数。
- 烤箱状态。
- 当前旁观人数。

### 6.2 团队里程碑

团队进度由现有 `KitchenState` 在客户端派生，不作为新的服务器权威字段保存。

固定七个里程碑：

1. 番茄洗净。
2. 番茄切好。
3. 香肠切好。
4. 芝士切好。
5. 面团展开。
6. Pizza 烤好。
7. Pizza 切好并出餐。

顶部显示完成项、当前进行项和对应百分比。未完成步骤不得仅显示一个含义不明确的总百分比。

推荐纯函数：

```ts
function getSpectatorProgress(kitchen: KitchenState): {
  completedMilestones: number;
  totalMilestones: 7;
  ingredients: Record<
    IngredientKind,
    {
      stage: "waiting" | "processing" | "ready" | "in-oven";
      progress: number;
    }
  >;
  oven: { status: KitchenState["oven"]["status"]; progress: number };
  serving: { progress: number };
};
```

### 6.3 工位局部进度

- 水池：当前番茄清洁度、水龙头状态、剩余水量。
- 菜板：占用食材、切割或面团展开进度、案板干净/脏。
- 烤箱：已加入食材 `n/4`、烘烤进度、ready/burnt 状态。
- 出餐盘：披萨切割进度和已完成切数。
- 无活动时显示下一步提示，不显示空进度条。

## 7. Phase 2：实时活动与手势光标

### 7.1 目标与边界

Phase 2 让旁观者看到每个工位当前“正在做什么”，但不会传输原始 hand landmark、摄像头 frame、脸部数据或实际桌面画面。

临时活动数据不是权威游戏状态：

- 不进入 `KitchenState`。
- 不增加 kitchen revision。
- 不写入数据库或日志。
- 丢包时不重试。
- 断线后不恢复历史 telemetry。

### 7.2 Telemetry Contract

玩家客户端发送：

```ts
export type StationActivity =
  | "idle"
  | "hovering"
  | "washing"
  | "chopping"
  | "stretching"
  | "wiping"
  | "placing";

export interface StationTelemetryPayload extends RoomCommand {
  sequence: number;
  capturedAt: number;
  cursor: { x: number; y: number } | null;
  hoverTargetId: string | null;
  hoverProgress: number;
  activity: StationActivity;
}

export interface PublicStationTelemetry {
  stationId: StationId;
  playerId: string | null;
  sequence: number;
  serverReceivedAt: number;
  cursor: { x: number; y: number } | null;
  hoverTargetId: string | null;
  hoverProgress: number;
  activity: StationActivity;
}
```

事件：

```ts
// Client → Server
"station:telemetry": (payload: StationTelemetryPayload) => void;

// Server → Spectators only
"spectator:telemetry": (payload: PublicStationTelemetry) => void;
```

### 7.3 发送频率

- 有有效光标或动作时最多 10Hz。
- 光标离开或身份丢失时立即发送一次清除状态。
- 长时间静止时允许降到 2Hz。
- 使用 Socket.IO volatile emit；网络繁忙时允许丢弃旧帧。
- 不与普通 command 共用 request/retry/idempotency 流程。
- 服务端为 telemetry 设置独立的每 socket 速率限制，建议最多 12 条/秒。

### 7.4 服务端校验

服务端收到 telemetry 时必须：

1. 确认 socket 已作为玩家加入。
2. 从 socket membership 得到可信 `deviceId`。
3. 从 `stationByDevice` 得到可信 `stationId`，忽略客户端自报工位。
4. 从有效 presence 得到 `playerId`，客户端不能自报玩家身份。
5. 校验坐标为有限数字并限制在 `[0, 1]`。
6. 将 `hoverProgress` 限制在 `[0, 1]`。
7. 拒绝未知 activity、过期 sequence 和超频数据。
8. 只转发给该房间的旁观者频道。

### 7.5 旁观者呈现

- 光标以玩家颜色显示，并带简化手形图标。
- 悬停目标显示与玩家端一致的进度圆环。
- 工位标题显示“正在清洗”“正在切菜”等短活动标签。
- 超过 1.5 秒没有收到新 telemetry 时，光标和活动标签淡出。
- 权威 `SpectatorState` 与 telemetry 冲突时，以权威状态为准。
- telemetry 不得在本地预测或触发任何厨房动作。

## 8. 隐私与安全要求

以下要求为阻断级验收条件：

- 旁观者永远不收到人脸 embedding 或 identity roster。
- 旁观者永远不收到玩家摄像头视频或图片。
- 旁观者永远不收到 control token、设备 ID 或识别置信度。
- 服务端拒绝旁观 socket 发送的所有修改性命令，即使 payload 格式合法。
- 玩家端现有“视频不会上传”承诺继续成立。
- telemetry 只包含归一化光标、公开动作类型和服务器派生的公开玩家 ID。
- 房间码仍为四位时，部署到公开网络前应评估是否增加独立的 spectator invite token；该项不阻塞局域网 Demo，但必须记录为上线安全项。

## 9. 性能与可靠性要求

- 四个工位同时显示时，目标设备上保持可用的 60fps UI；最低可接受 30fps。
- 权威状态从服务器变化到旁观页面显示的目标延迟不超过 750ms。
- Phase 2 telemetry 的局域网目标显示延迟不超过 300ms。
- 旁观者数量不能增加厨房 tick 频率。
- `toSpectatorState` 每次广播只生成一次，然后复用给同一房间全部旁观者。
- 监控卡片不可各自注册 socket listener。
- 失序的 telemetry 通过 `sequence` 丢弃。
- 页面隐藏时可以暂停动画渲染，但必须继续维护最新权威 snapshot。

## 10. 测试要求

### 10.1 Shared 和 Server 单元测试

- 旁观者可以加入已有四台玩家设备的满房间。
- 加入旁观者不会改变 `connectedDeviceIds` 或 `stationByDevice`。
- 旁观者不会影响游戏开始条件。
- 旁观者退出不会释放任何玩家 control lease。
- 只有旁观者 socket 收到 `spectator:state`。
- `SpectatorState` 不包含设备 ID、presence、control token 或 identity roster。
- 任意 command 错误和 resync 路径也不会向旁观者泄漏完整 `RoomState`。
- 旁观者发送每一种修改性 command 都得到 `NOT_AUTHORIZED`。
- 旁观者不能伪造 player role 或 telemetry。
- 旁观者断线重连后恢复最新 snapshot。
- 超过旁观人数上限时返回明确错误。
- 玩家全部离开后，旁观者不会阻止房间按现有规则销毁。

### 10.2 Phase 2 测试

- 合法 telemetry 只转发到旁观者频道。
- 非玩家 socket、未分配工位设备和过期 presence 的 telemetry 被拒绝或丢弃。
- 坐标和进度被正确校验、限制。
- 每个工位只接受递增 sequence。
- 超过频率限制的 telemetry 被丢弃且不影响普通游戏 command。
- 客户端在 1.5 秒超时后清除陈旧光标。
- telemetry 丢失不会改变权威厨房状态或 revision。

### 10.3 客户端测试

- 首页默认选择玩家，切换旁观者后使用正确的 join 事件和按钮文案。
- 旁观者不启动摄像头、人脸识别、手势输入或 presence heartbeat。
- Lobby 旁观页面不显示玩家/房主管理控件。
- 游戏中固定渲染四个不同工位。
- 四个工位画面中的物品和进度与同一份 `KitchenState` 一致。
- 所有监控热点均不可交互且不进入键盘焦点顺序。
- 中英文切换覆盖全部旁观者文案。
- 2×2、两列滚动和单列响应式布局通过视觉验证。
- 游戏结束和房主重开能正确切换页面状态。

### 10.4 端到端测试

至少覆盖一次：

1. 四台玩家客户端加入并分配四个工位。
2. 两个旁观者在满房情况下加入。
3. 房主开始游戏。
4. 四台玩家分别执行清洗、切菜、展开和入炉操作。
5. 两个旁观者看到一致的权威状态和 Phase 2 活动。
6. 一个旁观者尝试发送修改性 command 并被服务器拒绝。
7. 一个旁观者断线重连并恢复最新状态。
8. 玩家完成或失败后，旁观者看到正确结算。

## 11. 实施顺序

建议按以下顺序交付，避免先做 UI 再补权限：

1. Shared contracts、socket role 和公开状态类型。
2. Server membership 分离、公开投影和权限矩阵。
3. Server 单元测试和 Socket.IO 集成测试。
4. Client network store 的 player/spectator discriminated union。
5. 首页身份选择、旁观加入、重连和退出流程。
6. 将玩家工位渲染抽为纯 props 驱动的 `StationScene`。
7. 2×2 监控墙、Lobby 和结算页面。
8. 进度 selector、顶部统计和局部状态。
9. Phase 1 浏览器端到端与响应式验证。
10. Phase 2 telemetry contract、服务端转发与速率限制。
11. 玩家端 telemetry producer 和旁观端 overlay。
12. Phase 2 丢包、失序、陈旧状态和性能验证。

## 12. Phase 1 验收标准

Phase 1 只有满足以下全部条件才视为完成：

- 用户可以在首页明确选择“厨师”或“旁观者”。
- 旁观者可以在四台玩家设备已满时加入。
- 旁观者不占工位、不影响开局、不请求摄像头。
- 旁观者可以同时看到四个工位的实时游戏状态。
- 页面展示全局状态、七个里程碑和各工位局部进度。
- 旁观者无法通过 UI 或直接构造 socket command 改变游戏。
- 旁观者收不到人脸模板、设备 ID、识别置信度或 control token。
- 断线重连、游戏结束和房主重开行为正确。
- 新增单元、集成和浏览器测试全部通过。

## 13. Phase 2 验收标准

Phase 2 只有满足以下全部条件才视为完成：

- 四个监控格可以显示各自的实时光标和悬停进度。
- 活动标签可以区分清洗、切菜、展开、擦拭和放置等主要操作。
- telemetry 在正常局域网中的目标延迟不超过 300ms。
- 陈旧或失序 telemetry 不会停留在画面上。
- 旁观者不能发送或伪造 telemetry。
- telemetry 丢包、超频或断线不会影响权威游戏状态和普通 command。
- 不传输原始手部 landmark、摄像头 frame 或脸部数据。
- Phase 2 的安全、性能和端到端测试全部通过。

## 14. Phase 3 观察项：真实视频或屏幕流

Phase 3 不属于当前实施范围，也不应为其提前引入依赖。

如果未来需要让旁观者看到玩家的真实桌面或摄像头，需要独立评估：

- WebRTC signaling。
- STUN/TURN 基础设施。
- 上行带宽和多旁观者分发成本。
- 玩家逐次明确授权和直播状态提示。
- 摄像头、屏幕和音频的隐私边界。
- 弱网重连、清晰度自适应、录制与内容治理。

在新的产品和隐私评审完成前，Phase 1/2 不得采集、发送或保存真实视频和屏幕内容。

## 15. 明确非目标

- 旁观者操控工位或临时接管玩家。
- 旁观者添加、删除或录入玩家。
- 旁观者开始、暂停或重开游戏。
- 旁观者语音、文字聊天或弹幕。
- 真实摄像头、麦克风或屏幕共享。
- 服务端保存 telemetry 历史。
- 比赛录像、回放、剪辑或导出。
- 修改现有 Pizza 玩法、计分规则或玩家身份迁移规则。
