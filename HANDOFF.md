# GTD 交付手册

> 配套 [PRD.md](./PRD.md) 阅读。本文档说明：当前实现状态、需要你介入的环节、本地启动流程、验收方法。

## 0. TL;DR

- ✅ 业务逻辑、UI、同步、AI、MCP server 全部实现并通过测试（TS 45 + Rust 13 共 58 个自动化测试）
- ⚠️ 需要你介入的主要是 **平台脚手架**（iOS/Android/Harmony 工程目录）、**密钥真实接入**、**应用签名**、**真实服务端连调**
- ❌ 我**没有也无法**做的：用你的账号登录任何服务、生成开发者证书、把 app 上架商店

---

## 1. 当前实现状态

### 1.1 已实现并通过测试

| 模块 | 路径 | 状态 |
|---|---|---|
| 共享 core 库（数据模型 / ULID / Markdown 解析 / Vault / 搜索 / WebDAV / AI / 同步合并） | `packages/core/` | ✅ 45 测试通过 |
| Tauri 桌面端 UI（首页、详情、标签、搜索、4 个设置子页、冲突解决页） | `apps/desktop/src/` | ✅ TS 类型干净 |
| Tauri Rust 壳 + `export_vault` 命令 + fs/dialog 插件 | `apps/desktop/src-tauri/` | ✅ Cargo check 干净 |
| React Native 移动端 UI（9 个屏幕） | `apps/mobile/src/` | ✅ 业务层完整 |
| Rust MCP server（独立二进制，stdio 协议，7 个 tool） | `apps/mcp-server/` | ✅ 13 测试通过 |
| 自动同步 30s 防抖 + 启动同步 + 启动时 tombstone GC | 桌面 & 移动 store | ✅ |
| 桌面键盘导航 J/K/Space/Enter/Cmd+Delete | `apps/desktop/src/pages/HomePage.tsx` | ✅ |
| 移动端长按复制 | `apps/mobile/src/components/EntryRow.tsx` | ✅ |

### 1.2 已实现但需要你确认/调试

| 项 | 现状 | 你需要做 |
|---|---|---|
| Tauri 桌面端启动 | 代码完整，但你没在本地跑过 `pnpm tauri:dev` | 第一次启动会下载 Rust 依赖 + WebKit；按下文 §3 操作 |
| WebDAV 同步 | 用 fetch 写了完整 client，逻辑+合并算法都有测试 | 用你的坚果云 / NextCloud 跑一次「测试连接」→「立即同步」 |
| AI 流式输出 | Anthropic / OpenAI / Ollama / 自定义四种 provider 都实现 | 填真实 API Key 跑一次「问 AI」验证 |
| MCP server 接入 Claude Desktop | 二进制可编译运行 | 改 `~/Library/Application Support/Claude/claude_desktop_config.json`（见 §5） |

### 1.3 暂未实现（需要你或后续迭代）

| 项 | 原因 | 解决路径 |
|---|---|---|
| iOS/Android/Harmony **原生工程目录** | RN 原生工程需要 `npx @react-native-community/cli init` 在本地生成；模板含 Podfile、build.gradle、签名配置等 | 见 §4 |
| Tauri Stronghold **真实密钥库** | 当前桌面端用 `localStorage` 暂存密码作为 shim | 装 `tauri-plugin-stronghold`，把 `vaultStore.ts` 中 `saveSecret/loadSecret` 切换实现 |
| Tauri **全局快捷键** `Cmd/Ctrl+N`（App 在后台也响应） | 需 `tauri-plugin-global-shortcut` + 系统权限 | 装插件 + 在 setup hook 注册 |
| 应用 **图标 / 启动屏** | `tauri.conf.json.bundle.icon` 是空数组 | 生成 ico/icns/png 套件放 `src-tauri/icons/` |
| **签名 / 公证** | 没有证书 | macOS：Apple Developer ID；Windows：EV 证书；移动端：各自商店签名 |
| **CI / 自动构建** | 没配 | 用 `tauri-action` GitHub workflow |
| 真实 **Harmony 适配**（`react-native-harmony`） | 鸿蒙工程必须用 DevEco Studio + 官方 RN-Harmony 模板 | 见 §4.3 |

