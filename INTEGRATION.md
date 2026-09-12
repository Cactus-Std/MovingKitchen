# 正式整合与团队接入

## 工程与来源

| 模块                                   | 正式位置                                       | 来源                                                                          |
| -------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| 共享网络协议、厨房类型                 | `packages/shared/src`                          | `MULTIPLAYER_IDENTITY_INTEGRATION.md`，扩展为厨房游戏                         |
| 权威规则、房间、控制权、Socket.IO      | `apps/server/src`                              | reference 的生命周期方法，替换回合演示为同步厨房                              |
| 插画、工具、工位热区、番茄 3D 清洗     | `apps/client/src`、`apps/client/public/assets` | web UI reference 的图片、坐标和 Three.js 方法                                 |
| 本地手势控制器及测试                   | `apps/client/src/input`                        | `D:\hackcmu`，commit `8a06045c3a67271c79116177e3e6d0ab414c1963`               |
| 人脸模型、匹配、sticky identity 及测试 | `apps/client/src/vision`、`public/models`      | 本仓库 reference 快照，基线 commit `05d9182a47b3b15c664eb7307dd35eac7534a090` |

参考目录保留原样，正式代码不相对导入 reference，也不依赖 D:\hackcmu。只迁移功能与素材；手势实验室的占位宿主、localStorage 游戏状态、BroadcastChannel、模拟录脸及回合计分未进入正式运行链路。

正式输入入口为 `useKitchenInput`。旧版练习 hook、两套本地动作日志及其专用测试已移除；实际游戏使用的动作检测、速度统计、摄像头生命周期和输入确认测试保留。

## 输入到服务器

`useKitchenInput` 继续输出本地 `KitchenIntent`，`gameView.ts` 将其映射为共享的 `KitchenAction`。`App.tsx` 只请求操作，持有物与加工状态均由 server snapshot 回写。连续手部姿态只用于本机物品位置、旋转、擦拭和清洗表面判断；网络发送已完成的动作或一批清洗 patch 编号，不发送关键点、视频、照片或逐帧姿态。

| 输入                   | 厨房动作                                             |
| ---------------------- | ---------------------------------------------------- |
| 食材／工具悬停         | PICKUP_STORAGE、PICKUP_ITEM、PLACE_ITEM、RETURN_TOOL |
| 水龙头悬停             | TOGGLE_FAUCET                                        |
| 番茄在水流下的可见表面 | WASH（48 个固定 patch，服务器合并去重）              |
| 菜板上下切             | CHOP                                                 |
| 抹布在空菜板左右移动   | WIPE                                                 |
| 双手展开面饼           | STRETCH                                              |
| 垃圾桶／烤箱悬停       | DISCARD、ADD_TO_OVEN、TAKE_PIZZA                     |
| 持披萨刀在托盘上下切   | SLICE_PIZZA                                          |

清洗几何判断属于客户端玩法输入，与人脸识别一样不是防作弊证明；服务器校验当前工位、空手、番茄位置、水流和 patch 范围。工具归还后需要移出热区再进入，避免状态确认触发立即重拿。披萨刀沿用切割检测器，未新增第二套手势协议。

每个 command 带 protocolVersion/requestId。厨房动作另外携带 actionId、expectedRevision、stationId。服务器从 socket 绑定的 device presence 与 lease 推导玩家，不读取手势包里的 playerId 作为授权依据。成功动作重试返回最新快照，不再次执行；状态冲突时刷新快照，由用户重试。房间玩家添加、录脸、开始、重开和换工位也按 requestId 去重。

房间快照不含 embedding；只有已加入房间的客户端收到 `identity:roster`。新鲜 positive-match 可以迁移玩家控制权，旧设备的 lock-heartbeat 只能续租自己仍拥有的 lease，不能抢回。无手／无脸的短暂漏检不清除 sticky identity；心跳停止 3.5 秒后服务器回收控制权。

## 模型与摄像头

手部模块保持 `@mediapipe/tasks-vision@1.0.1`；人脸模块通过 npm alias `@mediapipe/face-vision` 保持 `0.10.35`。安装脚本分别复制两套匹配 WASM，不混用。ONNX Runtime WASM 及 JSEP 模块也由安装脚本生成。原有 face provenance 见 `THIRD_PARTY_NOTICES.md`，手部 provenance/license 见 `apps/client/public/models/HAND_MODEL_*`。

Vite 使用 ONNX 的 external-WASM export，并对两个明确的本地 ONNX `.mjs` 入口提供原样静态响应，避免 Vite 8 将 public 动态模块当成源码转换而报 500。生产服务器直接按静态文件提供它们。

游戏只挂载一个 video；手部 camera lifecycle 拥有 MediaStream，人脸 provider 读取同一个 video。模型与图像处理都在浏览器本地。录脸按钮说明临时特征共享范围并要求主动开始。开启摄像头失败时可重试；显式手动测试房间可关闭摄像头继续鼠标联调。

## 现场验收（需要真人设备）

2026-09-12 自动验收：88 项测试、TypeScript、ESLint、生产构建与 FaceX 模型检查通过；Chrome 四个独立浏览器上下文在开发和生产构建中完成整份 Pizza、身份接管、刷新重连与重开。合成摄像头验证手部／人脸／ONNX 本地资源同时加载、无模型错误提示，以及关闭摄像头后轨道释放。真人识别率尚未测量。

自动测试可以验证状态、模型文件和浏览器流程，不能替代现场识别率测试。交付后需在实际四台电脑完成：

1. 四位厨师各录一次脸；每台设备上验证同一玩家稳定识别。
2. 小脸、转头、短暂遮挡后仍保持身份，另一名玩家连续被确认后再切换。
3. 拿起食材走到另一台电脑：新屏幕保持同一 item ID，旧屏幕禁止操作；走回旧屏幕可以重新接管。
4. 真人悬停、归还工具后移出、CHOP、STRETCH、左右擦拭、3D 番茄旋转均可完成。
5. 同时处理两个菜板，观察卫生、浪费、水量和烤制时间同步。
6. 断开一台设备网络再连接；服务器不重启时房间和携带物恢复。
7. 若部署到公网，验证 HTTPS 摄像头、WebSocket、模型/WASM、刷新与服务器重启后的房间失效提示。

当前没有操作团队已有 Render 服务或发布到远程环境；可运行工程与同源生产入口已提供。
