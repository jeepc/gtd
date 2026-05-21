# 个人 GTD App — 产品需求文档（PRD）v1.1

> 本文档是产品需求说明，描述「做什么」与「为什么这么做」。
> 不涉及开发计划、阶段划分、估时等执行层内容。

---

## 0. 文档元信息

| 项 | 值 |
|---|---|
| 文档版本 | v1.1 |
| 状态 | Final, 可交付开发 |
| 适用对象 | Claude Code（实施方） |
| 产品类型 | 个人单用户工具，本地优先，跨平台 |

### v1.1 相对 v1.0 的主要变化

- 新增 §1.5「核心设计原则」（吸收 Tolaria 实践经验）
- 重构 §5「平台与技术约束」加入数据流分层模型
- 拆分配置为「vault config」与「app settings」两层（§6.5、§6.6）
- 重写 §4.6 MCP 架构为「独立进程 + WebSocket 双桥」
- §4.7 同步增加状态机和触发时机细化
- 新增 §3.3「首次启动流程」
- 新增 §6.7「Metadata 扩展约定」（为后期 database 能力预留）
- 新增 §11「决策记录（ADR）」

---

## 1. 产品定位

### 1.1 一句话定义

一个**单用户、本地优先、AI 友好**的极简 GTD/Todo + 行为日志工具，运行于桌面与移动端，数据以纯文本 Markdown 形式存储，通过 WebDAV 在多端同步。

### 1.2 目标用户

- 重度使用待办/日志记录的个人用户
- 重视数据所有权，不希望被 SaaS 锁定
- 习惯极简界面，反对功能堆砌
- 关注 AI 工具链，希望未来能让 AI 直接访问个人数据

### 1.3 核心价值主张

1. **数据归你所有**：所有数据是本地 Markdown 文件，可被任何编辑器（包括 Obsidian、Logseq）打开
2. **无服务端依赖**：同步走用户自备的 WebDAV，不存在「服务关停」风险
3. **AI native**：数据格式天然适合喂给 LLM；桌面端内置 MCP server，Claude 等 AI 工具可直接读写
4. **极简交互**：无底部菜单、无层级嵌套、无项目/子任务等复杂概念

### 1.4 非目标（明确不做）

- ❌ 多用户、协作、共享
- ❌ 项目管理、子任务、依赖关系
- ❌ 看板视图、甘特图、日历视图
- ❌ 重复任务（首版不做）

> **v1.1 修订**：todo 的「可选截止时间 + 提醒」已纳入首版（见 §4.9 提醒、§6.7.3 `due` 用户字段、ADR-011），原「提醒/通知」非目标取消。重复任务仍不做。
- ❌ 自有云服务、账号系统
- ❌ 浏览器插件、Web 版
- ❌ **数据库式的 schema 配置、视图系统**（首版不做，但数据格式预留扩展空间）

### 1.5 核心设计原则

以下原则适用于全部模块，是评估任何设计/实现选择的标尺。

#### 1.5.1 文件系统是唯一真实来源（Filesystem as Single Source of Truth）

App 不"拥有"数据，只读写文件。任何缓存、内存状态都派生自文件系统，必须可通过删除重建。当三者分歧时，**文件系统永远胜出**。

#### 1.5.2 约定优于配置（Convention over Configuration）

字段名、文件路径、状态语义遵循固定约定。用户无需配置即可使用，AI 也可基于约定无需额外提示即可理解数据结构。

#### 1.5.3 无硬编码例外

字段名、路径、值不应硬编码在应用代码中。能用约定的用约定，需配置的放配置文件。例如「关系字段」通过"值是否包含 `[[wikilink]]`"动态识别，而非维护一个硬编码字段列表。

#### 1.5.4 三表征，一个权威

vault 数据在系统中同时以三种形式存在：

| 表征 | 用途 | 权威性 |
|---|---|---|
| 文件系统（`.md` 文件） | 持久化、跨工具兼容、同步 | **唯一权威** |
| 索引/缓存（内存或本地索引文件） | 加速查询 | 派生，可重建 |
| UI 状态（React / RN state） | 当前会话渲染 | 派生，必须可重建 |

三者绝不应永久分歧；如分歧，以文件系统为准，重建另外两者。

#### 1.5.5 五条不变量

1. **磁盘优先写**：所有改写数据的操作必须先成功写盘，再更新 UI 状态
2. **乐观 UI + 回滚**：响应性场景下 UI 可先于磁盘更新，但磁盘失败必须有明确的回滚路径
3. **无孤儿状态**：UI 状态绝不在磁盘操作未确认时单独更新
4. **通过 reload 恢复**：状态偏离时，提供「重载 vault」入口做全量重建
5. **缓存可丢弃**：删除缓存不丢数据，下次启动自动重建

#### 1.5.6 路径边界（Path Boundary）

所有文件操作（包括 MCP 暴露给外部 AI 的操作）必须在执行前验证：
- 目标路径必须在 vault 根目录内（拒绝 `..` 转义、绝对路径越界）
- 目标路径必须不在被排除目录内（如 `.conflicts/`）

此规则在桌面端 Rust 后端、移动端原生层、MCP server 各自实现，无例外。

---

## 2. 核心概念

### 2.1 Entry（条目）

产品中唯一的数据实体。Todo、已完成事项、行为日志全部统一为 Entry，仅 `status` 不同。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string (ULID) | 唯一标识，时间有序 |
| `content` | string | 正文，含内联标签 |
| `status` | `'todo'` \| `'done'` \| `'log'` | 状态 |
| `tags` | string[] | 从 content 解析出的标签 |
| `date` | string (YYYY-MM-DD) | 所属日期 |
| `metadata` | object | 时间戳 + 扩展字段（详见 §6.7） |

**状态语义**：

- `todo`：未完成的待办
- `done`：完成的待办（保留原文，加上完成时间）
- `log`：直接记录的「刚刚做了什么」，没经过 todo 阶段

**状态流转**：

```
       创建为 todo                 勾选完成
   [无] ─────────────► todo ────────────────► done

       创建为 log
   [无] ─────────────► log
```

