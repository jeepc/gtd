# Loop

个人 GTD App — 本地优先、Markdown 存储、AI 友好。

按 [docs/PRD.md](./docs/PRD.md) 与 [docs/database-design.md](./docs/database-design.md) 实现。

## 仓库结构

```
packages/
  core/              共享 TypeScript 核心：数据模型、Markdown 解析、Vault、WebDAV 同步、AI 客户端
apps/
  desktop/           Tauri 2 + React 桌面端 (macOS / Windows / Linux)
  mobile/            React Native 移动端 (iOS / Android / HarmonyOS)
  mcp-server/        Rust MCP server，独立二进制
```

## 起步

```bash
bun install
bun run build             # 构建 core
bun run test             # 跑 core 测试 (Vitest)
bun run dev:desktop      # 启动桌面端
bun run dev:mobile       # 启动移动端 metro
cargo run --manifest-path apps/mcp-server/Cargo.toml  # 启动 MCP server
```

## 下载 / 安装

预编译安装包发布在 [Releases](../../releases)。

- **Android**：下载 APK，在系统中允许「未知来源」安装即可（APK 已签名）。
- **桌面端（macOS / Windows / Linux）**：当前安装包**未签名**，首次运行需手动放行：
  - Windows：SmartScreen 警告 →「更多信息」→「仍要运行」
  - macOS：右键点按 App →「打开」，或 `xattr -cr /Applications/Loop.app`
  - Linux：`chmod +x Loop_*.AppImage` 后运行

签名策略、发布签名配置与完整发布流程见 [docs/RELEASING.md](./docs/RELEASING.md)。