---

## 2. 仓库结构

```
gtd/
├── PRD.md                       产品需求
├── HANDOFF.md                   本文档
├── README.md
├── package.json                 monorepo 根
├── pnpm-workspace.yaml
├── tsconfig.base.json
│
├── packages/core/               共享 TS 库
│   ├── src/
│   │   ├── types.ts             Entry / AppConfig / 预置 prompt 模板
│   │   ├── ulid.ts              26 字符 Crockford Base32
│   │   ├── tags.ts              内联标签提取
│   │   ├── parser.ts            Markdown → DayFile
│   │   ├── serializer.ts        DayFile → Markdown
│   │   ├── fs.ts                FileSystem 接口 + MemoryFileSystem
│   │   ├── vault.ts             CRUD + 缓存 + tombstone GC + 冲突解决
│   │   ├── search.ts            搜索语法解析
│   │   ├── webdav.ts            纯 fetch 实现的 WebDAV client
│   │   ├── sync.ts              双向同步 + entry-level 合并
│   │   └── ai.ts                Anthropic / OpenAI / Ollama 流式客户端
│   └── src/__tests__/           vitest 测试（45 个）
│
├── apps/desktop/                Tauri 2 + React + TS
│   ├── src/
│   │   ├── main.tsx             路由
│   │   ├── App.tsx              全局快捷键 + 路由出口
│   │   ├── styles.css
│   │   ├── pages/               9 个页面
│   │   ├── components/          QuickInput / EntryList / EntryRow / AskAI
│   │   ├── state/vaultStore.ts  Zustand store（init/refresh/CRUD/sync/AI）
│   │   └── platform/tauriFs.ts  TauriFileSystem + LocalStorage 回退
│   └── src-tauri/               Rust 壳
│       ├── Cargo.toml
│       ├── tauri.conf.json
│       ├── capabilities/default.json
│       └── src/main.rs          `export_vault` 命令 + 插件注册
│
├── apps/mobile/                 React Native (兼容 Harmony)
│   ├── src/
│   │   ├── App.tsx              react-navigation stack
│   │   ├── theme.ts             light/dark + 通用样式
│   │   ├── screens/             9 个 screen
│   │   ├── components/          EntryList / EntryRow / AskAI
│   │   ├── state/vaultStore.ts  与桌面对等
│   │   └── platform/            rnFs.ts / keychain.ts
│   ├── index.js / app.json / metro.config.js / babel.config.js
│   └── package.json
│
└── apps/mcp-server/             Rust 独立二进制
    ├── Cargo.toml
    ├── src/main.rs              JSON-RPC over stdio
    ├── src/vault.rs             复用同一 Markdown 格式（含 13 个测试）
    ├── src/tools.rs             7 个 MCP tool
    └── README.md
```

---

## 3. 本地启动

### 3.1 一次性环境检查

| 工具 | 最低版本 | 验证 |
|---|---|---|
| Node | 20+ | `node -v` |
| pnpm | 9+ | `pnpm -v` |
| Rust | 1.77+ | `cargo --version` |
| Xcode CLT（macOS） | — | `xcode-select -p` |

```bash
cd /Users/chenke/Projects/AIProjects/gtd
pnpm install
pnpm --filter @gtd/core build      # 必须先 build core，因为 desktop/mobile 都消费它的 dist
```

### 3.2 桌面端

```bash
# 第一次启动：会编译 Tauri 依赖（~5min）
pnpm --filter @gtd/desktop tauri:dev
```