`done` 与 `log` 在首页时间流中视觉相同（都是「已发生的事」），仅在元数据上有区别。

### 2.2 Tag（标签）

- 内联在 content 中，形如 `#工作`、`#健康`
- 不预先定义，写到哪个就出现哪个
- 可作为筛选维度
- 必须以空格或行首开头（避免误把 `#1` 当作标签）

### 2.3 Vault（数据库）

整个 app 的「数据库」就是一个文件夹，称为 vault，结构详见 §6.1。

---

## 3. 信息架构

### 3.1 页面层级

只有 1 个首页 + 若干二级页，**没有底部菜单**。

```
┌─────────────────────────────────────────────────┐
│ 首页（时间流）                                    │
│  ├─ 顶部输入框（创建 entry）                       │
│  ├─ 时间流（entries 按时间倒序）                    │
│  └─ 右上角「⋯」入口                                │
└─────────────────────────────────────────────────┘
       │
       ├── 点条目 ─────► 二级页：条目详情
       │
       ├── 点 #标签 ────► 二级页：标签视图
       │
       ├── 顶部下拉 ────► 二级页：搜索
       │
       └── 右上角「⋯」──► 二级页：设置
                            ├─ 二级页：同步配置
                            ├─ 二级页：AI 配置
                            ├─ 二级页：Prompt 模板管理
                            ├─ 二级页：冲突列表（仅有冲突时显示）
                            └─ 二级页：关于
```

### 3.2 导航规则

- 所有二级页通过 push 进入，左上角返回（或手势返回）
- 二级页之间不可横向跳转，必须返回首页或上一级
- 设置内部允许多层 push（设置 → 同步配置）

### 3.3 首次启动流程

App 启动时检查是否已有 vault 配置：

```
启动 → 读取 app settings 中的 vault path
  ├─ path 存在且可访问 → 直接进入首页
  └─ path 不存在或无配置 → WelcomeScreen
         │
         ├─ 选项 A：创建新 vault
         │     用户选择父目录 → 创建空 vault → 进入首页
         │
         ├─ 选项 B：打开已有 vault
         │     用户选择已有 vault 目录（来自其他 markdown 工具）→ 进入首页
         │
         └─ 选项 C：从 WebDAV 拉取
               用户配置 WebDAV → 选本地保存目录 → 同步下载 → 进入首页
```

WelcomeScreen 不出现底部菜单，每个选项是一个全屏卡片，下拉滑动切换。

---

## 4. 功能需求

### 4.1 首页（时间流）

#### 4.1.1 顶部输入框

- 始终可见、聚焦快捷键可直接呼起（桌面：`Cmd/Ctrl+N`；移动端：下拉首页）
- 输入文本后回车创建 entry
- 默认 status：
  - 纯文本 → `todo`
  - 以 `/log ` 开头 → `log`（去除前缀作为 content）
  - 以 `/done ` 开头 → `done`（去除前缀，立即完成）
- 输入中实时高亮 `#标签`
- 多行输入用 `Shift+Enter`（桌面），移动端右侧扩展按钮

#### 4.1.2 时间流

- entries 按 `date` 倒序，同日内按 `metadata.updated` 倒序
- 跨日分组，日期作为分隔符（如「今天」「昨天」「2026-05-16 周六」）
- 单条 entry 展示：状态图标 + content（标签高亮）+ 相对时间
- 默认加载最近 14 天，向下滚动加载更多
- 空状态：提示创建第一条 entry

#### 4.1.3 条目交互

| 操作 | 桌面 | 移动 |
|---|---|---|
| 切换 todo/done | 点击 checkbox | 点击 checkbox |
| 进入详情 | 点击 content 区域 | 点击 content 区域 |
| 删除 | 右键菜单 | 左滑 |
| 复制 | 右键菜单 | 长按 |

### 4.2 二级页：条目详情

- 展示 entry 完整信息
- 可编辑 content（即可改 tag）
- 显示创建时间、完成时间、log 时间（按状态）
- 显示元数据（折叠，默认隐藏）；带 `_` 前缀的系统字段（§6.7）默认不显示
- 删除按钮（带二次确认）
- 标签可点击 → 跳到标签视图

### 4.3 二级页：标签视图

- 顶部展示标签名 + 该标签下 entry 总数
- 列表样式同首页时间流，仅过滤为该标签
- 顶部 toggle：「全部 / 仅未完成 / 仅已完成」

### 4.4 二级页：搜索

- 顶部搜索框，实时搜索（300ms 防抖）
- 搜索范围：content 全文 + 标签精确匹配
- 结果按相关度 + 时间排序
- 支持搜索语法：
  - `#tag` 仅按标签
  - `status:todo` / `status:done` / `status:log`
  - `date:2026-05` / `date:>=2026-05-01`
  - 多条件空格分隔，AND 关系

### 4.5 二级页：设置

#### 4.5.1 同步配置

- WebDAV 三项：URL、用户名、密码
- 密码不显示明文，存系统密钥库
- 「测试连接」按钮
- 「立即同步」按钮
- 显示上次同步时间、最近一次同步结果
- 自动同步开关（默认开）
- 自动同步触发器（详见 §4.7）
- 冲突列表入口（如有冲突文件）

#### 4.5.2 AI 配置

- Provider 选择：Anthropic / OpenAI / Ollama / 自定义 endpoint
- API Key 输入（存密钥库）
- Model 选择（按 provider 动态加载或预设列表）
- 「测试」按钮：发一条 "hello" 验证
- AI 功能总开关（默认关，需主动开启）
- 隐私提示：「开启后，问 AI 操作会将相关 entries 发送给所选 provider」

#### 4.5.3 Prompt 模板管理

- 列表展示所有模板（预置 + 自定义）
- 每条：名称、prompt 正文、变量占位符
- 预置模板（不可删除，可修改副本）：
  - 「总结这周做了什么」
  - 「给未完成 todo 按优先级排序」
  - 「分析时间分配模式」
- 自定义模板可增删改

#### 4.5.4 关于

- 版本号
- 数据目录路径（可点击打开）
- 导出全部数据（zip 打包）
- 链接：开源仓库、文档

