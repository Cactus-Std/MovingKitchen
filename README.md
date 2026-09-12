# Moving Kitchen

四人、多电脑、跨屏合作的体感做菜游戏。摄像头在本机识别人脸与手势，食材跟随玩家在四个工位之间移动；服务器统一管理携带物、加工进度、水量、卫生、烤箱和分数。

当前菜单是 **Pizza**：番茄洗净切碎、香肠切碎、面饼双手展开（STRETCH），与芝士一起入炉；烤好后用隔热手套取出，再用披萨刀切开出餐。

## 快速开始

需要 **Node.js 22.12+、npm，以及近期版本的 Chrome 或 Edge**。在仓库根目录执行：

```sh
npm ci
npm run dev
```

打开 **[http://localhost:5180](http://localhost:5180)**。前端端口为 5180，Socket.IO / HTTP 服务器为 3001；安装时会自动复制本地模型所需的 WASM 运行库。

### 单人、无摄像头试玩

1. 首页勾选「手动测试房间」，选择工位并创建厨房。
2. 添加至少一位厨师，点击「开饭！」。
3. 在底部选择厨师身份，使用顶部导航切换工位。
4. 鼠标悬停拿取／放置；在菜板上下移动切菜，在水池移动鼠标旋转番茄。测试栏也提供切割、展开面饼和擦拭按钮。

手动身份与模拟按钮仍经过服务器校验。开发服务器默认允许测试房间，生产服务器默认关闭。

### 四台电脑、真人手势

**所有电脑必须连接同一台游戏服务器。** 选择一台电脑作为服务器，运行 `npm run dev`。另外三台电脑安装依赖，在 `apps/client/.env.local` 中设置服务器的实际局域网地址，例如：

```dotenv
VITE_SERVER_URL=http://192.168.1.20:3001
```

然后只启动前端：

```sh
npm ci
npm run dev:client
```

修改环境变量后重启前端。每台电脑都打开自身的 `http://localhost:5180`，不要打开服务器的普通局域网 HTTP 页面，否则浏览器可能无法使用摄像头。先从各电脑访问 `http://服务器IP:3001/health`，确认网络及防火墙允许连接。

创建房间后分享四位房间码，四台电脑分别选择「储物与水池」「1 号菜板」「2 号菜板」「烤箱与出餐」。添加四位厨师，在准备室开启摄像头并依次录脸；四台工位连接且四位厨师录脸完成后，由房主开始。玩家换电脑时，已携带物品会随身份移动。

## 操作与规则

| 操作           | 方法                                                                        |
| -------------- | --------------------------------------------------------------------------- |
| 拿取食材／工具 | 空手悬停 0.8 秒，绿色圆环闭合                                               |
| 放置／归还     | 携带时悬停 0.4 秒；工具归还原工位后，先移出热区再进入                       |
| 清洗番茄       | 放进水池、空手打开水龙头、旋转不同表面经过水流；达到 92% 可拿起             |
| 切菜           | 放上食材，拿刀在菜板区域上下切 5 次；归还刀后拿取                           |
| 清洁菜板       | 拿走食材，用抹布左右擦拭；换食材前未清洁会降低卫生评分                      |
| 展开面饼       | 携带面饼，双手先靠近再向两侧展开                                            |
| 烤制与出餐     | 四种准备好的食材入炉，烤制 20 秒；15 秒内用手套取出，归还手套后用披萨刀切开 |
| 全屏           | `F` 切换，`Esc` 退出                                                        |

每轮 5 分钟。水龙头打开后持续消耗公共水量，丢弃食材会扣分；烤焦或超时结束本轮。完整规则见 [SPEC.md](./SPEC.md)。

## 工程结构

```text
apps/client/       React UI、工位热区、手势与人脸识别、本地模型和素材
apps/server/       Socket.IO、房间与控制权、权威厨房规则
packages/shared/   前后端共用类型、事件协议与游戏常量
scripts/           运行库复制、模型检查、浏览器联调与生产启动
reference/         团队原型快照，仅供查阅，不参与 workspace 或运行时依赖
```

手势入口为 `apps/client/src/input/useKitchenInput.ts`；场景与动作映射在 `gameView.ts`，规则在 `apps/server/src/kitchen.ts`。正式工程仅保留游戏使用的输入链路，旧版练习入口及两套本地动作日志未纳入运行工程。

## 配置与生产运行

| 变量                   | 作用                                             | 默认值                                           |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------ |
| `VITE_SERVER_URL`      | 前端连接的服务器地址，修改后需重启／重新构建前端 | 空，开发时使用本地代理，生产时使用同源服务器     |
| `HOST` / `PORT`        | 服务器监听地址与端口                             | `0.0.0.0` / `3001`                               |
| `CLIENT_ORIGINS`       | 允许的网页 origin，多个用逗号分隔                | 本机开发或生产入口                               |
| `ALLOW_DEBUG_IDENTITY` | 是否允许手动测试房间                             | 开发启用，生产关闭；显式 `true` / `false` 可覆盖 |

前端环境文件参考 `apps/client/.env.example`。服务器读取**进程环境变量**，不会自动加载 `apps/server/.env.example` 或 `.env`；请通过终端或部署平台设置。

```sh
npm run build
npm start
```

`npm start` 默认使用 production 模式，在 **http://localhost:3001** 同时提供构建后的网页与 Socket.IO。若需生产构建下的手动试玩，PowerShell 中可先执行 `$env:ALLOW_DEBUG_IDENTITY = "true"`；macOS/Linux 可执行 `ALLOW_DEBUG_IDENTITY=true npm start`。开发和生产服务器默认使用同一个 3001 端口，切换前先停止已有服务器，或设置不同的 `PORT`。

公网部署需要 HTTPS、WebSocket 支持及正确的 `CLIENT_ORIGINS`。也可单独托管静态前端，但需在构建前设置 `VITE_SERVER_URL`。不要发布 `.env.local`；模型与运行库由构建一并交付。

当前是**单实例、内存房间**：服务器重启会清空游戏和临时人脸特征；所有设备离开后保留 30 分钟供重连，再删除。不要直接部署多实例。摄像头视频、照片与手部关键点不会上传，仅临时人脸特征和完成的游戏动作在房间内传递。这是游戏身份识别，不是安全登录认证。

## 检查与测试

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run model:check
```

启动应用后，可分别运行完整游戏及合成摄像头联调：

```sh
npm run test:browser
npm run test:camera
```

浏览器测试默认使用已安装的 Chrome。`PLAYWRIGHT_CHANNEL=msedge` 可改用 Edge，`KITCHEN_TEST_URL` 可指定其他地址；完整游戏测试要求服务器允许手动测试房间。`test:browser` 创建四个独立浏览器上下文，覆盖做菜、跨屏携带、重连、结算与重开；`test:camera` 验证本地模型加载和摄像头释放，不代表真人识别率。

默认不生成截图；需要时将 `KITCHEN_TEST_OUTPUT` 指向操作系统临时目录下的专用目录，查看后删除。运行浏览器测试时不要同时执行会重建 shared 的命令，否则开发服务器会重启并清空测试房间。

常见问题：

- **连接成功但找不到房间**：检查所有前端是否连接同一台服务器，以及服务器是否重启过。
- **无法开启摄像头**：使用 localhost 或 HTTPS，允许权限并关闭其他占用摄像头的程序。
- **模型资源缺失**：重新运行 `npm ci` 和 `npm run model:check`；不要混用两种 MediaPipe 版本的 WASM。
- **控制权在另一台电脑**：重新面对当前摄像头；手动测试模式点击当前厨师的「接管」。

## 接入资料

- [INTEGRATION.md](./INTEGRATION.md)：实现分工、输入映射、迁移来源与四台实体电脑验收清单。
- [MULTIPLAYER_IDENTITY_INTEGRATION.md](./MULTIPLAYER_IDENTITY_INTEGRATION.md)：网络、身份、控制权和隐私边界。
- [多人身份原型](./reference/multiplayer-identification-prototype/README.md)、[Web UI 原型](./reference/web-ui-prototype/README.md)：独立参考代码与运行说明，正式开发不应直接导入这些目录。
- [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)、[手部模型说明](./apps/client/public/models/HAND_MODEL_README.md)：模型、运行库的来源与许可。

目前已完成自动化联调；四台实体电脑上的真人识别和场地光照仍需现场验收。尚未发布到公网。