第一次需要：
1. 同意 macOS 安装 Tauri WebKit 运行时（自动）
2. 默认 vault 根目录是 `~/GTD-Vault`，没有的话自动创建
3. 在「设置 → 同步配置」填 WebDAV 信息（坚果云 `https://dav.jianguoyun.com/dav/` 是已知可用）

#### 仅前端跑（用浏览器看 UI，不带文件系统）

```bash
pnpm --filter @gtd/desktop dev
# 访问 http://localhost:1420
```

此模式下数据会落到 `localStorage`，不与真实文件系统交互。**只适合 UI 调试**。

### 3.3 移动端

> ⚠️ 跑移动端**之前**必须先做 §4。

```bash
pnpm --filter @gtd/mobile start          # 启动 Metro
# 另开终端：
pnpm --filter @gtd/mobile ios            # 或 android / harmony
```

### 3.4 MCP server

```bash
cargo build --release --manifest-path apps/mcp-server/Cargo.toml
# 产物路径：apps/mcp-server/target/release/gtd-mcp-server
```

直接验证 server（手动塞一条 initialize 请求）：

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | ./apps/mcp-server/target/release/gtd-mcp-server
```

应输出包含 `serverInfo`、`tools` 能力的响应。

### 3.5 全套自动化测试

```bash
pnpm --filter @gtd/core test                                    # 45 个
cargo test --manifest-path apps/mcp-server/Cargo.toml          # 13 个
pnpm --filter @gtd/desktop typecheck                           # TS 检查
```

---

## 4. 你需要做的：原生工程初始化

由于 React Native 原生工程目录依赖 `npx init` 模板，**我无法替你生成**（涉及 CocoaPods、Gradle、Bundle ID、签名描述文件）。下面给你具体步骤。

### 4.1 iOS / Android（标准 RN）

```bash
cd /Users/chenke/Projects/AIProjects/gtd/apps/mobile

# 1) 在临时目录初始化一个 RN 模板，拿走 ios/ 和 android/
cd /tmp
npx @react-native-community/cli@latest init GTDScaffold --version 0.74.0 --skip-install
cp -R /tmp/GTDScaffold/ios /Users/chenke/Projects/AIProjects/gtd/apps/mobile/
cp -R /tmp/GTDScaffold/android /Users/chenke/Projects/AIProjects/gtd/apps/mobile/

# 2) 改 ios/GTD/Info.plist 和 android/app/src/main/AndroidManifest.xml 中 Bundle ID:
#    app.gtd.mobile

# 3) iOS：装 Pods
cd /Users/chenke/Projects/AIProjects/gtd/apps/mobile/ios
pod install

# 4) 把工作区 hoist 的依赖路径接进来。RN 不完全兼容 pnpm hoisting，
#    建议加 .npmrc:
#       node-linker=hoisted
#       public-hoist-pattern[]=*react-native*
cat > /Users/chenke/Projects/AIProjects/gtd/apps/mobile/.npmrc <<EOF
node-linker=hoisted
public-hoist-pattern[]=*react-native*
EOF
pnpm install
```

完成后：

```bash
pnpm --filter @gtd/mobile ios
pnpm --filter @gtd/mobile android
```

### 4.2 必须的原生集成步骤

每个原生模块都需要在 iOS 端 `pod install`、Android 端自动 link：

- `react-native-fs`
- `react-native-keychain`
- `react-native-gesture-handler`（必须在 `MainActivity.java` / `AppDelegate.mm` 启用）
- `react-native-safe-area-context`
- `react-native-screens`
- `react-native-swipe-list-view`（纯 JS，无需 link）
- `@react-native-clipboard/clipboard`

### 4.3 鸿蒙（HarmonyOS）

鸿蒙必须用 **DevEco Studio** + 官方 `react-native-harmony` 模板：

1. 安装 DevEco Studio 4.x
2. 克隆模板：<https://gitee.com/openharmony-sig/ohos_react_native>
3. 把 `apps/mobile/src/` 作为 JS bundle 入口接入
4. 鸿蒙的 keychain 需用 `@ohos.security.huks` 替换 `react-native-keychain`（已在 §5.3 的 FileSystem 抽象处预留接口，但 `keychain.ts` 还是 RN 版本）

> 鸿蒙 RN 生态仍在快速变化，建议先把 iOS/Android 跑通后再处理。

---

## 5. 配置接入

### 5.1 WebDAV（推荐先用坚果云验证）

1. 登录坚果云 → 账户信息 → 安全选项 → 添加应用 → 复制密码
2. App「设置 → 同步配置」：
   - URL：`https://dav.jianguoyun.com/dav/`
   - 用户名：邮箱
   - 密码：应用密码