### 4.6 AI 功能

#### 4.6.1 「问 AI」按钮

- 出现在首页、标签视图、搜索结果页右上角
- 点击弹出 Prompt 模板选择
- 选择后将当前可见的 entries 作为上下文，组合模板发送
- 流式展示 AI 回答
- AI 回答可保存为 entry（status=log，加 `#ai_summary` 标签）

#### 4.6.2 MCP Server（仅桌面端）

桌面端附带一个独立的 MCP server 进程，让外部 AI 工具（Claude Desktop、Cursor 等）直接访问 vault。

**架构**：

```
┌──────────────────────────────────────────────────────┐
│  桌面 App (Tauri)                                    │
│    ├─ UI (React)                                     │
│    └─ Rust 后端                                       │
│         └─ 启动时 spawn MCP server 子进程              │
└──────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│  MCP Server (独立 Node.js 进程)                       │
│    ├─ stdio 传输：对接 Claude Desktop / Cursor        │
│    ├─ WebSocket :9710 (Tool Bridge)                  │
│    │     外部 AI 客户端 → 调用 vault tools             │
│    └─ WebSocket :9711 (UI Bridge)                    │
│          MCP → 通知 App UI 跳转、高亮等                │
└──────────────────────────────────────────────────────┘
                         │
                         ▼
                    Vault 文件系统
```

**关键设计**：

- MCP server 是独立进程，**App 关闭时仍可运行**，保证外部 AI 工具随时可访问
- App 启动时自动启动 MCP server（如未运行）；App 关闭不杀死 MCP server
- MCP server 通过 WebSocket 9711 主动通知 App UI 跳转，让"AI 问完后 App 跳到对应视图"成为可能
- App 启动时自动向 Claude Desktop 配置文件 (`~/.claude/mcp.json`) 注册自己（非破坏性 upsert）

**暴露的 Tools**：

| 类别 | Tool | 输入 | 输出 |
|---|---|---|---|
| 读 | `list_entries` | `date?, tag?, status?` | `Entry[]` |
| 读 | `get_entry` | `id` | `Entry` |
| 读 | `search_entries` | `query, limit?` | `Entry[]` |
| 读 | `get_recent_logs` | `days?` | `Entry[]` |
| 读 | `vault_context` | — | `{tags, recentEntries, stats}` |
| 写 | `create_entry` | `content, status?` | `Entry` |
| 写 | `complete_entry` | `id` | `Entry` |
| 写 | `update_entry` | `id, content?, metadata?` | `Entry` |
| 写 | `delete_entry` | `id` | `void` |
| 写 | `set_entry_property` | `id, key, value` | `Entry` |
| UI | `ui_open_entry` | `id` | `void` |
| UI | `ui_open_today` | — | `void` |
| UI | `ui_open_tag` | `tag` | `void` |

UI 类 tools 通过 WebSocket 9711 推送给 App 前端；当 App 未运行时 UI tools 直接返回成功但不产生效果。

**MCP server 的写操作必须**：
- 经过 §1.5.6 的路径边界检查
- 触发 vault 重新同步（异步，不阻塞 tool 返回）
- 触发 App UI 重新加载（如 App 正在运行）

### 4.7 同步功能

#### 4.7.1 同步状态机

| State | 显示 | 颜色 | 触发条件 |
|---|---|---|---|
| `idle` | Synced / Synced Xm ago | 绿 | 同步成功 |
| `syncing` | Syncing… | 蓝 | pull/push 进行中 |
| `pull_required` | Pull required | 橙 | push 被拒（divergence） |
| `conflict` | Conflict | 橙 | 检测到真冲突 |
| `error` | Sync failed | 灰 | 网络/认证错误 |
| `disabled` | Sync off | 灰 | 用户关闭同步 |

状态显示位置：
- 桌面：底部状态栏
- 移动端：首页顶部右侧小图标

#### 4.7.2 同步触发时机

| 触发器 | 时机 | 备注 |
|---|---|---|
| 启动 | App 启动后 3 秒 | 不阻塞 UI |
| 编辑防抖 | 创建/修改/删除 entry 后 30s | 多次编辑只触发一次 |
| 应用失焦 | 桌面/移动端切到后台时立即 | 提高跨端及时性 |
| 应用获焦 | 桌面/移动端切回前台时立即 | 拉取远端变化 |
| 周期 | 每 N 分钟（默认 5，可配置） | 兜底 |
| 手动 | 用户点「立即同步」 | 任何时候可用 |

#### 4.7.3 同步流程

详见 §6.4。

#### 4.7.4 离线行为

- 离线时 App 完全可用，所有写操作正常落盘
- 同步状态显示 `error`，但不阻塞使用
- 网络恢复后自动重试同步

### 4.8 跨平台一致性

| 能力 | 桌面 | iOS/Android/鸿蒙 |
|---|---|---|
| Vault CRUD | ✅ | ✅ |
| WebDAV 同步 | ✅ | ✅ |
| AI 调用 | ✅ | ✅ |
| 搜索 | ✅ | ✅ |
| 全局快捷键呼出 | ✅ | ❌ |
| 系统托盘 | ✅ | ❌ |
| MCP server | ✅ | ❌ |
| 多窗口 | ✅ | ❌ |

移动端不实现的能力，UI 上不出现对应入口，无需"功能不可用"提示。

### 4.9 提醒（Reminders）

todo 可选设置一个截止时间 `due`；设置后，到点时本机发出系统通知。

#### 4.9.1 数据模型

- `due` 是一个普通的 metadata 用户字段（§6.7.3），随文件同步、可被 Obsidian 读取
- 取值为 ISO 日期或日期时间：
  - 仅日期（`2026-05-25`）→ 默认当天早上 09:00 提醒
  - 含时间（`2026-05-25T09:00`）→ 在该时刻提醒
- 首版**提醒时刻 == due 时刻**，不支持提前量/多次提醒

#### 4.9.2 设置方式

