# GTD

个人 GTD App — 本地优先、Markdown 存储、AI 友好。

按 [PRD.md](./PRD.md) 实现。

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
pnpm install
pnpm -r build              # 构建 core
pnpm test                  # 跑 core 测试
pnpm dev:desktop           # 启动桌面端
pnpm dev:mobile            # 启动移动端 metro
cargo run --manifest-path apps/mcp-server/Cargo.toml  # 启动 MCP server
```