3. 点「测试连接」→「保存」→「立即同步」

### 5.2 AI Provider

| Provider | 端点 | API Key 来源 |
|---|---|---|
| Anthropic | 默认 | <https://console.anthropic.com/> |
| OpenAI | 默认 | <https://platform.openai.com/> |
| Ollama | `http://localhost:11434/api/chat` | 本地无需 key，先 `ollama serve` |
| 自定义 | 你的 OpenAI 兼容端点 | — |

「设置 → AI 配置」勾选「启用 AI」→ 填入信息 → 点「测试」应该收到 `hello` 输出。

### 5.3 Claude Desktop 接入 MCP server

编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "gtd": {
      "command": "/Users/chenke/Projects/AIProjects/gtd/apps/mcp-server/target/release/gtd-mcp-server",
      "env": {
        "GTD_VAULT_ROOT": "/Users/chenke/GTD-Vault"
      }
    }
  }
}
```

重启 Claude Desktop。在对话窗口左下角应看到 `🔌 gtd` 标识。试一句：

> 用 gtd 工具列出我今天的待办

应当调用 `list_entries` 并返回 JSON。

---

## 6. 还需要补的功能（按优先级）

> 这些都是「锦上添花」或「上架前必做」，不影响日常使用。

### 高（上架前必做）

- [ ] **应用图标**：用 [tauri icon CLI](https://tauri.app/v1/guides/features/icons) 生成 `src-tauri/icons/` 全套
- [ ] **签名 + 公证（macOS）**：申请 Apple Developer，配置 `tauri.conf.json.bundle.macOS.signingIdentity`
- [ ] **真实密钥库**：装 `tauri-plugin-stronghold`，把 `apps/desktop/src/state/vaultStore.ts` 中的两个函数：
  ```ts
  export async function saveSecret(ref, value) { /* localStorage 写入 */ }
  export async function loadSecret(ref)        { /* localStorage 读取 */ }
  ```
  换成调用 Stronghold 的实现

### 中（体验提升）

- [ ] **全局快捷键 Cmd+N**：当前快捷键只在窗口聚焦时响应。装 `tauri-plugin-global-shortcut`：
  ```toml
  tauri-plugin-global-shortcut = "2"
  ```
  在 `main.rs` 注册 `Cmd+N` → emit 事件 → 前端聚焦输入框
- [ ] **冲突归档清理**：`.conflicts/` 目录目前会无限增长。可在 `gcTombstones` 同时清理 30 天前的归档
- [ ] **窗口位置/大小记忆**：装 `tauri-plugin-window-state`

### 低（可选）

- [ ] **CI**：GitHub Actions + `tauri-action` 自动出 macOS/Windows/Linux 三平台安装包
- [ ] **崩溃上报关闭**：默认关闭（PRD §8.1），保持现状即可
- [ ] **Obsidian 兼容性测试**：把生成的 `2026/05/2026-05-XX.md` 拖进 Obsidian，确认 frontmatter 不会被破坏

---

## 7. 验收清单（对照 PRD §9）

复制下面这份清单逐项勾选。已自动测试的项目我已勾上，剩下的需要你手工跑一次。

### 数据规范（自动测试覆盖）

- [x] 创建/修改/删除 entry 后文件内容符合 §6.2 规范（`serializer.test.ts`）
- [x] 解析非法格式不崩溃（`parser.test.ts` 损坏 JSON 用例）
- [x] §10.3 全部 7 个解析用例（TS + Rust 双覆盖）
- [x] entry-level 合并 6 个分支（`sync.test.ts`）
- [ ] 文件可被 Obsidian 打开且基本可读 — **手工验证**

### 首页（需手工跑）

- [ ] 输入框创建 todo / log / done 三种状态
- [ ] 时间流按日期分组（「今天」/「昨天」/`2026-MM-DD 周X`）
- [ ] 标签实时高亮且可点击
- [ ] 勾选 todo 变 done，时间记录正确
- [ ] 右键删除 / 移动端左滑删除
- [ ] J/K 焦点移动、Space 切换、Enter 进详情、Cmd+Delete 删除

### 同步（需手工跑）

- [ ] WebDAV 配置正确时双向同步成功
- [ ] 两端同时修改同一 entry，按 entry-level 合并不丢数据（自动测试已覆盖逻辑）
- [ ] 真冲突场景产生 `.conflicts/` 备份 + UI 提示
- [ ] 离线状态下应用正常使用，恢复网络后自动同步

### AI / MCP（需手工跑）

- [ ] 「问 AI」流式输出 + 保存为 log
- [ ] Prompt 模板增删改
- [ ] Claude Desktop 配置后能看到所有 tools
- [ ] tools 操作结果反映到 app UI

### 性能（需手工跑，可选）

- [ ] 用脚本灌 10,000 条 entry 测首页打开 < 1s
- [ ] 全文搜索 10,000 entry < 500ms

可以用下面这段一次性灌测试数据：

```ts
// 跑在 packages/core 目录下：
// pnpm -F @gtd/core exec tsx -e "..."
import { MemoryFileSystem, Vault } from './src/index.js';
const fs = new MemoryFileSystem();
const v = new Vault(fs);
const start = Date.now();
for (let i = 0; i < 10000; i++) {
  const d = new Date(2024, 0, 1 + Math.floor(i / 30));
  const date = d.toISOString().slice(0, 10);
  await v.createEntry({ content: `task ${i} #bench`, date });
}
console.log('insert:', Date.now() - start, 'ms');
const t2 = Date.now();
console.log('list 500:', (await v.listEntries({ limit: 500 })).length, Date.now() - t2, 'ms');
```

---

## 8. 常见问题

**Q: 桌面端 `pnpm tauri:dev` 第一次特别慢？**
A: 正常。Tauri 要从源码编译 ~150 个 Rust crate，第一次约 5-10 分钟，之后增量编译几秒。

**Q: 移动端 `pnpm install` 后 `pnpm ios` 报 "Unable to resolve module @gtd/core"？**
A: pnpm 的 hoisting 不兼容 Metro 的 watchman。按 §4.1 添加 `.npmrc` 后重装。

**Q: WebDAV 同步报 401？**
A: 99% 是密码错了。坚果云需要的是「应用密码」不是登录密码。

**Q: MCP server 在 Claude Desktop 看不到？**
A: 检查 `claude_desktop_config.json` 路径是不是绝对路径；macOS 上 Claude 是沙盒环境，二进制路径不能用 `~`。

**Q: 改了 `packages/core` 代码后桌面端不生效？**
A: `pnpm --filter @gtd/core build` 必须重跑（desktop 引用的是 `dist/`，不是 `src/`）。

---

## 9. 联系点

如果遇到问题，把以下信息一起贴出来：

1. 命令 + 完整错误输出
2. `node -v` / `pnpm -v` / `cargo --version` / `rustc --version`
3. 操作系统版本
4. 出错时的截图（如果是 UI 问题）

---

**文档版本**：2026-05-19
**对应代码 commit**：（首次发布，未提交 git）