- 条目详情页的「截止时间」控件（桌面 datetime 选择器 / 移动端文本输入）
- 输入框内联语法：`#due:0525`（MMDD，当年）、`#due:2026-05-25`、`#due:2026-05-25T09:00`；`#!`/`#!!`/`#!!!` 设优先级（§6.7.3 / 数据库设计 Level 2）
- 外部 AI 通过 MCP `set_entry_property`（§4.6.2）写入 `due`

#### 4.9.3 调度模型（意图在 vault，句柄在本机）

体现 §1.5.1：提醒**意图**（`due`）是唯一同步事实；操作系统通知**句柄**是本机派生状态，**不写入 vault**。每台设备从 `due` + `status` 独立推导自己的待发提醒：

- 选取条件：`status=todo`、未删除、`due` 在未来
- 完成 / 删除 / 改期 / 清除 `due` 均由「重算」自动取消或重排，无散落的命令式取消逻辑
- 过期未发的提醒首版不补发
- 触发时机：加载后、任意写操作后、同步后（远端可能改了 `due`）各重算一次

#### 4.9.4 平台能力

| 平台 | 机制 | App 关闭后 |
|---|---|---|
| iOS / Android | OS 本地通知（notifee TIMESTAMP 触发） | ✅ 仍触发 |
| 桌面 | 进程内定时器 → 系统通知 | ❌ 仅运行时（含托盘）触发 |
| 鸿蒙 | 进程内定时器（降级） | ❌ 仅运行时触发 |

桌面/鸿蒙的「仅运行时」局限在 UI 中说明；durable OS 级调度作为后续项（见 ADR-011）。

---

## 5. 平台与技术约束

### 5.1 支持平台

| 平台 | 技术栈 |
|---|---|
| Windows / macOS / Linux | Tauri 2 + React + TypeScript |
| iOS / Android / HarmonyOS | React Native + react-native-harmony |

### 5.2 代码组织（monorepo）

```
/<repo>
  /packages
    /core            # 纯 TypeScript：数据模型、Markdown 解析、同步逻辑、AI 调用
    /desktop         # Tauri + React
    /mobile          # React Native（含 iOS/Android/HarmonyOS 三个原生工程）
    /mcp-server      # 独立 Node.js MCP server
  /docs
```

`core` 包是数据契约的实施载体，三端通过 `FileSystem` 接口注入各自的平台实现，共享其余所有逻辑。

### 5.3 数据流分层

体现 §1.5.4「三表征」原则：

```
┌─────────────────────────────────┐
│  React / RN State (内存)         │  ← 派生
└──────────────▲──────────────────┘
               │ on load
┌──────────────┴──────────────────┐
│  索引层 (内存 Map / 可选磁盘缓存)   │  ← 派生，可重建
└──────────────▲──────────────────┘
               │ scan / incremental
┌──────────────┴──────────────────┐
│  文件系统 (vault/*.md)           │  ← 唯一权威
└─────────────────────────────────┘
```

**写操作流向**（严格自下而上）：
```
用户操作 → 计算变更 → 写文件系统 → 更新索引 → 更新 UI 状态
                         ↑ 失败则中止后续
```

**读操作流向**：
```
启动：扫描文件系统 → 建索引 → 注入 UI
运行时：从索引读 → 渲染 UI
偏离/异常：reload vault 入口 → 清索引 → 重扫文件系统
```

### 5.4 平台特定 API 抽象

`core` 定义 `FileSystem` 接口，各端实现：

- 桌面：Tauri fs plugin
- iOS/Android：`react-native-fs`
- 鸿蒙：`@ohos.file.fs`

密钥存储：

- macOS：Keychain
- Windows：Credential Manager
- Linux：libsecret
- iOS：Keychain
- Android：Keystore
- 鸿蒙：HUKS

### 5.5 不做的技术选择

- ❌ SQLite 或任何二进制数据库（含 IndexedDB）
- ❌ 自有云服务、自有账号系统
- ❌ 服务端代码
- ❌ Electron（用 Tauri）
- ❌ Expo（裸 RN，因为鸿蒙）
- ❌ 富文本编辑器（content 是单行短文本）

---

## 6. 数据规范

### 6.1 文件组织

```
<vault-root>/
  config.json                              # vault 内配置（跟随同步，详见 §6.5）
  2026/
    05/
      2026-05-18.md
      2026-05-17.md
    04/
      ...
  .conflicts/                              # 同步冲突备份（不同步到远端）
    2026-05-18.md.conflict-20260518T1023Z
```

- 每天一个 `.md` 文件，路径 `YYYY/MM/YYYY-MM-DD.md`
- vault 内配置位于根目录 `config.json`
- 冲突备份位于 `.conflicts/`，**不参与同步**（同步逻辑明确忽略此目录）

**为什么按月分目录**：部分 WebDAV 服务对单目录文件数有性能限制，月级分目录将单目录文件数控制在 31 以内。

**App 本地配置不放在 vault 内**（详见 §6.6）。

### 6.2 单文件格式

```markdown
---
date: 2026-05-18
version: 1
updatedAt: 2026-05-18T22:15:33Z
---

- [ ] 买牛奶 #生活 ^01HXYZABCD1234567890ABCDEF
- [x] 跑步 5km #健康 ^01HXYW1234567890ABCDEFGHIJ <!-- {"done":"2026-05-18T08:30:00Z","updated":"2026-05-18T08:30:00Z"} -->
- 看完《思考快与慢》第三章 #读书 ^01HXYV1234567890ABCDEFGHIJ <!-- {"log":"2026-05-18T22:10:00Z","updated":"2026-05-18T22:10:00Z"} -->
```

#### Frontmatter（必须）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `date` | YYYY-MM-DD | 是 | 文件所属日期，与文件名一致 |
| `version` | int | 是 | 数据格式版本，当前 1 |
| `updatedAt` | ISO 8601 | 是 | 文件最后修改时间，同步用 |

#### Entry 行格式

每行一个 entry，BNF：

