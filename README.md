# Remote Bridge · 遥控桥

一个运行在局域网里的「网页版无线麦 + 系统遥控器」。

手机打开遥控页面，像使用小米电视遥控器一样按下电源、方向、确认、返回、主页、菜单、音量等按键；电脑端实时收到按键，并能配置每个按键的名称、含义和真实电脑动作。语音是核心：按住手机语音键说话，手机端会把实时 PCM 音频送到电脑，再由本机桥接写入 `MiRemoteV 2ch` / `SayAll` / `BlackHole 2ch` 等虚拟麦克风，让输入法、会议软件或其它 App 直接把它当成麦克风使用。

> 功能方向参考了 [无线麦 SayAll](https://github.com/HD838A/remote-mic-app)，本项目是独立的网页 + 本机桥接实现，不是其官方版本，也不包含其虚拟声卡驱动或私有组件。

## 功能

### 网页端

- **手机遥控端**
  - 深色场景中的浅银色金属遥控器，带蓝色弧线与同心圆背景
  - 左上电源键、右上说明键、左下语音键、右下删除键
  - 超大深色方向盘，左侧为返回 / 主页 / 菜单，右侧为音量拨杆、静音和删除
  - 按住左下角语音键说话，方向盘中央作为确认键
  - 按手机宽度和可见高度自动缩放；横屏时切换为宽体横向布局
  - 触感反馈、断线自动重连、电脑在线状态
  - 按住语音键进行实时音频采集，支持最长 60 秒
  - 浏览器支持时同步显示 Web Speech 实时转写
  - 按键上方固定显示语音识别结果，同时展示手机识别和 Mac 豆包捕获的文字
  - 底部「键盘输入」按钮可打开文字输入框，使用手机输入法的语音键听写后点击发送
  - HTTP 环境无法录音时，可以上传一段已有录音（仅电脑端回放，不进入系统麦克风）
- **电脑接收端**
  - 实时显示最近按键、含义和配置后的电脑动作
  - 语音实时状态、波形、转写、原声播放和语音记录
  - 可视化「设计遥控器」：拖动布局、新增自定义快捷键，并实时预览手机端
  - 按按键配置名称、含义、真实电脑动作
  - 支持单击录制自定义快捷键
  - 自动生成带配对凭证的手机二维码
  - 顶部主题选择器可在「暖夜」「暮蓝」「紫夜」「森林」「清晰」等主题间切换，并记住上次选择
- **系统桥接（可选，默认关闭）**
  - 将手机语音实时写入 Mac 的虚拟麦克风
  - 把配置后的按键变成真实键盘快捷键、媒体键、音量键或“聚焦输入框”动作
  - 语音键可按 Fn / 右 Option / 右 Command 的形式按住，配合豆包、Typeless 等语音输入工具
  - 可用 Apple Speech 在 Mac 本机识别手机语音，不依赖手机 Web Speech 或 Mac 输入框焦点
  - 可用 SenseVoice 在 Node 中完全离线识别手机语音，不需要系统语音识别权限；首次使用需下载约 163 MB 模型
  - 识别语言可在中文 / English 之间切换
  - 识别文字可直接输入 Mac 当前焦点、复制到剪贴板、转成拼音按键，或通过 Windows 助手直接输入中文
  - 状态卡显示虚拟设备、辅助功能权限和错误信息

## 系统要求

- macOS 13 或更高版本（系统桥接为 macOS 专用；网页端本身可跨平台运行）
- Node.js 20+
- 安装 Xcode Command Line Tools（首次自动编译本机桥接需要 `swiftc`）：
  ```bash
  xcode-select --install
  ```
- 已安装以下任一虚拟音频设备：
  - `MiRemoteV 2ch`（SayAll 安装器会安装）
  - `SayAll`
  - `BlackHole 2ch`
- 手机与电脑连接同一个局域网 / Wi-Fi
- 手机使用 HTTPS 页面访问，才能获得麦克风权限
- 要执行真实按键动作或按住语音触发键，需要在「系统设置 → 隐私与安全性 → 辅助功能」中允许本机桥接 / 启动它的终端应用
- 使用「本机 SenseVoice」识别时，首次需要联网下载约 163 MB 模型；之后完全离线，不需要额外系统权限

## 快速开始

```bash
cd mi-remote-bridge
npm install
npm start
```

终端会显示类似：

```text
电脑接收端   http://localhost:3000/pc
手机遥控端   https://192.168.1.100:3443/?pair=...
HTTP 备用    http://192.168.1.100:3000/?pair=...
```

1. **在电脑本机**打开 `http://localhost:3000/pc`。接收端只在浏览器位于本机时才能取得配对凭证。
2. 用手机扫描「连接手机」卡片中的二维码。首次访问自签名 HTTPS 时选择继续访问。
3. 手机页面显示「电脑已连接」。
4. 在电脑接受端点击「系统桥接 → 启用系统控制与麦克风」。
5. 如果卡片显示「辅助功能：未授权」，点击旁边的「授权」：
   - 按系统提示允许本机桥接；
   - 若没有出现开关，点击「重新检测」或到「系统设置 → 隐私与安全性 → 辅助功能」手动打开；
   - 也可以点击「打开辅助功能设置」。
6. 在需要听写的 App 中，把麦克风选为 `MiRemoteV 2ch`（或对应的 SayAll / BlackHole）。
7. 按住手机语音键说话，松开后停止。根据需要选择语音触发方式（默认 Fn）。

> 系统桥接关闭时：手机语音只在电脑网页中回放；按键只展示，不执行真实系统动作。

## 通过 USB / 蓝牙网络连接

项目本身不直接使用蓝牙协议，而是通过 HTTP/WebSocket 通信。只要手机和 Mac 之间存在 IP 网络即可。

### 推荐：USB 网络共享

1. 数据线连接手机和 Mac；
2. iPhone 打开「个人热点」，Android 打开「USB 网络共享」；
3. Mac 会出现新的网络接口；
4. 在电脑端「连接手机」卡片点击「刷新」，在「连接地址」下拉框选择新地址，再扫码。

USB 带宽足够语音使用，是 Wi-Fi 不稳定时最可靠的替代方案。

### 蓝牙网络

> 注意：macOS Monterey 及之后版本通常已不再提供 Bluetooth PAN 网络共享。当前 macOS 27 的系统设置里如果没有「蓝牙 PAN」，就无法通过蓝牙建立 IP 网络；请改用 USB 网络共享或手机热点。

如果系统仍然提供蓝牙 PAN：

1. Android：打开「设置 → 网络 → 热点与共享 → 蓝牙网络共享」；iPhone 可使用个人热点（USB / 蓝牙 / Wi-Fi）。
2. Mac：打开「系统设置 → 蓝牙」，与手机配对，并在网络设置中连接蓝牙 PAN / 热点。
3. 回到电脑端「连接手机」卡片，点击「刷新」，在「连接地址」下拉框选择带「蓝牙」或 PAN 的地址。
4. 扫描上方二维码。

说明：

- 「连接地址」下拉框会列出所有非内部 IPv4 地址，并标注 Wi-Fi / 蓝牙 / 接口名。
- 蓝牙网络适合按键控制；语音 PCM 带宽要求较高，蓝牙链路可能卡顿，建议语音仍使用 Wi-Fi。
- HTTPS 证书会包含启动时检测到的所有局域网 IP。如果先建立蓝牙网络、再启动 Remote Bridge，蓝牙 IP 会自动写入证书；如果启动后才建立蓝牙连接，请重启一次应用以重新生成证书。
- 首次使用某个新地址的 HTTPS 页面时，手机仍需接受一次自签名证书警告。
- 项目不提供蓝牙配对 UI，也不会读取物理蓝牙遥控器；这里的「蓝牙」指的是手机与 Mac 之间的蓝牙网络共享。

## 打包成 macOS 应用（Mac mini 一键打包）

在 macOS 开发机上执行：

```bash
# 只生成 .app（默认）
npm run build:mac

# 需要安装镜像时再生成 DMG
npm run build:dmg
```

输出：

- `dist/Remote Bridge.app` — 可直接运行的菜单栏应用
- `dist/RemoteBridge-<版本>.dmg` — 仅执行 `build:dmg` 时生成，可拖入「应用程序」安装

产物已经包含 Node 运行时、服务端、网页界面和预编译的 `RemoteBridgeHelper`，目标 Mac 不需要再安装 Node、Swift 或 Xcode。首次运行仍需要安装 `MiRemoteV 2ch` / `SayAll` / `BlackHole` 之一作为虚拟麦克风。

安装与使用：

1. 直接把 **Remote Bridge.app** 拖到「应用程序」；如果生成了 DMG，也可以打开 DMG 后拖入。
2. 首次打开如果被 Gatekeeper 拦截，右键点击应用 → **打开**。当前使用 `.signing/` 中的本地自签名身份，没有做 Apple 公证。
3. 菜单栏会出现遥控器图标，服务自动启动并打开 `http://localhost:3000/pc`。
4. 菜单里可以打开遥控台、重启服务、查看日志或退出。退出应用会同时停止后台服务。
5. 首次使用系统按键 / 语音触发时，仍按系统提示授予辅助功能权限。

运行时文件位置：

- 配置：`~/Library/Application Support/RemoteBridge/config.json`
- 配对码：`~/Library/Application Support/RemoteBridge/pair-token`
- HTTPS 证书：`~/Library/Application Support/RemoteBridge/certs/`
- 日志：`~/Library/Logs/RemoteBridge/server.log`

注意事项：

- 默认端口是 `3000` / `3443`，启动前请确保没有被其他服务占用；如果之前用 `npm start` 开了开发服务，请先停止，否则应用会检测到已有服务并直接打开旧页面。
- 打包架构跟随当前开发机：Apple Silicon 生成 arm64 应用，Intel 生成 x86_64 应用。
- 请保留项目根目录的 `.signing/`（已 gitignore）：它保存本地签名身份，删除后重新打包会改变签名，辅助功能授权也会失效。
- 如需分发给其他 Mac 并完全避免「未识别的开发者」提示，需要使用 Apple Developer ID 签名并公证。
- 应用使用独立的配置目录；如需沿用开发时的按键布局，退出应用后把 `data/config.json` 复制到 `~/Library/Application Support/RemoteBridge/config.json`，再重新打开应用。

## 在 Windows 上运行服务（实验性）

Node 服务、网页端和本机 SenseVoice 识别可以运行在 Windows 上；Swift 系统桥接和虚拟麦克风仍然只有 macOS 支持。

### 一键启动（推荐）

1. 安装 [Node.js 20+](https://nodejs.org/)（只需一次；也可以执行 `winget install OpenJS.NodeJS.LTS`）。
2. 下载 / 解压本项目，双击项目根目录的 **`start-windows.cmd`**。
3. 脚本会自动完成：
   - 检查 Node.js；
   - 首次运行执行 `npm install`；
   - 下载约 163 MB 的 SenseVoice 模型；
   - 设置 `AUTO_START_WINDOWS_AGENT=1`；
   - 启动服务并打开 `http://localhost:3000/pc`。
4. 在电脑端页面第一次打开时，会自动选择 **识别：本机 SenseVoice** 和 **输出：仅 Windows**。
5. 手机扫描二维码，首次打开 HTTPS 时接受证书警告，然后即可使用。

如果 Node.js 没有安装，脚本会提示安装地址并退出。手机录音需要 HTTPS；项目内置了纯 JavaScript 证书生成器，**Windows 不再需要 OpenSSL 或 mkcert**，使用自签名证书并在手机上接受一次警告即可。想要手机不显示证书警告时，仍可按下面的 mkcert 方式替换证书。

### 手动启动

```powershell
npm install
npm run model:download
$env:AUTO_START_WINDOWS_AGENT = "1"
npm start
```

运行后：

1. 在 Windows 本机打开 `http://localhost:3000/pc`；
2. 语音识别来源选择 **本机 SenseVoice**（首次会自动选择）；
3. 输出方式选择 **仅 Windows**（首次会自动选择）；
4. 「Windows 助手」行会显示本机助手的连接状态，可以点击 **启动本机助手 / 停止本机助手**；
5. 手机通过 HTTPS 地址访问并扫码。

Windows 上可用：

- 手机按键展示、配对、二维码、电脑端页面；
- 手机麦克风 PCM → Node → SenseVoice 离线识别；
- 手机键盘文字、识别文字通过 Windows 助手输入当前焦点窗口；
- 本机助手状态检测、一键启动 / 停止、`AUTO_START_WINDOWS_AGENT=1` 自动启动。

Windows 上不可用：

- 虚拟麦克风写入（MiRemoteV / SayAll / BlackHole）；
- 手机按键执行真实快捷键 / 媒体键 / 音量；
- Apple Speech、Mac 豆包捕获、Mac 剪贴板 / 拼音 / 自动输出；
- `.app` / 菜单栏打包。

注意：

- 手机录音需要 HTTPS。项目优先使用系统 `openssl`，没有时自动使用内置的 `selfsigned` 生成证书；Windows 上直接使用自签名证书即可。想要手机完全信任，也可以安装 mkcert 并通过 `CERT_FILE` / `KEY_FILE` 传入生成的证书。
- 模型下载使用系统 `tar` 解压 `.tar.bz2`；Windows 10 1803+ 自带该命令。如果解压失败，可手动解压到 `data/models/sense-voice/`，确保目录中有 `model.int8.onnx` 和 `tokens.txt`。
- 「自动」输出依赖 macOS 前台应用判断，Windows 服务端请使用「仅 Windows」。
- 电脑接收端页面需要保持打开；识别结果由页面决定如何输出。
- Windows 助手启动时会使用命名互斥量防止重复实例。
- 本节的 Windows 链路尚未在真实 Windows 机器上完成完整验收；如遇到 PowerShell 或原生依赖问题，请先查看服务端日志。

## 配对与安全

此版本加入了最小化的局域网配对：

- 第一次启动会生成一个 192 位随机 token，并保存在数据目录的 `pair-token` 文件（权限 `0600`）；后续重启沿用同一个 token。
- 手机二维码 URL 带有 `?pair=...`；手机拿到后保存到 `localStorage`（隐私模式下退回 `sessionStorage`）。只要 token 和访问地址不变，重新打开页面或重启应用都**不需要重新扫码**。
- 电脑接收端必须从运行服务的电脑本机（localhost / 127.0.0.1）获取 token。
- 配置、连接信息、系统设置接口和 WebSocket 都要求 token。
- 需要让旧二维码失效时：退出应用，删除数据目录里的 `pair-token`（开发时是 `data/pair-token`，打包应用是 `~/Library/Application Support/RemoteBridge/pair-token`），再启动应用，然后重新扫码。
- 如果 Mac 的局域网 IP 发生变化，手机访问地址也会变，仍需要重新扫码/打开新地址。
- 系统桥接默认关闭；必须由当前连接的电脑端显式启用。最后一个已启用的电脑端断开时，服务会自动关闭系统桥接。

这适合受信任的家庭 / 办公局域网，但没有账号体系、设备审批或多用户权限。不要把 3000 / 3443 端口直接暴露到公网。

## 系统桥接权限说明

| 能力 | 需要的权限 | 说明 |
| --- | --- | --- |
| 手机直接录音 | 浏览器麦克风权限 + HTTPS | 网页端本身 |
| 语音进入 `MiRemoteV` 等虚拟麦克风 | 无额外系统权限 | 本机桥接只需要能打开音频设备 |
| 按键执行快捷键 / 媒体键 / 聚焦输入框 | 辅助功能 | 通过 macOS Accessibility / CGEvent 注入 |
| 语音键按住 Fn 等触发键 | 辅助功能 | 由桥接发送按下 / 释放事件 |

如果没有授权辅助功能：

- 虚拟麦克风和电脑端语音回放仍然可用；
- 按键动作会失败，并在事件流中显示「系统动作执行失败 / 需要先在系统设置中授予辅助功能权限」；
- 语音键不会自动按住 Fn。

授权后如果状态没有刷新，点击系统桥接卡片里的「重新检测」。某些 App 需要重新打开才能识别新的虚拟麦克风。

### 让遥控按键输入到输入框

- 遥控按键会发送到 **Mac 当前最前面的应用**。在手机上按键前，请先在 Mac 上把目标窗口切到最前，并在目标输入框里点一下。后台窗口不会接收到按键。
- 默认布局只包含方向、确认、返回、删除、音量、静音和语音；**没有字母 / 数字键**。要输入文字，请在「设计遥控器 → 新增按键」里为字母或数字录制快捷键（例如 `A`、`1`），再把它们拖到遥控器上。
- 中文输入取决于 Mac 当前启用的输入法；发送字母按键时会进入输入法的候选状态，这是正常行为。
- 「聚焦输入框」动作会尝试聚焦前台应用中的文本框：
  - 原生 App（如备忘录、TextEdit）可以直接使用；
  - 浏览器 / Electron 页面如果没有向 macOS 暴露页面输入框，会提示「没有找到页面输入框」，此时请手动点击页面里的输入框。
- 如果某个按键执行失败，电脑端事件流会显示「系统动作执行失败」和具体原因。

### 重新打包后辅助功能授权失效

`npm run build:mac` 会在 `.signing/` 中生成并复用一套本地自签名代码签名身份，用它签名主应用、内置 Node 和 `RemoteBridgeHelper.app`。只要保留这个目录，重新打包后的签名身份（`certificate leaf`）不变，辅助功能授权可以继续沿用。

如果之前授权过、现在一直显示未授权：

1. 退出正在运行的 Remote Bridge（包括旧版 `npm start`）。
2. 安装最新 DMG。旧版本是临时 ad-hoc 签名，授权无法迁移到新版本。
3. 打开「系统设置 → 隐私与安全性 → 辅助功能」，用 `−` 删除旧的 **Remote Bridge** / **RemoteBridgeHelper** / **node** 条目。
4. 启动新版应用，在电脑接收端点「授权」，然后在系统提示或辅助功能列表中打开新的 **Remote Bridge** / **遥控桥辅助（Remote Bridge Helper）**。
5. 如果仍然不生效，执行 `npm run fix:permissions` 重置本应用的授权记录，再重新授权。

不要删除项目里的 `.signing/` 目录；删除后会生成新的签名身份，需要重新授权一次。

## 界面主题

电脑接收端顶部有主题选择器：

- **暖夜**：原有的暖黑 + 橙色主题，保持默认
- **暮蓝**：深蓝面板 + 橙色强调色
- **紫夜**：深紫背景 + 橙色强调色
- **森林**：深绿背景 + 橙色强调色
- **清晰**：纯黑背景、纯白文字、更高对比度和更亮的边框，适合文字看不清时使用

主题保存在当前浏览器 `localStorage` 的 `remoteBridge.theme`，刷新页面后继续使用。后续可以在 `public/css/pc.css` 的 `:root[data-theme="..."]` 中增加更多主题，并在 `pc.html` 的 `themeSelect` 中增加选项。

## 设计遥控器

电脑端顶部的 **设计遥控器** 会打开布局设计器：

- 左侧直接渲染真实手机端页面，修改会实时显示在预览中。
- 设计器分为 **布局** 和 **按键功能** 两个视图。
- 遥控器不再固定分区：所有按键按同一个列表的顺序排成可自由调整的网格，每行 2 / 3 / 4 个可选。
- 拖动任意一行的 ⠿ 手柄到另一行的上方或下方即可插入到对应位置；也可以使用每行的 ↑ ↓ 按钮微调。拖到面板边缘会自动滚动。
- **默认按键** 区域可以移除任意内置按键（包括电源、方向键、音量键等），点击已移除的按键即可恢复；隐藏后网格会自动收拢。
- **＋ 新增按键** 最多可以添加 8 个自定义快捷键按键：填写名称并录制快捷键，新增后会直接加入按键列表，可拖到任意位置。
- 自定义按键可以修改名称、删除；它的当前行列位置会显示在名称下方。
- 右上角说明按钮始终保留。
- **按键功能** 视图按照遥控器的实际显示顺序列出所有可见按键（包括自定义按键），为每个按键设计 **单击 / 双击 / 长按** 三套动作；未设置双击/长按时仍保持即时单击。手机端会按 300 ms 双击窗口、550 ms 长按阈值识别并发送对应手势。
- 点击 **保存并同步到手机** 后，布局、隐藏状态、自定义按键和按键功能写入服务端；手机扫码连接后会使用同一设计。
- 内置按键的名称和含义仍由相邻的 **按键配置** 管理；该列表只显示当前遥控器上可见的默认按键，并提供「单击 / 双击 / 长按动作 → 在设计遥控器中设置」入口。已隐藏的按键不会出现在这里，恢复显示后会重新出现。

手机页面会根据实际屏幕宽高整体缩放；在竖屏手机上遥控器会横向铺满浏览器，同时按键保持正方形比例。由于两列方形按键可能高于屏幕，页面允许轻微纵向滚动以查看底部按键；横屏和桌面浏览器仍使用居中布局。

手机端会应用保存的按键顺序和每行数量；电脑页信号面板里的小遥控器也会同步显示相同的网格。

## 按键与动作配置

电脑端「按键配置」里，每个可见的默认按键有三项：

- **名称**：手机端无障碍标签和接收端显示使用；
- **含义**：给人看的语义描述；
- **电脑动作**：单击时真正执行的动作。

双击 / 长按动作不在这个抽屉里设置，请点击「单击 / 双击 / 长按动作 → 在设计遥控器中设置」，或打开「设计遥控器 → 按键功能」。

内置动作：

- 不执行
- 方向 ↑ / ↓ / ← / →
- 回车、Esc、Tab、空格、删除、上一页、下一页
- 播放 / 暂停、音量 +、音量 −、静音
- 聚焦输入框（尝试找前台 App 的文本输入控件，实验性）
- 自定义快捷键：点击「录制」，按下目标组合键即可保存，例如 `⇧⌘K`

默认动作：

| 按键 | 默认动作 |
| --- | --- |
| 上 / 下 / 左 / 右 | 对应方向键 |
| OK | 回车 |
| 返回 | Escape |
| 删除 | Backspace（退格） |
| 音量 + / − | 系统音量加 / 减 |
| 静音 | 系统静音 |
| 电源 / 主页 / 菜单 / 语音 | 不执行 |

双击和长按动作默认均未设置，可在电脑端「设计遥控器 → 按键功能」里配置。

删除键额外支持**长按连续删除**：按住约 420ms 后，每 70ms 发送一次 Backspace，松开即停止。如果给删除键配置了双击或长按动作，则优先执行配置的动作，不再连续删除。

语音键不参与普通动作映射。它的行为由「语音键触发方式」统一控制：

- Fn / 地球键（默认，适合豆包等 Fn 长按语音工具）
- 右 Option
- 右 Command
- **右 Control**
- **自定义快捷键**：选择后按下要发送的组合键，例如 `⌥Space`、`F13`、`⌃⌘V`
- 不触发

「系统桥接」卡片里的「语音触发」现在也可以直接修改并立即保存，不必再打开按键配置。

语音开始时会按住所选触发键，音频排空后释放。自定义快捷键会依次按下修饰键和主键，并在结束时逆序释放。目标语音工具必须使用同一个触发键，并把麦克风设为同一个虚拟音频设备。

Fn、右 Option、右 Command、右 Control 这类单独修饰键请使用预设选项；自定义快捷键需要包含一个普通按键（可搭配修饰键）。

### 语音识别来源：Mac 豆包 / Mac 本机 / 手机网页

语音输入面板新增「识别来源」选择：

- **Mac 豆包**（默认）：手机语音进入虚拟麦克风，由 Mac 豆包识别并写入当前 Mac 前台输入框；桥接提取新增文字并复制到剪贴板。需要 Mac 输入框保持焦点。
- **Mac 本机**：手机语音送到 Mac 后，由 Apple Speech 直接在桥接里识别，不需要 Mac 输入框焦点，也不需要手机 Web Speech。第一次使用需要在「系统桥接 → 本机识别」中授权。识别结果会同步到手机显示框，并继续走剪贴板或拼音输出。
- **本机 SenseVoice**：手机 PCM 音频留在 Node 服务里，由 `sherpa-onnx-node` + SenseVoiceSmall 在 CPU 上离线识别。不需要辅助功能、语音识别或输入框焦点，也不会上传音频。第一次使用需要下载约 163 MB 的模型。
- **手机网页**：使用手机浏览器的 Web Speech API 识别，松开语音键后自动处理最终文字，不需要 Mac 输入框焦点。默认复制到 Mac 剪贴板，然后可以通过 RustDesk 剪贴板同步在 Windows 中按 `Ctrl+V` 粘贴；把「输出」设为「拼音按键」时会自动转成拼音并输入到当前 Mac 焦点窗口。

手机网页模式依赖手机浏览器支持语音识别，准确率和可用性由浏览器决定；如果浏览器没有给出转写文字，可以继续使用「复制识别文字」按钮或切回 Mac 豆包模式。

#### 启用本机 SenseVoice（Node 离线识别）

1. 在电脑端语音面板把「识别」切到 **本机 SenseVoice**；
2. 如果模型还没有安装，识别下拉框旁会出现 **下载本机模型** 按钮，点击后下载约 163 MB 的 SenseVoice 模型；
3. 也可以在终端提前下载：
   ```bash
   npm run model:download
   ```
4. 下载完成后模型会自动加载，按住手机语音键说话，松开后由 Node 直接识别，结果会同步到电脑事件流和手机显示框，并继续按当前「输出」方式处理。

模型存放位置：

- 开发模式：`data/models/sense-voice/`
- 打包应用：`~/Library/Application Support/RemoteBridge/models/sense-voice/`

说明：

- 本机 SenseVoice 不依赖系统桥接：即使没有开启「系统桥接」，也可以识别并复制 / 输出文字。
- 识别在 Node 进程内完成，模型只从 GitHub Releases 下载一次，音频不会离开本机。
- SenseVoiceSmall 支持中 / 英 / 日 / 韩 / 粤，会自动判断语种；「识别语言」切换后会把中文 / English 作为提示传给模型。
- 这是整段识别：说话过程中手机不会实时显示文字，松开语音键后一次性返回结果。10 秒语音通常几十到几百毫秒内完成。
- 需要 CPU 运算，首次加载模型约 1 秒；模型常驻内存几百 MB。识别期间不会阻塞 WebSocket 音频转发。
- 使用前需要执行过一次 `npm install`，以安装可选的 `sherpa-onnx-node` 依赖。macOS arm64 / x64 都有预编译包，不需要编译器。
- 如果提示「本机识别组件不可用」，重新执行 `npm install` 并重启服务；也可以在启动时设置 `DISABLE_LOCAL_SPEECH=1` 完全关闭这个识别来源。

#### 识别语言：中文 / English

「系统桥接 → 识别语言」可以切换：

- **中文**：`zh-CN`
- **English**：`en-US`

这个设置会同步到 Apple Speech 和手机网页识别。英文语音建议先切到 English，识别准确率会明显提高。

限制：

- Mac 豆包的语言由当前输入法决定，不受这个选项控制。
- 目前是手动切换，不做逐句自动语言检测；中英混说时效果仍取决于识别器。
- 英文识别后建议使用「自动」或「仅 Windows」输出；拼音按键主要适合中文。

#### 启用 Mac 本机识别（Apple Speech）

1. 在电脑端语音面板把「识别」切到「Mac 本机」；
2. 在「系统桥接 → 本机识别」点击「授权」；
3. 会弹出一个「Remote Bridge 语音识别」小窗口和 macOS 权限弹窗，点击允许；
4. 授权后，按住手机语音键说话，松开即由 Mac 本机识别。

Apple Speech 使用 `zh-CN`，在支持时启用 on-device 识别，音频不经过手机 Web Speech，也不需要 Mac 输入框焦点。识别结果会出现在手机端显示框、电脑端事件流，并按当前「输出」方式处理。

如果 Apple Speech 返回失败，但手机 Web Speech 在同一段语音里获得了文字，电脑端会自动改用手机识别结果，并在事件流显示「Mac 本机识别失败，改用手机识别」。失败详情会附带音频字节数和 PCM 峰值，便于判断手机音频是否真正送达。

如果授权窗口没有出现，可以在终端执行：

```bash
npm run speech:authorize
```

或者到「系统设置 → 隐私与安全性 → 语音识别」中允许 Remote Bridge Helper。开发模式下每次重新编译并更换签名后，macOS 可能要求重新授权。

手机端按键上方新增「语音识别」显示框：手机网页识别时实时显示转写结果；Mac 豆包或 Apple Speech 识别完成后，服务端会把文字同步到手机端显示框，并标注来源。

识别来源和输出方式保存在当前电脑浏览器中，切换后立即生效。识别来源切换时会通过桥接关闭/开启 Mac 输入框文字捕获和 Apple Speech，避免多种方案互相覆盖。

选择 Mac 豆包或 Mac 本机时，服务端会通知手机页面停止它自己的 Web Speech。部分手机浏览器会让 Web Speech 独占麦克风，导致同时进行的 PCM 采集变成静音；关闭手机会话识别后，PCM 音频可以正常送到 Mac。

### 手机键盘输入（Web Speech 不可用时）

如果手机浏览器的 Web Speech 识别不可用，可以直接使用手机系统输入法的语音功能：

1. 点击手机遥控器底部的「键盘输入」按钮；
2. 在弹出的输入框中，使用手机输入法（豆包、搜狗、系统键盘等）的语音键听写；
3. 确认文字无误后点击「发送到电脑」；
4. 电脑端按照当前「输出」方式处理：
   - **自动（推荐）**：焦点在 Mac 应用时自动输入 Mac；焦点在 RustDesk 时自动发送到 Windows；
   - **Mac 剪贴板**：复制到 Mac 剪贴板；
   - **Mac 拼音**：转成拼音并输入当前 Mac 焦点；
   - **仅 Windows**：发送给 Windows 助手，直接输入当前 Windows 焦点窗口。

这个方式不依赖 Web Speech API，也不需要 Mac 输入框焦点。电脑端接收端需要保持打开；事件流会显示「收到手机键盘文字」。手机端识别显示框会标注来源为「手机键盘」。

手机键盘发送**不会自动激活 RustDesk 或切换窗口**：拼音按键会直接发送到 Mac 当前前台焦点应用。要输入到 Windows，请先让 RustDesk 窗口保持前台；目标窗口的焦点不会被桥接改变。

输入面板固定在屏幕底部。打开面板时会锁定遥控器的位置和尺寸，关闭时等软键盘完全收起后再恢复，因此上方遥控按键不会重新排版或形变。

快捷键：手机输入法键盘上的「发送 / 回车」键可以直接发送；`Shift+Enter` 换行。桌面浏览器也可按 `Cmd+Enter` 或 `Ctrl+Enter`。

### 拼音按键输入到远程 Windows

如果 Windows 只能通过 RustDesk 接收键盘、不能可靠接收剪贴板，可以把识别文字转成无音调拼音，再由 Mac 桥接作为普通字母键发送。RustDesk 转发这些按键后，由 Windows 中文输入法组成候选文字。

1. 在语音面板把「输出」设为「拼音按键」。
2. 输入前桥接会自动把 Mac 输入法临时切到英文（ABC），输入完成后恢复原来的输入法；如果切换失败，会提示手动切换。
3. Windows 输入法保持中文拼音状态，并把焦点放在目标输入框。
4. 选择识别来源：
   - **手机网页**：松开语音键后，最终识别文字会自动转成拼音。请让 RustDesk 保持 Mac 前台，桥接检测到后输入；不会自动切换窗口。
   - **Mac 豆包**：识别完成后会自动排队拼音按键；请手动切换到 RustDesk 窗口，桥接检测到后输入。语音面板里的「拼音按键」按钮可以重新发送最近一次识别文字。

拼音转换使用本地 `pinyin-pro`，不会上传识别文字。每个汉字的拼音之间会加一个空格，例如「你好世界」→ `ni hao shi jie`。中文标点会转换成对应的 ASCII 标点，例如「，」→ `,`、「。」→ `.`。拼音只输入字母和空格，Windows 输入法会显示候选，需要你选择候选或按空格确认；多音字和同音词仍由输入法决定。

注意：

- 语音识别触发的拼音按键目标窗口固定为 RustDesk。桥接不会自动切换窗口，只会等待 RustDesk 成为前台，最多 20 秒。
- 手机键盘输入触发的拼音按键不会自动激活或等待 RustDesk，而是直接发送到 Mac 当前前台焦点应用。
- 拼音按键在 HID 层级注入普通 `CGEvent`，与 RustDesk 的 `rdev` / `CGEventTap` 键盘监听层级一致；已用 HID listen-only event tap 验证合成按键可见。
- 英文单词会原样保留；如果 Windows 输入法处于中文模式，英文也可能被当作拼音，中英混排时建议改用剪贴板方式。
- 如果 Mac 输入法自动切换失败，需要手动切到英文（ABC），否则字母可能在本机被输入法消费。
- 拼音按键依赖辅助功能权限，并且输入目标是 Mac 前台应用中的焦点窗口。

### 自动输出（Mac / Windows）

「输出」选择：

```text
输出：自动（推荐）
```

桥接会在输出时检查 Mac 当前前台应用：

- Mac 前台不是 RustDesk：自动用 Unicode 输入到 Mac 当前焦点；
- Mac 前台是 RustDesk：自动发送给 Windows 助手，由 Windows 输入当前焦点。

因此不需要事先决定“Mac 模式”还是“Windows 模式”，也不需要来回切换。前提是 Windows 助手已经连接；如果焦点在 RustDesk 但助手未连接，会提示失败。

自动模式不适用于 Mac 豆包捕获：豆包识别时文字已经写入 Mac 输入框，自动模式会跳过这次捕获，避免重复输入。Mac 豆包模式请使用手机识别或剪贴板/拼音组合。

### Mac 直接输入（自动模式）

自动模式在 Mac 前台不是 RustDesk 时，会使用 Unicode 键盘事件直接把文字写入当前焦点输入框，不修改剪贴板，因此不会触发 RustDesk 剪贴板同步或 Windows 粘贴窗口。

注意：

- 输入目标是当时 Mac 的前台应用，不会主动切换窗口。
- 需要辅助功能权限；开启“安全输入”的应用可能拒绝合成文字。
- 少数应用不接受 Unicode 键盘事件，此时可以使用「Mac 剪贴板」手动粘贴。
- Mac 豆包捕获文字时，文字已经写在实际输入框中，自动模式会跳过，避免重复输入。

### Windows 直接输入助手

如果 Windows 和 Mac 在同一局域网，可以运行一个 Windows 小助手，把识别出的中文**直接输入到 Windows 当前焦点窗口**，不再经过拼音和 Windows 输入法：

```text
语音识别中文
→ 电脑端
→ WebSocket
→ Windows 助手
→ SendInput Unicode
→ 当前 Windows 输入框
```

#### 使用步骤

1. 在 Windows 上打开由 Mac 提供的脚本地址：
   ```text
   http://<Mac 的局域网 IP>:3000/agent/RemoteBridgeAgent.ps1
   ```
2. 在电脑端语音面板把「输出」设为以下之一：
   - **自动（推荐）**：焦点在 Mac 应用时输入 Mac；RustDesk 前台时发送到 Windows；
   - **仅 Windows**：固定发送到 Windows 助手。
3. 在「系统桥接 → Windows 助手」点击「复制启动命令」；命令会在 Windows 后台隐藏启动助手，包含下载地址、WebSocket 地址和配对 token。
   也可以手动运行：
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\RemoteBridgeAgent.ps1 `
     -Server ws://<Mac 的局域网 IP>:3000/ws `
     -Token <配对 token>
   ```
4. 助手连接后，「Windows 助手」会显示在线数量。
5. 在 Windows 中保持目标输入框焦点，然后在手机端说话或发送键盘文字；文字会直接输入。

#### 本机启动与状态检测（服务端运行在 Windows 时）

如果 Remote Bridge 服务本身运行在 Windows 上，电脑端会显示 **启动本机助手 / 停止本机助手** 按钮：

- **未启动**：本机没有运行受管助手；
- **本机启动中…**：服务端已经拉起隐藏的 PowerShell，但还没有连上 WebSocket；
- **本机已连接**：本机助手已经连接，可以输入文字；
- **N 台远程在线**：连接的是其它 Windows 机器上的助手。

实现方式：

- 服务端通过 `presence.localAgents` 判断本机助手是否已经连接；
- 点击「启动本机助手」时，服务端直接 `spawn` `powershell.exe`，使用 `ws://127.0.0.1:<HTTP 端口>/ws` 和当前配对 token，不需要复制命令；
- 助手脚本使用命名互斥量避免重复启动多个实例；
- 点击「停止本机助手」会向带 `local` 标记的助手发送 `agent-shutdown`，并结束服务端拉起的子进程；
- 设置 `AUTO_START_WINDOWS_AGENT=1` 后，服务启动时会自动拉起本机助手。

「复制启动命令」仍然保留，用于 Mac 服务端控制另一台 Windows，或在 Windows 上手动启动未受管的助手。

#### 注意事项

- Windows 助手使用 `SendInput` 的 Unicode 模式，不依赖 Windows 输入法，也不会弹出候选。
- 如果希望根据焦点自动选择 Mac 或 Windows，选择「自动（推荐）」。
- 只负责文字输入，不改变 Windows 当前焦点窗口。
- Windows 和 Mac 需要在同一局域网，且 Windows 能访问 Mac 的 HTTP 端口（默认 3000）。
- 助手 PowerShell 窗口可以放在后台；不要把助手窗口保持在前台，否则文字会输入到它自己的控制台。
- 以管理员身份运行的程序可能阻止普通权限助手输入，此时需要以相同权限运行助手。
- 配对 token 可以控制本机桥接，请勿公网暴露服务。

### 系统默认输入与识别文字复制

系统桥接卡片会显示：

- **虚拟麦克风**：Remote Bridge 当前写入的设备；
- **系统默认输入**：macOS 当前的默认输入设备。

如果两者不同，而豆包等输入法使用系统默认麦克风，就可能“有音频但没有识别文字”。可以：

- 在虚拟麦克风下拉框选择与系统默认输入相同的设备，或
- 点击「设为默认输入」，把当前虚拟麦克风设为 macOS 默认输入。

语音开始时，桥接会记录前台输入框的内容；松开语音键后等待输入法（例如豆包）把识别文字写入输入框，再把新增文字复制到 macOS 剪贴板，并在电脑端事件流显示「识别文字已复制」。

注意：

- 这项功能读取的是输入法最终写入输入框的文字，不是豆包的私有 API；
- 输入框需要是前台焦点，并且向 macOS 暴露了 AX 文本值（原生文本框通常可以，部分网页/Electron 输入框可能不行）；
- 复制后可以通过 RustDesk 的剪贴板同步，在 Windows 输入框中按 `Ctrl+V` 粘贴；
- RustDesk 不转发麦克风，因此无法把手机音频直接作为 Windows 豆包的输入设备。

## 语音链路

```text
手机 AudioWorklet
    │  PCM16 / 48 kHz 实时采集
    ▼
HTTPS / WSS
    │
本机 Node 服务 ──────► 电脑网页：组成 WAV 供回放
    │
    ▼
native/RemoteBridgeHelper（Swift + AVAudioEngine）
    │
    ▼
MiRemoteV 2ch / SayAll / BlackHole 2ch
    │
    ▼
输入法 / 会议软件 / 其它使用该麦克风的 App
```

- 手机端使用 Web Audio 的 AudioWorklet 直接采集 PCM，不再依赖 WebM/Opus 编解码。
- 手机语音开始时先建立 PCM 采集图，随后发送 `voice-start`，再发送 PCM 数据，避免开头被截断。
- 松开语音键后保留约 140 ms 尾音并刷新 AudioWorklet，再发送 `voice-end`。
- 电脑端实时接收 PCM，结束后合成为 WAV 供回放。
- 本机桥接以 300 ms 静音拖尾排空播放队列，再释放 Fn 等触发键，避免尾音被截断。
- 选择「本机 SenseVoice」时，PCM 会同时留在 Node 服务内，在松手后离线识别；这条路径不经过本机 Swift 桥接。
- 网页端实时转写仍由手机浏览器的 Web Speech API 提供；部分浏览器可能使用厂商的在线识别服务。PCM 音频本身只发送到你的本机 Node 服务。

### 选择虚拟麦克风

电脑端「系统桥接 → 虚拟麦克风」会列出检测到的虚拟声卡，可以直接在下拉框里切换，例如：

- `MiRemoteV 2ch`
- `SayAll`
- `BlackHole 2ch`
- 其它名称中包含 Loopback / Virtual 的虚拟音频设备

选择后会立即切换，并写入配置持久保存；重启应用后仍使用该设备。

如果没有手动选择，本机桥接按以下优先级自动选择：

1. 环境变量 `SYSTEM_AUDIO_DEVICE` 指定的名称
2. `MiRemoteV` / `SayAll`
3. `BlackHole`

系统桥接卡片始终显示「虚拟声卡需要单独安装 · BlackHole 2ch」折叠说明，展开后可查看官方下载链接、Homebrew 命令、重启音频服务命令和安装步骤。

安装 BlackHole 后，在电脑端点击「重新检测」，下拉框中就会出现 `BlackHole 2ch`；选中即可体验。普通扬声器不会出现在这个下拉框中。

### 安装豆包输入法（语音转文字）

虚拟声卡只负责把手机语音送进 Mac；如果希望「按住说话 → 自动变成文字」，还需要 Mac 上的语音输入工具。推荐豆包输入法，它支持按住 `Fn` 进行语音输入：

- 官方下载：<https://shurufa.doubao.com/pc>
- Homebrew：
  ```bash
  brew install --cask doubaoime
  ```

安装后：

1. 在「系统设置 → 键盘 → 文本输入 → 输入法」中添加豆包输入法；
2. 在豆包输入法设置中把语音快捷键设为 `Fn`，麦克风设为当前虚拟声卡（如 `BlackHole 2ch`）；
3. 电脑端「系统桥接 → 语音触发」也选择 `Fn`；
4. 按住手机语音键开始说话，松开后停止，豆包会把语音转成文字输入到当前焦点输入框。

豆包输入法为第三方软件，本项目不附带。也可以使用 Typeless 等其它支持虚拟麦克风和 `Fn` 触发的语音输入工具。

## HTTPS 与手机麦克风

浏览器只在安全上下文中开放 `getUserMedia`。项目启动时会自动生成包含当前局域网 IP 的自签名证书，放在 `certs/`：

```text
certs/cert.pem
certs/key.pem
certs/openssl.cnf
certs/meta.json
```

优先使用系统的 `openssl`；没有 OpenSSL 时（例如 Windows）会自动改用内置的纯 JavaScript 证书生成器，不需要安装额外工具。`meta.json` 记录证书覆盖的 IP 和过期时间，局域网 IP 变化时会自动重新生成。

自签名证书需要首次手动信任。部分手机浏览器即使接受警告，仍可能限制麦克风；这时建议使用 [mkcert](https://github.com/FiloSottile/mkcert) 生成本机受信任证书，并把根证书安装到手机上。

macOS 示例：

```bash
brew install mkcert
mkcert -install
mkcert -key-file certs/key.pem -cert-file certs/cert.pem \
  localhost 127.0.0.1 192.168.1.100
npm start
```

把 `192.168.1.100` 替换成你电脑当前的局域网 IP。mkcert 生成的根证书需要用 AirDrop / 文件传输安装到手机，并在手机的「关于本机 → 证书信任设置」中启用完全信任。

如果局域网 IP 变化：

- 删除 `certs/cert.pem`、`certs/key.pem`、`certs/openssl.cnf`、`certs/meta.json` 后重启，让项目重新生成；
- 或者按上面的 mkcert 命令重新生成包含新 IP 的证书。

也可以直接指定已有证书：

```bash
CERT_FILE=/path/to/cert.pem KEY_FILE=/path/to/key.pem npm start
```

## 配置项

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | HTTP 端口（电脑页 / API / 仅按键手机端） |
| `HTTPS_PORT` | `3443` | HTTPS 端口（推荐手机端 / 语音） |
| `DATA_DIR` | `./data` | 配置存放目录 |
| `CERT_FILE` | — | 自定义证书路径，需与 `KEY_FILE` 同时设置 |
| `KEY_FILE` | — | 自定义私钥路径 |
| `HTTPS_DISABLED` | — | 设为 `1` 时只启动 HTTP（手机将无法直接录音） |
| `DISABLE_SYSTEM_BRIDGE` | — | 设为 `1` 时只使用网页功能，不编译 / 启动本机桥接 |
| `DISABLE_LOCAL_SPEECH` | — | 设为 `1` 时关闭 Node 本机 SenseVoice 识别来源 |
| `AUTO_START_WINDOWS_AGENT` | — | 在 Windows 上设为 `1` 时，服务启动后自动拉起本机 Windows 文字助手 |
| `SYSTEM_AUDIO_DEVICE` | 自动 | 本机桥接优先匹配的虚拟设备名称，如 `MiRemoteV 2ch` |
| `CERT_DIR` | `./certs` | HTTPS 证书目录（打包应用使用 Application Support 目录） |
| `HELPER_PATH` | 自动编译产物 | 指定预编译的本机桥接可执行文件 |
| `DISABLE_NATIVE_BUILD` | — | 打包应用设为 `1`，禁止运行 `swiftc`，直接使用随包的桥接 |

示例：

```bash
PORT=3100 HTTPS_PORT=3543 SYSTEM_AUDIO_DEVICE="MiRemoteV 2ch" npm start
```

手动重新编译本机桥接：

```bash
npm run build:native
```

服务启动时若检测到 Swift 源码比二进制新，也会自动编译。编译产物在 `native/.build/`，已加入 `.gitignore`。

## 项目结构

```text
mi-remote-bridge/
├── server.js                     # 启动入口
├── start-windows.cmd             # Windows 一键启动（双击）
├── native/
│   ├── RemoteBridgeHelper.swift  # macOS 音频输出与系统按键桥接
│   └── AppLauncher.swift         # 打包应用的菜单栏启动器
├── lib/
│   ├── bridge-server.js          # HTTP API、WebSocket、配对与状态
│   ├── certificate.js            # 自签名 HTTPS 证书
│   ├── config-store.js           # 按键 / 动作配置持久化
│   ├── default-config.js         # 默认配置与动作校验
│   ├── local-speech.js           # Node 本机 SenseVoice 离线识别与模型下载
│   ├── network.js                # 局域网 IP 与 URL
│   ├── system-bridge.js          # 编译、启动、管理本机桥接进程
│   └── windows-agent.js          # Windows 本机文字助手启动与连接状态
├── public/
│   ├── index.html                # 手机遥控端（含 /preview 布局预览模式）
│   ├── pc.html                   # 电脑接收端
│   ├── css/phone.css
│   ├── css/pc.css
│   ├── js/phone.js
│   ├── js/pc.js
│   ├── js/pcm-worklet.js         # 手机 PCM16 实时采集
│   └── agent/RemoteBridgeAgent.ps1 # Windows 文字输入助手
├── scripts/build-native.js       # 手动编译本机桥接
├── scripts/build-mac.js          # 打包 .app 与 .dmg
├── scripts/download-model.js     # 提前下载 SenseVoice 模型
├── scripts/start-windows.ps1     # Windows 一键启动脚本
├── test/bridge.test.js           # 服务端集成测试
├── data/config.json              # 运行时生成
├── data/models/                  # 本机识别模型（首次下载，已 gitignore）
└── certs/                        # 运行时生成
```

## WebSocket 协议

连接地址：`/ws`。客户端先发送（PC 和 phone 都必须携带同一个启动期 token）：

```json
{ "type": "hello", "role": "phone", "token": "..." }
```

`role` 为 `phone`、`pc` 或 `agent`。Windows 本机助手在 `hello` 中额外携带 `"local": true`。之后：

| 方向 | 消息 | 说明 |
| --- | --- | --- |
| 手机 → 服务端 | `{"type":"key","key":"ok"}` | 按键事件 |
| 手机 → 服务端 | `{"type":"phone-text","text":"...","source":"keyboard"}` | 手机键盘输入的文字 |
| 服务端 → 手机 | `{"type":"phone-text-ack","deliveredTo":1}` | 文字已转发给电脑端 |
| 手机 → 服务端 | `{"type":"voice-start","id":"...","format":"pcm16","sampleRate":48000,"channels":1}` | 建立 PCM 语音会话 |
| 手机 → 服务端 | 二进制帧 | `2 字节会话 ID 长度 + 会话 ID + PCM16 字节` |
| 手机 → 服务端 | `{"type":"voice-transcript","id":"...","text":"..."}` | 实时转写 |
| 手机 → 服务端 | `{"type":"voice-end","id":"...","durationMs":1000,"transcript":"..."}` | 结束语音 |
| 电脑 → 服务端 | `{"type":"system-enable","enabled":true}` | 开关系统桥接 |
| 电脑 → 服务端 | `{"type":"system-request-accessibility"}` | 请求辅助功能授权 |
| 电脑 → 服务端 | `{"type":"system-set-apple-speech","enabled":true}` | 开关 Apple Speech 本机识别 |
| 电脑 → 服务端 | `{"type":"system-request-speech-access"}` | 打开语音识别授权窗口 |
| 电脑 → 服务端 | `{"type":"local-speech-download"}` | 下载并加载本机 SenseVoice 模型 |
| 服务端 → 电脑 | `{"type":"local-speech-status","state":"downloading","progress":{"percent":42}}` | 本机模型下载 / 加载状态 |
| 服务端 → 电脑 | `{"type":"speech-result","source":"apple","text":"...","final":true}` | Apple Speech 识别结果 |
| 电脑 → 服务端 | `{"type":"agent-type-text","text":"..."}` | 发送文字给 Windows 助手 |
| 电脑 → 服务端 | `{"type":"agent-start-local"}` | 在 Windows 服务端启动本机文字助手 |
| 电脑 → 服务端 | `{"type":"agent-stop-local"}` | 停止带 `local` 标记的本机文字助手 |
| 服务端 → 电脑 | `{"type":"agent-local-status","supported":true,"running":true,"localConnected":false}` | 本机助手进程 / 连接状态 |
| 服务端 → Windows 助手 | `{"type":"agent-shutdown"}` | 请求本机助手退出 |
| 服务端 → Windows 助手 | `{"type":"agent-text","id":"...","text":"..."}` | Windows 助手需要输入的文字 |
| 电脑 → 服务端 | `{"type":"agent-ack","id":"...","deliveredTo":1}` | 文字已发送给助手 |
| Windows 助手 → 服务端 → 电脑 | `{"type":"agent-result","id":"...","ok":true}` | 助手输入结果 |
| 电脑 → 服务端 | `{"type":"system-type-pinyin","text":"...","waitForRustDesk":true}` | 把识别文字转成拼音，等待 RustDesk 前台后输入 |
| 电脑 → 服务端 | `{"type":"system-type-mac-text","text":"..."}` | Unicode 直接输入文字到 Mac 当前焦点 |
| 电脑 → 服务端 | `{"type":"system-auto-text","text":"..."}` | 根据 Mac 前台应用自动选择 Mac 或 Windows |
| 电脑 → 服务端 | `{"type":"recognition-language","language":"en-US"}` | 切换识别语言并同步到手机 |
| 服务端 → Windows 助手 | `{"type":"agent-text","id":"...","text":"..."}` | 自动路由到 Windows 的文字 |
| 服务端 → 电脑 | `key` / `voice-start` / `voice-transcript` / `voice-end` / `presence` / `config` / `system-status` / `system-event` | 实时广播 |
| 服务端 → 电脑 / 手机 | `{"type":"speech-result","source":"local","text":"...","final":true,"latencyMs":70}` | 本机 SenseVoice 识别结果 |
| 服务端 → 手机 | `{"type":"speech-result","source":"mac","text":"..."}` | 把 Mac 豆包识别结果同步到手机显示框 |

## 测试

```bash
npm test
```

测试覆盖：

- 配对 token 与未授权访问拒绝
- 配置校验、动作校验与持久化
- 二维码连接信息
- 按键与动作广播
- 配置广播
- PCM 语音二进制转发
- 在线 / 离线状态
- 中文转拼音与拼音按键请求
- Mac 豆包识别结果向手机端同步
- Apple Speech 识别结果向电脑和手机同步
- 手机键盘文字转发与确认
- Windows 助手文字转发与输入结果
- 自动模式路由到 Windows 助手
- 中英文识别语言同步
- 本机 SenseVoice PCM 缓冲、重采样与识别结果广播
- 本机模型下载请求与状态同步
- 无 OpenSSL 环境下的内置 HTTPS 证书生成与复用
- Windows 本机助手的启动、停止、状态同步和 `local` 连接标记

本项目开发时还使用 Chromium 和真实 macOS 虚拟音频设备完成了以下手工验收：

- 手机浏览器 PCM 语音 → Node 服务 → `MiRemoteV 2ch` → 另一进程录音检测
- 自定义快捷键录制与保存
- 系统动作缺少辅助功能权限时的错误反馈
- HTTPS 页面录音、二维码配对与移动端布局
- 拼音按键输入到临时文本窗口，并验证 Mac 输入法自动切换为 ABC 后恢复
- Mac 直输在 TextEdit 中验证 Unicode 直接输入，无需手动 Cmd+V
- 自动模式在 TextEdit 中验证 Mac 输入，在 RustDesk 测试 App 中验证路由到 Windows
- Apple Speech 英文 en-US 使用英文 TTS 验证识别
- 手机端识别显示框接收 Mac 豆包结果，并在 iPhone / 小屏 / 横屏尺寸下验证布局

## 已知限制

- 本机系统桥接只支持 macOS；非 macOS 环境只能使用网页端语音回放。
- 需要已有 `MiRemoteV 2ch` / `SayAll` / `BlackHole 2ch` 虚拟音频设备；应用会在未检测到时提供 BlackHole 下载入口和 Homebrew 命令，但不会自动安装驱动。
- 触发真实快捷键、聚焦输入框和按住 Fn 需要辅助功能权限；未授权时语音麦克风仍可用。
- 支持通过系统蓝牙网络共享建立 IP 连接，但不包含蓝牙配对界面或物理蓝牙遥控器读取。
- 布局是自由网格：所有按键按列表顺序排列，每行可选 2–4 个；说明按钮不参与布局。按键可以隐藏或恢复，隐藏后网格自动收拢。
- 暂不支持任意像素坐标、不同按键尺寸或跨行跨列的按键；当前通过顺序 + 每行数量来自由排布。
- 自定义按键也支持单击 / 双击 / 长按三套动作，可在「按键功能」视图中配置；快捷键仍然通过自定义按键行的「录制快捷键」设置单击动作。
- 暂不包含单击 / 双击 / 长按三套独立动作、应用专属按键方案或宏。
- 真实快捷键注入需要在用户机器上授予辅助功能权限。本项目已验证未授权时的错误反馈与配置调用链，但授权后的系统级按键注入仍需在实际 Mac 上完成最终确认；macOS 不向自动化提供绕过该权限的方式。
- 本机 SenseVoice 是整段识别，不提供说话过程中的实时 partial 文字；首次使用需要下载约 163 MB 模型，并占用几百 MB 内存。
- 语音转写由手机浏览器的 Web Speech API 决定；没有转写不代表音频失败。
- 上传的音频文件只进入电脑页回放，不进入系统虚拟麦克风。
- 配对 token 是局域网级轻量方案，不是账号体系。请勿公网暴露服务。

## 常见问题

**重启应用后还需要重新扫码吗？**

不需要。首次扫码后，配对码保存在数据目录的 `pair-token` 文件里，手机会用 `localStorage` 记住它；只要访问地址不变，重启应用或刷新页面都会自动重连。

以下情况仍需重新扫码：

- 删除了 `pair-token`（主动重置配对）；
- Mac 的局域网 IP / 访问地址发生变化；
- 手机使用了隐私模式或清除了浏览器数据；
- 服务端提示配对失效。

**没有安装虚拟声卡 / 显示「未检测到虚拟麦克风」**

- 系统桥接卡片会自动出现「未检测到虚拟声卡」面板；
- 点击「下载 BlackHole 2ch」前往官方安装包，或复制 `brew install blackhole-2ch` 执行；
- 安装后重启电脑，或执行 `sudo killall coreaudiod`，然后点击「重新检测」；
- 项目不会静默安装驱动，安装系统音频驱动需要管理员权限。

**系统桥接显示「未就绪」或「系统桥接不可用」**

先在终端执行：

```bash
npm run build:native
```

确认本机装有 Xcode Command Line Tools，并且音频设备中存在 `MiRemoteV 2ch`、`SayAll` 或 `BlackHole 2ch`。也可以设置 `SYSTEM_AUDIO_DEVICE` 指定设备。然后重启服务。

**语音已进入电脑页，但输入法没有反应**

- 确认系统桥接已启用；
- 确认输入法 / 会议软件的麦克风选的是 `MiRemoteV 2ch`（或对应虚拟设备）；
- 检查虚拟设备没有被静音、音量没有被拉到 0；
- 如果依赖 Fn 等触发键，确认辅助功能已授权，且输入工具的触发方式与配置一致；
- 某些 App 需要重新打开才能识别麦克风。

**手机 Web Speech 没有返回识别文字**

点击手机遥控器底部的「键盘输入」按钮，使用手机输入法的语音键听写，确认后点击「发送到电脑」。这条路径不依赖 Web Speech，也不需要 Mac 输入框焦点。电脑端事件流会显示「收到手机键盘文字」。

**Mac 本机识别失败：No speech detected**

失败信息现在会附带「音频字节数」和「峰值」：

- **收到 0 字节**：音频没有进入桥接，确认系统桥接已启用、手机麦克风有声音。
- **峰值接近 0**：桥接收到的是静音，检查手机浏览器麦克风权限或换用手机网页识别。
- **字节数和峰值正常，仍提示 No speech detected**：Apple Speech 没有检测到语音，可靠近麦克风、延长说话时间；同时确认系统听写/Siri 可用。
- 如果同一段语音在手机 Web Speech 里有文字，电脑端会自动改用手机识别结果，不需要重新说一遍。

**选择了「拼音按键」但没有输入**

- 看电脑端事件流是否出现「拼音已转换」。出现说明中文已经转成拼音并送往桥接；没有出现说明没有触发转换，检查识别来源、是否有识别文字，以及是否仍在使用旧版服务。
- 拼音只会输入到 RustDesk。桥接不会自动切换窗口；请让 RustDesk 成为前台，事件流显示「拼音按键等待中」，最多等待 20 秒。
- 如果出现「等待 RustDesk 窗口超时」，确认 RustDesk 正在运行并切换到它，然后点击「拼音按键」重试。
- 如果出现辅助功能权限错误，先授权本机桥接，再点击「拼音按键」。
- Windows 输入法需要处于中文拼音状态；拼音字母会进入候选栏，仍需选择候选或按空格确认。
- 修改代码后需要重启服务或重新打开 App；手机端页面也要刷新。

**按键动作失败，提示需要辅助功能权限**

点击系统桥接卡片的「授权」，或打开「系统设置 → 隐私与安全性 → 辅助功能」，允许本机桥接 / 启动它的终端应用，然后点击「重新检测」。如果系统把权限记在终端或 Node 进程名下，请授权对应条目。

**服务重启后手机提示「配对已失效」**

每次启动都会生成新 token。重新扫描电脑端二维码即可。不要让手机只收藏不带 `pair` 参数的旧地址。

**电脑页面显示「需在本机打开」**

电脑接收端必须从运行服务的机器通过 `http://localhost:3000/pc` 打开，才能获取配对 token。通过局域网 IP 打开电脑页会被拒绝。

**HTTPS 证书警告**

自签名证书是正常的本地开发体验。选择继续访问；如果手机仍禁止麦克风，按上文使用 mkcert 并安装根证书。

## 隐私与来源

- 手机麦克风音频只经 WSS 发送到你自己的 Node 服务，再写入本机虚拟音频设备；本项目不上传语音到云端。
- 选择「本机 SenseVoice」时，音频只在 Node 进程内识别；模型文件从 GitHub Releases 下载一次，之后完全离线。
- 实时文字转写可能由手机浏览器的 Web Speech 实现调用浏览器厂商的在线服务，取决于浏览器。
- 本项目的功能方向参考了 [HD838A/remote-mic-app（无线麦 SayAll）](https://github.com/HD838A/remote-mic-app) 的产品思路；本项目代码为独立实现，不包含 SayAll 的虚拟声卡驱动、私有模块或品牌资源。