```
entry      ::= prefix WS content (WS tag)* WS id (WS metadata)?
prefix     ::= "- [ ]" | "- [x]" | "-"
content    ::= <任意文本，含 #tags 和空格>
tag        ::= "#" tag_name
tag_name   ::= [^\s#]+
id         ::= "^" ULID
ULID       ::= [0-9A-HJKMNP-TV-Z]{26}
metadata   ::= "<!-- " JSON " -->"
WS         ::= " "+
```

#### 状态推断

| Prefix | Status |
|---|---|
| `- [ ]` | `todo` |
| `- [x]` | `done` |
| `- `（无 checkbox） | `log` |

#### 边缘情况

| 情况 | 处理 |
|---|---|
| content 内含 `#` 但不是 tag（如 `#1 priority`） | tag 必须前接空格或行首 |
| content 多行 | 用 `\n` 字面量（不换行成多行 markdown）|
| content 内含 `^` | tag 后的 `^ULID` 才识别为 ID |
| 无 ID 的旧数据 | 解析时自动补 ID，写回时落盘 |
| metadata JSON 损坏 | 当作无 metadata，content 不丢，补默认 `updated` |
| 文件无 frontmatter | 容错读取，写回时补全 |

### 6.3 ID 规范

- 使用 ULID（Crockford Base32 编码的时间有序 ID）
- 26 字符，前 10 字符为时间戳，后 16 字符为随机
- 字符集：`0-9, A-H, J-K, M, N, P-T, V-Z`（排除易混 I/L/O/U）
- 示例：`01HXYZABCD1234567890ABCDEF`
- 不同设备同时生成的 ID 几乎不可能冲突（128 bit 随机部分）

### 6.4 同步规则

#### 6.4.1 同步流程

```
1. 列出本地所有 .md 文件 + 根 config.json
   忽略 .conflicts/ 目录
2. 列出远端所有同类文件
3. 对比每个文件路径：
   - 仅本地有 → push
   - 仅远端有 → pull
   - 双方都有：
     a. 比较 frontmatter.updatedAt（或 config 的 mtime）
     b. 若相同 → 跳过
     c. 若不同 → 执行 entry-level 合并（见 6.4.2）
4. 更新本地 / 远端
5. 写同步日志到内存（供 UI 显示）
```

#### 6.4.2 Entry-Level 合并

```
解析双方为 Entry[]
对所有 id ∈ local.ids ∪ remote.ids:
  case 仅本地       → 保留本地
  case 仅远端       → 保留远端
  case 内容相同     → 保留任一
  case updated 不同 → 保留 updated 较新者
  case updated 相同但内容不同（真冲突，极少）：
    保留本地
    将远端版本备份到 .conflicts/<原文件名>.conflict-<时间戳>
    标记 entry.metadata._conflict = true（UI 显示警告，参 §6.7）
```

#### 6.4.3 删除处理（Tombstone）

物理删除会导致同步歧义（A 端删除 vs B 端尚未拉到），处理策略：

- 删除时不立即从文件移除，先打 tombstone：在该 entry 行末尾追加 `<!-- {"deleted":"<ISO>","updated":"<ISO>"} -->`
- UI 渲染时跳过含 `deleted` 字段的 entry
- 同步合并时，比较双方的 `deleted` 和 `updated`，newer 的版本胜出
- 30 天后清理 tombstone（物理删除行）

#### 6.4.4 冲突 UI

- 同步结果含 conflict 时，首页顶部出现一条橙色提示条
- 点击进入「冲突列表」二级页，逐条解决（接受本地 / 接受远端 / 都保留）
- 解决后清除标记，删除对应 `.conflicts/` 文件

### 6.5 Vault Config（跟随同步）

`<vault-root>/config.json`，存储**跨设备一致的偏好**——任何用户期望"换台机器打开同一个 vault 体验一致"的内容。

```json
{
  "version": 1,
  "ui": {
    "theme": "auto",
    "language": "zh-CN"
  },
  "ai": {
    "promptTemplates": [
      {
        "id": "summary-week",
        "name": "总结这周",
        "prompt": "请总结我这周的活动和待办..."
      }
    ]
  },
  "tagColors": {
    "工作": "#3b82f6",
    "生活": "#10b981"
  }
}
```

**判断准则**：用户是否期望这条配置跨设备一致？是 → 放 vault config。

### 6.6 App Settings（仅本机）

桌面：`~/.config/<app>/settings.json`
移动：平台特定 app sandbox 内

存储**机器相关、凭据引用、运行时偏好**——任何不应跨设备同步的内容。

```json
{
  "version": 1,
  "vaultPath": "/Users/me/Documents/todo-vault",
  "sync": {
    "webdav": {
      "url": "https://dav.jianguoyun.com/dav/todo-app/",
      "username": "user@example.com",
      "passwordRef": "keychain://todo-app/webdav"
    },
    "autoSync": true,
    "intervalMinutes": 5,
    "syncOnFocus": true,
    "syncOnBlur": true
  },
  "ai": {
    "enabled": false,
    "provider": "anthropic",
    "model": "claude-opus-4-7",
    "apiKeyRef": "keychain://todo-app/anthropic-key",
    "endpoint": null
  },
  "window": {
    "width": 1024,
    "height": 768
  }
}
```

**判断准则**：

| 类型 | 位置 |
|---|---|
| Vault 路径、WebDAV URL/用户名/密码引用 | App settings |
| API key 引用、AI provider 选择 | App settings |
| 窗口尺寸、自动同步间隔、上次同步时间 | App settings |
| Prompt 模板正文、UI 主题、标签颜色 | Vault config |

**密钥引用**：所有敏感字段用 `keychain://<service>/<key>` 引用，实际值存系统密钥库；密钥库内容不进入任何配置文件或日志。

### 6.7 Metadata 扩展约定

Entry 的 metadata JSON 是**开放的 key-value**，为后期功能预留扩展空间。

#### 6.7.1 基础字段（解析器必须识别）

| 字段 | 类型 | 说明 |
|---|---|---|
| `done` | ISO 8601 | 仅 done 状态必填 |
| `log` | ISO 8601 | 仅 log 状态必填 |
| `updated` | ISO 8601 | 所有 entry 必填，冲突解决用 |
| `deleted` | ISO 8601 | tombstone（§6.4.3） |

#### 6.7.2 系统字段约定（下划线前缀）

任何**以 `_` 开头的字段**是系统字段：

- UI 默认**不显示**（仅"显示元数据"折叠区可见）
- 不可在「问 AI」的上下文中默认携带（除非用户显式要求）
- 用于 App 内部状态、AI 自动生成的元数据

示例：

```json
{
  "updated": "2026-05-18T08:30:00Z",
  "_conflict": true,
  "_ai_category": "工作",
  "_ai_priority_suggestion": 3
}
```

#### 6.7.3 用户字段（无前缀）

未来用户/AI 可自由添加任何 key-value：

```json
{
  "updated": "...",
  "project": "q3-review",
  "priority": 2,
  "due": "2026-05-25"
}
```

**MVP 不做**用户字段的编辑 UI；但解析器、MCP `set_entry_property` tool、AI 必须能读写这些字段。这是为后期 database 能力埋的基础。

#### 6.7.4 校验规则

- key：`[a-zA-Z_][a-zA-Z0-9_]*`，最长 40 字符
- value：JSON 标量（string、number、boolean、null）；不支持嵌套对象和数组
- 单条 entry 的 metadata JSON 必须单行，且小于 1KB
- 解析器遇到非法 metadata：保留原文本，记录解析错误，UI 显示警告但不阻塞

---

## 7. 交互细节

### 7.1 设计原则

1. **首页能完成 80% 操作**：创建、查看、勾选、删除
2. **二级页是补充信息**：不放主要操作入口
3. **键盘优先（桌面）**：核心操作有快捷键
4. **手势优先（移动）**：列表项左滑、下拉刷新、长按

### 7.2 桌面快捷键

| 快捷键 | 功能 |
|---|---|
| `Cmd/Ctrl + N` | 聚焦输入框（全局，App 在后台也响应） |
| `Cmd/Ctrl + F` | 进入搜索页 |
| `Cmd/Ctrl + ,` | 进入设置 |
| `Cmd/Ctrl + S` | 立即同步 |
| `Cmd/Ctrl + R` | 重载 vault（应用层 §1.5.5 恢复路径） |
| `Esc` | 二级页返回 |
| `J / K` | 列表上下移动焦点 |
| `Space` | 勾选/取消当前条目 |
| `Enter` | 进入当前条目详情 |
| `Cmd/Ctrl + Delete` | 删除当前条目 |

### 7.3 移动端手势

| 手势 | 功能 |
|---|---|
| 下拉首页 | 呼出输入框 + 同步 |
| 列表项左滑 | 显示删除按钮 |
| 列表项长按 | 复制内容 |
| 左侧边缘右滑 | 二级页返回 |

### 7.4 视觉规范

- 极简：默认无色彩（仅黑白灰），标签略带强调色（取自 vault config `tagColors` 或自动生成）
- 字体：系统默认（San Francisco / Segoe UI / Noto Sans CJK）
- 主题：跟随系统（亮 / 暗）
- 无图标库依赖，必要图标用 SVG 内联

### 7.5 空状态与错误

- 空 vault：引导文案「写下你的第一件事」
- 同步失败：顶部黄色提示条，可点击查看详情，不阻塞使用
- AI 调用失败：弹窗提示，可重试
- 文件解析失败：保留原始文件不动，提示用户

---

## 8. 安全与隐私

### 8.1 数据安全

- 所有数据本地存储，未配置同步时不上传任何信息
- 同步内容仅在用户配置的 WebDAV 服务器
- 不收集遥测、不上报崩溃日志（首版）

### 8.2 密钥管理

- WebDAV 密码、AI API Key 一律存系统密钥库
- 不出现在 config.json、settings.json 或日志中
- 应用卸载时由系统密钥库决定是否保留

### 8.3 AI 隐私

- AI 功能默认关闭，需用户主动开启
- 开启时弹窗提示：「问 AI 操作会将相关 entries 发送给所选 provider」
- 推荐使用本地 Ollama 选项
- 默认不携带 `_` 前缀系统字段到 AI 上下文

### 8.4 MCP Server 隐私

- MCP server 仅在桌面端启动
- 通过 §1.5.6 路径边界检查，外部 AI 无法越界访问 vault 外文件
- App 设置可一键禁用 MCP server

### 8.5 数据迁移与导出

- 「设置 → 关于 → 导出」：打包整个 vault 为 zip
- 用户可随时直接访问 vault 目录，用任何工具操作
- 不存在「锁定」机制

---

## 9. 验收标准

### 9.1 功能验收

**首次启动**：
- [ ] 无 vault 配置时显示 WelcomeScreen 三选项
- [ ] 创建新 vault 选项创建空 vault 并进入首页
- [ ] 打开已有 vault 选项可选目录并正确读取
- [ ] 从 WebDAV 拉取选项完成首次全量下载

**首页**：
- [ ] 输入框创建 todo / log / done 三种状态
- [ ] 时间流正确按日期分组、按时间倒序
- [ ] 标签实时高亮且可点击
- [ ] 勾选 todo 变 done，时间记录正确
- [ ] 长按/右键操作菜单完整
- [ ] 滚动加载更早条目流畅

**二级页**：
- [ ] 详情页编辑 content 后正确解析标签
- [ ] 详情页元数据区显示基础字段，隐藏 `_` 前缀字段
- [ ] 标签视图按选择的标签过滤正确
- [ ] 搜索支持文本 + 语法（status / date / tag）
- [ ] 设置项修改后立即生效

**数据**：
- [ ] 创建/修改/删除 entry 后文件内容符合 §6.2 规范
- [ ] 文件可被 Obsidian 打开且基本可读
- [ ] 解析非法格式不崩溃，原文件保留
- [ ] tombstone 机制工作：删除后 30 天才物理移除
- [ ] metadata 中的用户字段（如 `priority`）可被读取并通过 MCP 修改

**配置分层**：
- [ ] vault config 跟随同步，更换设备打开同 vault 看到一致的 prompt 模板
- [ ] app settings 不同步：A 设备的 WebDAV 凭据不会跑到 B 设备
- [ ] 密钥不出现在任何配置文件中

**同步**：
- [ ] WebDAV 配置正确时双向同步成功
- [ ] 状态机六种状态正确显示
- [ ] 六种触发器都能正常触发同步
- [ ] 两端同时修改同一文件，按 entry-level 合并不丢数据
- [ ] 真冲突场景产生 `.conflicts/` 备份并 UI 提示
- [ ] `.conflicts/` 目录本身不被同步
- [ ] 离线状态下应用正常使用，恢复网络后自动同步

**AI**：
- [ ] 「问 AI」能将当前视图作为上下文调用 LLM
- [ ] Prompt 模板增删改正常
- [ ] AI 回答可保存为 entry
- [ ] AI 上下文默认不含 `_` 前缀字段

**MCP（桌面）**：
- [ ] Claude Desktop 配置后能看到所有 tools
- [ ] tools 可正确读写 vault，操作结果反映到 App UI
- [ ] App 关闭后 MCP server 仍能服务
- [ ] UI 类 tools 在 App 运行时正确触发界面跳转
- [ ] 越界路径请求被拒绝（路径边界检查）

**跨平台**：
- [ ] 同一 vault 在桌面端与移动端能互相同步
- [ ] iOS / Android / 鸿蒙三端 UI 行为一致
- [ ] 中文输入法在所有平台无异常
- [ ] 移动端无 MCP / 全局快捷键入口（不出现"不支持"提示）

### 9.2 不变量验收（§1.5.5）

- [ ] 任何写操作磁盘失败时 UI 状态不被错误更新
- [ ] 乐观更新失败时 UI 正确回滚
- [ ] Cmd+R 重载 vault 能从异常状态恢复
- [ ] 删除索引/缓存后下次启动自动重建，无数据丢失

### 9.3 性能验收

- [ ] vault 含 10,000+ entry 时首页打开 < 1s
- [ ] 输入框创建 entry 到落盘 < 100ms
- [ ] 全文搜索 10,000 entry < 500ms
- [ ] 同步 100 个文件 < 10s（不计网络）

### 9.4 体验验收

- [ ] 桌面端启动到可输入 < 2s
- [ ] 移动端冷启动 < 3s
- [ ] 无底部 tab bar，所有非首页均为二级 push
- [ ] 任何操作失败都有明确反馈
- [ ] 离线场景下无任何阻塞 UI 的网络请求

---

## 10. 附录

### 10.1 术语表

| 术语 | 说明 |
|---|---|
| Vault | 数据根目录，整个 app 的「数据库」 |
| Entry | 数据原子，三种状态：todo / done / log |
| Tag | 内联在 content 中的 `#xxx` 标签 |
| ULID | 时间有序的 26 字符 ID |
| WebDAV | 用户自备的同步服务（如坚果云、NextCloud） |
| MCP | Model Context Protocol，AI 工具的标准协议 |
| Tombstone | 软删除标记，避免同步歧义 |
| Vault Config | 跟随同步的偏好（vault 内 config.json） |
| App Settings | 仅本机的偏好和凭据引用 |
| 系统字段 | 以 `_` 开头的 metadata 字段，UI 默认隐藏 |

### 10.2 参考样例数据

**vault-root/2026/05/2026-05-18.md**

```markdown
---
date: 2026-05-18
version: 1
updatedAt: 2026-05-18T23:45:12Z
---

- [ ] 准备周三的产品评审材料 #工作 ^01HXYZABCD1234567890ABCDE1 <!-- {"updated":"2026-05-18T09:00:00Z"} -->
- [ ] 给妈妈打电话 #家庭 ^01HXYZABCD1234567890ABCDE2 <!-- {"updated":"2026-05-18T09:01:00Z"} -->
- [x] 跑步 5km #健康 ^01HXYZABCD1234567890ABCDE3 <!-- {"done":"2026-05-18T08:30:00Z","updated":"2026-05-18T08:30:00Z"} -->
- 看完《思考快与慢》第 3 章 #读书 ^01HXYZABCD1234567890ABCDE4 <!-- {"log":"2026-05-18T22:10:00Z","updated":"2026-05-18T22:10:00Z"} -->
- 和团队讨论了 Q3 规划，关键决策：聚焦增长 #工作 ^01HXYZABCD1234567890ABCDE5 <!-- {"log":"2026-05-18T15:30:00Z","updated":"2026-05-18T15:30:00Z"} -->
```

### 10.3 解析测试用例（最小集）

PRD 不规定实现，但必须满足以下解析行为：

| 输入 | 期望解析结果 |
|---|---|
| `- [ ] 买牛奶 #生活 ^01H...` | `{status:'todo', content:'买牛奶', tags:['生活'], id:'01H...'}` |
| `- [x] 跑步 ^01H... <!-- {"done":"..."} -->` | `{status:'done', metadata:{done:'...'}}` |
| `- 看书 #读书 ^01H...` | `{status:'log'}` |
| `- [ ] task #a #b #c ^01H...` | `{tags:['a','b','c']}` |
| `- [ ] #1 priority #work ^01H...` | `{tags:['work'], content:'#1 priority'}`（`#1` 前无空格不算 tag） |
| `- [ ] 内容 ^01H... <!-- 损坏的 json -->` | `{content:'内容', metadata:{updated: <补默认>}}` |
| `- [ ] x ^01H... <!-- {"updated":"...","_conflict":true} -->` | `metadata._conflict` 被识别为系统字段 |
| `- [ ] x ^01H... <!-- {"updated":"...","priority":2} -->` | `metadata.priority=2` 被识别为用户字段 |
| 无 frontmatter 的文件 | 容错读取，date 从文件名推断 |

### 10.4 开发参考资料

- ULID 规范：https://github.com/ulid/spec
- WebDAV 协议：RFC 4918
- MCP 协议：https://modelcontextprotocol.io
- Tauri 2 文档：https://tauri.app
- react-native-harmony：https://gitee.com/openharmony-sig/ohos_react_native

---

## 11. 决策记录（ADR）

每条 ADR 记录一个关键技术/产品决策，及其考虑过的替代方案。Claude Code 实施时如遇与下列决策冲突的设计选择，必须明确升级请求而非自行偏离。

### ADR-001：桌面端用 Tauri 2，不用 Electron

- **决策**：桌面端使用 Tauri 2
- **理由**：体积小、启动快、Rust 后端处理 IO 性能好；前端仍可用 React，迁移成本低
- **替代**：Electron（包体大、内存高）

### ADR-002：移动端用 React Native，不用 Flutter / 原生

- **决策**：移动端使用 React Native，含 `react-native-harmony` 适配鸿蒙
- **理由**：唯一能一套代码覆盖 iOS + Android + 鸿蒙的成熟方案；可与桌面端共享 `core` 包逻辑
- **替代**：
  - Flutter——鸿蒙支持不成熟，与桌面端无法共享逻辑
  - 三套原生——开发成本高，对 AI 编码场景无优势

### ADR-003：桌面与移动用两套 UI 代码，共享 `core`

- **决策**：UI 代码不强制复用，仅复用 `core` 包的业务逻辑
- **理由**：纯文本数据架构下，UI 复用价值不如数据契约复用；强行用 RN 写桌面端会牺牲桌面体验
- **替代**：纯 RN 全平台——桌面 RN 体验不如 Tauri + React

### ADR-004：同步走 WebDAV，不走 Git

- **决策**：同步唯一方案是 WebDAV
- **理由**：用户自备的成熟服务（坚果云、NextCloud）覆盖最广；交互成本低于 Git
- **替代**：
  - Git——冲突合并不适合小白；需要 git 工具链
  - 自有云——违背"无服务端依赖"原则

### ADR-005：数据用 Markdown 而非 SQLite

- **决策**：纯文本 Markdown + 文件系统
- **理由**：满足 §1.5.1 文件系统权威原则；天然兼容 Obsidian/Logseq；AI 直接可读
- **替代**：SQLite——AI 接入门槛高、不兼容外部工具、备份和迁移复杂

### ADR-006：ID 用 ULID，不用 UUID v4 / 自增

- **决策**：ULID（时间有序的 26 字符 ID）
- **理由**：时间有序便于排序；可读性优于 UUID；与 UUID v7 等价但表示更紧凑
- **替代**：
  - UUID v4——非时间有序
  - 自增 ID——多设备生成会冲突

### ADR-007：MCP server 独立进程，不内嵌于 App

- **决策**：MCP server 作为独立 Node.js 进程运行；App 启动时拉起，但 App 关闭不杀死
- **理由**：让 Claude Desktop 等外部 AI 工具随时可访问 vault，不依赖 App 状态；UI 桥（WebSocket 9711）解决了"App 运行时 AI 操作能反映到 UI"的需求
- **替代**：
  - 内嵌 Tauri 主进程——App 关闭即不可用
  - 纯 Rust 实现——需维护两份解析逻辑

### ADR-008：MVP 不做 database / view 能力，但 metadata 格式预留扩展

- **决策**：首版只有 Entry 一种实体，但 metadata 是开放 key-value，且 MCP 暴露 `set_entry_property` tool
- **理由**：极简定位下不引入 schema/view 复杂度；但格式开放性保证未来扩展无需破坏性升级；AI 可立即开始往 metadata 写自定义字段
- **替代**：
  - 完整 database（Notion 式）——违背极简定位
  - metadata 硬编码字段——封死未来扩展

### ADR-009：配置分层为 vault config 与 app settings

- **决策**：跨设备一致的偏好放 vault 内 `config.json`；机器特定/凭据相关放 app settings
- **理由**：避免 WebDAV 凭据通过 WebDAV 自身被同步到云端（自循环问题）；用户换设备打开同 vault 期望 prompt 模板等偏好一致
- **替代**：全部放 vault——凭据同步是隐私问题；全部放本地——UI 偏好换设备丢失

### ADR-010：系统字段用 `_` 前缀约定

- **决策**：metadata 中 `_xxx` 字段 UI 默认不显示，作为内部状态/AI 自动生成元数据的载体
- **理由**：吸收 Tolaria 经验；用纯约定替代代码硬编码字段列表（§1.5.3）；让用户字段和系统字段在同一格式内共存
- **替代**：分两个 metadata 字段——破坏纯文本可读性

### ADR-011：提醒——意图入 vault、句柄留本机，从状态重算

- **决策**：todo 的 `due` 作为同步的 metadata 字段是唯一权威；OS 通知句柄是本机派生缓存，绝不写入 vault；每台设备从 `due`+`status` **重算**自己的待发提醒，而非维护命令式的「调度/取消」状态
- **理由**：满足 §1.5.1（文件系统权威、缓存可重建）；句柄跨设备无意义且若写入会造成同步抖动；重算模型让「完成/删除/改期」自动收敛，无散落取消逻辑
- **范围**：提醒时刻 == `due` 时刻，首版无提前量；过期不补发
- **平台**：iOS/Android 用 OS 级本地通知（关 App 仍触发）；桌面与鸿蒙降级为「仅运行时」进程内定时器
- **替代**：
  - 把句柄写进 metadata——污染纯文本、引发同步循环
  - 由常驻 MCP server 充当桌面提醒守护进程——MCP server 不保证随 App 运行，**已否决**
  - durable OS 级调度（launchd / Task Scheduler / WorkManager 重拉）——后续项

### 数据库能力演进（Level 3–4，路线图）

首版已落地 `database-design.md` 的 **Level 1（开放 metadata 字段）** 与 **Level 2（`#key:value` 输入语法）**——`due`/`priority` 即首批字段。后续按用户信号引入，且老数据 100% 兼容（metadata 已开放）：

- **Level 3 视图**：保存的查询，存为 vault 内 yaml，跟随同步；先做「MCP 工具让 AI 创建 + 时间流渲染」，UI 编辑器后做或不做
- **Level 4 实体**：`entities/*.md` 长期对象，用 `[[wikilink]]` 关联（照搬 Tolaria），可选

详见 `database-design.md` §4–§6。

---

**文档结束**
