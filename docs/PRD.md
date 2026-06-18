# 个人 Loop App — 产品需求文档（PRD）v2.0

> 本文档是产品需求说明，描述「做什么」与「为什么这么做」。
> 不涉及开发计划、阶段划分、估时等执行层内容。

---

## 0. 文档元信息

| 项 | 值                |
|---|------------------|
| 文档版本 | v2.0             |
| 状态 | Final, 可交付开发     |
| 适用对象 | Claude Code（实施方） |
| 产品类型 | 个人单用户工具，本地优先，跨平台 |

### v2.0 相对 v1.x 的重大变更

v2.0 是一次架构重构。背景：v1.x 选择 markdown + 文件系统作为存储，理由是 Obsidian 兼容、AI 可读、跨工具迁移。重新评估后发现：

- 用户实际不使用 Obsidian 打开 vault
- AI 可读和跨工具迁移可通过"按需导出 markdown"实现
- 引入 Project / Habit 等复杂实体后，markdown 的跨文件关联、聚合统计代价急剧上升

因此 v2.0 切换存储引擎，并同时引入 Project 和 Habit 两种新实体。

**主要变更**：

- **存储引擎**：markdown 文件 → SQLite（本地）+ op log（同步源）
- **新增实体**：引入 Project（有终态的目标）和 Habit（持续性习惯）
- **Entry 新增 `ongoing` 状态**：用于"持续进行中，无法打勾"的 entry
- **同步策略**：文件级合并 → op log 回放
- **AI 接入**：从 markdown 解析改为 SQL + JSON
- **数据归属承诺兑现方式**：从"用户随时直接打开 vault 文件"改为"用户随时导出 markdown 快照"
- §1.5.1 改写："文件系统是唯一真实来源"→ "op log 是同步真实来源，本地数据库是查询权威"
- §5.5 移除"不做 SQLite"
- ADR-005 反转，新增 ADR-012（切换至 SQLite + op log 的决策记录）

---

## 1. 产品定位

### 1.1 一句话定义

一个**单用户、本地优先、AI 友好**的极简 GTD/Todo + 行为日志 + 目标/习惯管理工具，运行于桌面与移动端，本地以 SQLite 存储，通过 WebDAV 同步 op log 在多端合并。

### 1.2 目标用户

- 重度使用待办/日志记录的个人用户
- 同时维护多个长期目标和习惯
- 重视数据所有权，不希望被 SaaS 锁定
- 习惯极简界面，反对功能堆砌
- 关注 AI 工具链，希望未来能让 AI 直接访问个人数据

### 1.3 核心价值主张

1. **数据归你所有**：所有数据本地存储；可随时一键导出为 markdown / JSON 快照
2. **无服务端依赖**：同步走用户自备的 WebDAV，不存在「服务关停」风险
3. **AI native**：本地 SQLite 让结构化查询易于实现；桌面端内置 MCP server，Claude 等 AI 工具可直接读写
4. **极简交互**：无底部菜单、首页 + 二级页结构；引入 Project / Habit 不破坏极简
5. **承载推进过程**：Project 容纳长期目标的笔记、思路、关联记录，不只是 todo 列表

### 1.4 非目标（明确不做）

- ❌ 多用户、协作、共享
- ❌ 看板视图、甘特图、日历视图
- ❌ 重复任务（Habit 已覆盖周期性场景）
- ❌ 自有云服务、账号系统
- ❌ 浏览器插件、Web 版
- ❌ **数据库式的 schema 配置 UI、视图编辑器**（结构化能力通过 AI 对话和约定字段实现，不暴露 schema 配置）
- ❌ **markdown 作为主存储**（仍支持作为导出格式）

### 1.5 核心设计原则

以下原则适用于全部模块，是评估任何设计/实现选择的标尺。

#### 1.5.1 Op Log 是同步真实来源，本地数据库是查询权威

数据在系统中有两种持久形态：

| 形态 | 角色 | 同步状态 |
|---|---|---|
| `ops/*.jsonl` op log 文件 | **同步真实来源**：所有变更先记录为 op，再通过 op 回放产生其他状态 | 同步 |
| `data.db` SQLite 数据库 | **本地查询权威**：UI 和 MCP 都从这里读，可由 op log 完全重建 | 不同步 |

任何写操作都遵循：先追加 op → 再应用到 SQLite → 再更新 UI 状态。三者绝不应永久分歧；如分歧，以 op log 为准，按时间序回放重建 SQLite。

#### 1.5.2 约定优于配置（Convention over Configuration）

字段名、表名、状态语义、文件路径遵循固定约定。用户无需配置即可使用，AI 也可基于约定无需额外提示即可理解数据结构。

#### 1.5.3 无硬编码例外

字段名、路径、值不应硬编码在应用代码中。能用约定的用约定，需配置的放配置文件。例如 entry 与 project 的关联通过 `entries.project_id` 外键，AI 通过 schema introspection 即可发现关系。

#### 1.5.4 三表征，一个权威

数据在系统中同时以三种形式存在：

| 表征 | 用途 | 权威性 |
|---|---|---|
| Op log（`ops/*.jsonl`） | 同步、历史、可重放 | **同步真实来源** |
| SQLite 数据库（`data.db`） | 本地查询、UI 渲染、MCP 接入 | 本地权威，派生自 op log |
| UI 状态（React / RN state） | 当前会话渲染 | 派生，必须可重建 |

UI 状态偏离 SQLite 时，重新加载即可恢复；SQLite 偏离 op log 时（极少发生，如数据库文件损坏），用 op log 完全重建。

#### 1.5.5 五条不变量

1. **Op 优先写**：所有改写数据的操作必须先成功追加 op，再应用到 SQLite，再更新 UI
2. **乐观 UI + 回滚**：响应性场景下 UI 可先于 SQLite 更新，但 op 落盘失败必须有明确的回滚路径
3. **无孤儿状态**：UI 状态绝不在 op 未落盘时单独更新
4. **通过 reload 恢复**：状态偏离时，提供「重建本地数据库」入口，从 op log 完全重放
5. **本地数据库可丢弃**：删除 `data.db` 不丢数据，下次启动从 op log 自动重建

#### 1.5.6 路径边界（Path Boundary）

所有文件操作（包括 MCP 暴露给外部 AI 的操作）必须在执行前验证：

- 目标路径必须在 vault 根目录内（拒绝 `..` 转义、绝对路径越界）
- 目标路径必须不在被排除目录内（如 `.local/`、`exports/`）

此规则在桌面端 Rust 后端、移动端原生层、MCP server 各自实现，无例外。

#### 1.5.7 规则克制（Rule Restraint）

任何新增的输入语法、交互规则、命令前缀、UI 控件、实体类型，必须同时满足两个条件才能引入：

1. **价值非冗余**：有"非加不可"的核心价值，不能被已有规则覆盖
2. **协调一致**：与所有已有规则在语法、语义、视觉上无冲突，互相独立、各自承担一个维度

**规则数量不是评价标准；规则之间的协调性才是**。设计或新增功能时，先列出现有规则清单，逐一对照新规则做冲突分析。

反例（应被拒绝）：

- 引入 `#key:value` 语法时已有 `@time` 和 `!priority`：功能重叠，违反第 1 条
- 引入 `/project` 作为字段前缀时已有 `/log` `/done` 作为命令前缀：语义冲突，违反第 2 条
- 输入框右侧加 `+` 字段按钮：暗示用户应主动加字段，破坏极简定位

---

## 2. 核心概念

Loop 的数据模型有三种实体，**互相独立、互相引用**：

| 实体 | 用途 | 特征 |
|---|---|---|
| **Entry** | 单次的任务、行为、日志 | 一次性、有日期归属、可二值或持续性 |
| **Project** | 有终态的目标 / 多步骤工作 | 长期存在、由多个 entry 汇聚、可归档 |
| **Habit** | 持续性的行为模式 | 永远进行中、有周期、靠匹配规则自动统计 |

### 2.1 Entry（条目）

最基础的数据原子。Todo、已完成事项、行为日志、持续性事项统一为 Entry，区分仅在 `status`。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string (ULID) | 唯一标识，时间有序 |
| `content` | string | 正文，含内联标签 |
| `status` | `'todo'` \| `'done'` \| `'log'` \| `'ongoing'` | 状态（见下） |
| `tags` | string[] | 从 content 解析出的标签 |
| `date` | string (YYYY-MM-DD) | 所属日期 |
| `project_id` | string \| null | 可选关联的 project |
| `metadata` | JSON object | 时间戳 + 扩展字段（详见 §6.7） |

**状态语义**：

| Status | 含义 | 完成方式 |
|---|---|---|
| `todo` | 未完成的待办，期望被勾选完成 | 用户勾选 |
| `done` | 已完成的待办 | 由 todo 转换而来 |
| `log` | 已发生的记录，无须完成 | 创建即终态 |
| `ongoing` | **持续进行中**的事项，不期望"打勾完成" | 用户主动归档或转 done |

**为什么需要 `ongoing` 状态**：用户记录"研究 AI 视频带货"这类持续性事项时，它不该被反复勾选完成，但也不属于一次性 log。`ongoing` 解决"todo 列表里永远勾不掉的事项"的体验问题。

**状态流转**：

```
创建为 todo                  勾选完成
[无] ─────────────► todo ────────────────► done
                    │
                    │ 用户标记为持续性
                    ▼
                  ongoing ──► done（用户主动结束时）
                    │
                    │ 用户决定转化为目标
                    ▼
                  升级为 Project（创建关联 project，原 entry 转 done）

创建为 log
[无] ─────────────► log
```

`done` 与 `log` 在首页时间流中视觉相同（都是「已发生的事」），仅在元数据上有区别。`ongoing` 有独立视觉（循环箭头图标），不打勾。

### 2.2 Project（项目 / 目标）

承载长期目标和多步骤工作的实体。Project 不是新的"输入框规则"，它是一种新的实体类型，通过专门的 UI 创建和管理。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string (ULID) | 唯一标识 |
| `name` | string | 项目名 |
| `slug` | string | 用于 URL / MCP 引用的短名 |
| `status` | `'active'` \| `'archived'` | 是否归档 |
| `body` | string (markdown) | 项目笔记正文，承载目标、思路、里程碑等 |
| `tags` | string[] | 项目标签，可与 entry 共用标签空间 |
| `created_at` | ISO 8601 | 创建时间 |
| `archived_at` | ISO 8601 \| null | 归档时间 |
| `metadata` | JSON object | 扩展字段 |

**Project 与 Entry 的关系**：

- 一个 entry 可关联到 0 个或 1 个 project（`entries.project_id`）
- 一个 project 关联 0 个或多个 entry
- Project 详情页展示项目正文 + 所有关联 entry 的时间流
- Project body 内部可写 markdown 待办列表（用 `[ ]` 语法），这些是**项目内部的清单**，与全局 entry 表无关，不出现在首页时间流

**Project 的"完成"是归档而非打勾**：

- 详情页右上角「归档」按钮
- 归档后 project status 变为 `archived`，主界面不再显示
- 关联的 entry 不动（保留历史）
- 可在「归档项目」二级页查看，可随时取消归档

### 2.3 Habit（习惯）

承载持续性行为模式的实体。Habit 永远在进行中，没有"完成"概念，只有"周期内达成情况"。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string (ULID) | 唯一标识 |
| `name` | string | 习惯名 |
| `slug` | string | 短名 |
| `status` | `'active'` \| `'paused'` \| `'archived'` | 状态 |
| `body` | string (markdown) | 习惯笔记（为什么做、注意事项等） |
| `schedule` | JSON object | 周期 + 目标 + 匹配规则 |
| `created_at` | ISO 8601 | 创建时间 |
| `metadata` | JSON object | 扩展字段 |

**`schedule` 字段示例**：

```json
{
  "period": "week",
  "target_min": 3,
  "target_max": 4,
  "match": {
    "tag": "游泳"
  }
}
```

字段说明：

- `period`: `'day'` \| `'week'` \| `'month'`
- `target_min` / `target_max`: 期望频次区间（如「每周 3-4 次」）
- `match`: 匹配规则，MVP 仅支持 `{ tag: string }`，未来可扩展 `content_contains`、`status` 等条件

**统计方式**：

- 不在 entries 表上加 `habit_id` 外键
- 系统在查询时按 `match` 规则**动态匹配** entries
- 例：「每周 3-4 次游泳」会匹配所有 `tag` 含 `游泳` 的 entry
- 用户记录某次游泳照常写 entry 即可，无须显式关联 habit

**Habit 详情页**：

- 习惯定义（来自 `body`）
- 本周期达成情况（如 `3 / 3-4 ✅` 或 `2 / 3-4 ⚠️`）
- 历史热力图（过去 N 个周期的达成状态）
- 关联的所有 log entry 列表

**Habit 没有「完成」状态**：

- `active`：活跃中（参与统计）
- `paused`：暂停（不统计，定义保留）
- `archived`：归档（不再关心，详情页不显示）

### 2.4 Tag（标签）

- 内联在 entry content 中，形如 `#工作`、`#健康`
- Project 和 Habit 也有 `tags` 字段
- 不预先定义，写到哪个就出现哪个
- 可作为筛选维度
- entry content 中必须以空格或行首开头（避免误把 `#1` 当作标签）

Tag 是三种实体的**共享分类维度**。一个 tag 可以同时被 entry、project、habit 使用。

### 2.5 Vault（数据根目录）

整个 app 的数据存放目录，结构详见 §6.1。Vault 不再是"用户直接编辑的 markdown 文件夹"，而是"app 的数据目录 + 同步源 + 导出快照"的容器。

---

## 3. 信息架构

### 3.1 页面层级

只有 1 个首页 + 若干二级页，**没有底部菜单**。

```
┌──────────────────────────────────────────────────┐
│ 首页（时间流）                                    │
│  ├─ 顶部输入框（创建 entry）                       │
│  ├─ 时间流（entries 按时间倒序）                    │
│  └─ 右上角「⋯」入口                                │
└──────────────────────────────────────────────────┘
       │
       ├── 点条目 ─────────► 二级页：条目详情
       │
       ├── 点 #标签 ────────► 二级页：标签视图
       │
       ├── 顶部下拉 ────────► 二级页：搜索
       │
       └── 右上角「⋯」──────► 弹出菜单
                            ├─► 二级页：项目列表
                            │     └─► 二级页：项目详情
                            │           └─► 二级页：归档项目列表
                            ├─► 二级页：习惯列表
                            │     └─► 二级页：习惯详情
                            ├─► 二级页：搜索
                            ├─► 二级页：设置
                            │     ├─► 二级页：同步配置
                            │     ├─► 二级页：AI 配置
                            │     ├─► 二级页：Prompt 模板管理
                            │     ├─► 二级页：导出
                            │     └─► 二级页：关于
                            └─► 二级页：冲突列表（仅有冲突时显示）
```

**自适应入口**：

- 当用户没有任何 project 时，「项目列表」入口在「⋯」菜单中不显示
- 习惯同理
- 这避免新用户被陌生概念干扰，符合"按需引入"

### 3.2 导航规则

- 所有二级页通过 push 进入，左上角返回（或手势返回）
- 二级页之间不可横向跳转，必须返回首页或上一级
- 例外：entry 详情中点 project 链接可 push 到该 project 详情；project 详情中点 entry 可 push 到该 entry 详情。**这种跨实体跳转保留为 push 关系**，返回时正确回退

### 3.3 首次启动流程

App 启动时检查是否已有 vault 配置：

```
启动 → 读取 app settings 中的 vault path
  ├─ path 存在且可访问 → 加载 data.db / 从 op log 重建 → 进入首页
  └─ path 不存在或无配置 → WelcomeScreen
         │
         ├─ 选项 A：创建新 vault
         │     用户选择父目录 → 创建空 vault（含初始化的 data.db、空 ops/ 目录）→ 进入首页
         │
         ├─ 选项 B：打开已有 vault
         │     用户选择已有 vault 目录 → 从 op log 重建 data.db → 进入首页
         │
         └─ 选项 C：从 WebDAV 拉取
               用户配置 WebDAV → 选本地保存目录 → 下载 ops/ → 重建 data.db → 进入首页
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
  - 以 `/ongoing ` 开头 → `ongoing`（去除前缀作为 content）
- 输入中实时高亮 `#标签`
- 多行输入用 `Shift+Enter`（桌面），移动端右侧扩展按钮

**MVP 阶段输入框只识别 `#tag` 和 `/log` `/done` `/ongoing` 行首命令**。其他输入语法（如 `@time` 截止日期、行尾 `!`/`!!`/`!!!` 优先级）属于 database 能力 Level 2 演进，详见 database-design 文档。

**输入辅助工具栏（未来引入）**：当 Level 2 引入 `@`、`!` 等需要切换输入法的符号时，可在输入框正上方提供工具栏。这不是新规则，而是已有规则的辅助输入。

#### 4.1.2 时间流

- entries 按 `date` 倒序，同日内按 `updated_at` 倒序
- **`ongoing` entry 默认置顶展示**于"今天"分组之上，作为持续性事项的提醒区
- 用户可在设置中关闭 ongoing 置顶
- 跨日分组，日期作为分隔符（如「今天」「昨天」「2026-05-16 周六」）
- 单条 entry 展示：状态图标 + content（标签高亮）+ 相对时间 + project chip（若关联）
- 默认加载最近 14 天，向下滚动加载更多
- 空状态：提示创建第一条 entry

#### 4.1.3 条目交互

| 操作 | 桌面 | 移动 |
|---|---|---|
| 切换 todo/done | 点击 checkbox | 点击 checkbox |
| 进入详情 | 点击 content 区域 | 点击 content 区域 |
| 删除 | 右键菜单 | 左滑 |
| 复制 | 右键菜单 | 长按 |
| 关联到 project | 右键菜单 | 长按菜单 |
| **升级为 project** | 右键菜单 | 长按菜单 |
| **降级为普通 todo**（取消 ongoing） | 详情页 / 右键 | 详情页 / 长按 |

**"升级为 project"** 是一个重要操作：当用户发现一个 entry 实际上是个长期目标，可一键升级。系统行为：

1. 创建新 project，name 取自 entry content
2. 原 entry 关联到新 project（`project_id` 设置）
3. 原 entry status 变为 `done`（或保留 ongoing，用户选）
4. 自动 push 到新 project 详情页

### 4.2 二级页：条目详情

- 展示 entry 完整信息
- 可编辑 content（即可改 tag）
- todo 类型可设置、修改、清除截止时间（写入 `metadata.due`，见 §6.7.3）
- 显示创建时间、完成时间、log 时间（按状态）
- **关联项目**：可设置、修改、清除关联的 project（下拉选择已有项目或新建）
- 显示元数据（折叠，默认隐藏）；带 `_` 前缀的系统字段（§6.7）默认不显示
- 删除按钮（带二次确认）
- 标签可点击 → 跳到标签视图
- 状态切换：todo / done / log / ongoing 之间可任意切换（仅 done 不可手动改回 todo，须通过取消勾选）

### 4.3 二级页：标签视图

- 顶部展示标签名 + 该标签下 entry / project / habit 总数
- 三个 tab：「条目」「项目」「习惯」
- 列表样式同首页时间流（条目 tab）；项目和习惯为列表样式
- 条目 tab 顶部 toggle：「全部 / 仅未完成 / 仅已完成 / 仅 ongoing」

### 4.4 二级页：搜索

- 顶部搜索框，实时搜索（300ms 防抖）
- 搜索范围：entry content / project name+body / habit name+body / 标签精确匹配
- 结果按相关度 + 时间排序，分三段展示（条目 / 项目 / 习惯）
- 支持搜索语法：
  - `#tag` 仅按标签
  - `type:entry` / `type:project` / `type:habit`
  - `status:todo` / `status:done` / `status:log` / `status:ongoing` / `status:active` / `status:archived`
  - `date:2026-05` / `date:>=2026-05-01`
  - `project:slug`
  - 多条件空格分隔，AND 关系

### 4.5 二级页：项目（Project）

#### 4.5.1 项目列表

- 列出所有 active project，按最近活动时间倒序
- 每条：项目名 + 关联 entry 数 + 最近活动时间 + tags
- 右上角「新建项目」按钮
- 右上角「⋯」→「已归档项目」入口

#### 4.5.2 项目详情

- **正文区**：markdown 渲染的 project body（目标、思路、里程碑等）
  - 点击「编辑」进入编辑模式
  - 支持基础 markdown 渲染（标题、列表、代码块、链接、checkbox）
  - body 内的 `[ ]` checkbox 是**项目内部清单**，不出现在全局时间流，仅在此处可勾选
- **关联 entry 区**：所有关联的 entry 按时间倒序展示，同首页 entry 行样式
  - 可在此区域直接创建关联 entry（输入框，默认 project_id 已设置）
- 顶部操作：编辑 / 归档 / 删除（带二次确认）

#### 4.5.3 项目创建

- 入口：项目列表「新建」、entry 长按「升级为 project」、AI 通过 MCP
- 创建表单：名称（必填）/ slug（自动生成可改）/ 初始 tags / body 模板（可选）
- 创建后 push 到该 project 详情页

#### 4.5.4 项目归档与删除

- 归档：status 改为 `archived`，主列表不再显示；entries 关联不变；可恢复
- 删除：物理删除 project 行；关联 entry 的 `project_id` 置 null（不删 entry）

### 4.6 二级页：习惯（Habit）

#### 4.6.1 习惯列表

- 列出所有 active habit
- 每条：习惯名 + 本周期进度（如 `3/3-4 ✅`）+ 状态色（达标绿、未达橙、超额蓝）
- 右上角「新建习惯」按钮
- 右上角「⋯」→「已归档习惯」入口

#### 4.6.2 习惯详情

- **定义区**：习惯名 / 周期 / 目标频次 / 匹配规则
  - 点击编辑进入修改模式
- **正文区**：markdown 渲染的 body（为什么做、注意事项）
- **本周期进度**：可视化进度条 + 当前周期匹配到的 entry 列表
- **历史热力图**：过去 N 个周期（默认 12 个）的达成情况，类似 GitHub 贡献图
- **关联 entry 列表**：所有匹配的 entry，按时间倒序

#### 4.6.3 习惯创建

- 入口：习惯列表「新建」、AI 通过 MCP
- 创建表单：
  - 名称（必填）
  - 周期：日 / 周 / 月
  - 目标频次：min / max（如 3 / 4 表示「3-4 次」；min=max 表示「精确 N 次」）
  - 匹配规则：MVP 仅支持「带某 tag 的 entry」
  - body（可选）
- 创建后 push 到该 habit 详情页

#### 4.6.4 习惯状态管理

- Pause：暂停统计，定义保留，列表中灰显
- Resume：恢复 active
- Archive：彻底归档，列表不显示
- Delete：物理删除 habit 行；不影响任何 entry

### 4.7 二级页：设置

#### 4.7.1 同步配置

- WebDAV 三项：URL、用户名、密码
- 密码不显示明文，存系统密钥库
- 「测试连接」按钮
- 「立即同步」按钮
- 显示上次同步时间、最近一次同步结果
- 自动同步开关（默认开）
- 自动同步触发器（详见 §4.9）
- 冲突列表入口（如有冲突）

#### 4.7.2 AI 配置

- Provider 选择：Anthropic / OpenAI / Ollama / 自定义 endpoint
- API Key 输入（存密钥库）
- Model 选择（按 provider 动态加载或预设列表）
- 「测试」按钮：发一条 "hello" 验证
- AI 功能总开关（默认关，需主动开启）
- 隐私提示：「开启后，问 AI 操作会将相关 entries 发送给所选 provider」

#### 4.7.3 Prompt 模板管理

- 列表展示所有模板（预置 + 自定义）
- 每条：名称、prompt 正文、变量占位符
- 预置模板（不可删除，可修改副本）：
  - 「总结这周做了什么」
  - 「给未完成 todo 按优先级排序」
  - 「分析时间分配模式」
  - 「梳理 ongoing 事项是否该升级为 project」
  - 「本周习惯达成回顾」
- 自定义模板可增删改

#### 4.7.4 导出

- 「导出 markdown 快照」：把当前所有数据生成可读 markdown 包，存到 `exports/<timestamp>/`
- 「导出 JSON dump」：把数据库完整序列化为 JSON
- 「导出 op log」：复制 `ops/` 整目录
- 导出文件不被 op log 跟踪、不参与 WebDAV 同步（在 `.local` 等价的本地缓存目录或 `exports/` 子目录，详见 §6.1）

#### 4.7.5 关于

- 版本号
- 数据目录路径（可点击打开）
- 「重建本地数据库」按钮：从 op log 完全重建 `data.db`（§1.5.5 不变量 4 的恢复入口）
- 链接：开源仓库、文档

### 4.8 AI 功能

#### 4.8.1 「问 AI」按钮

- 出现在首页、标签视图、搜索结果、项目详情、习惯详情页右上角
- 点击弹出 Prompt 模板选择
- 选择后将当前可见数据（entries / projects / habits）作为上下文，组合模板发送
- 流式展示 AI 回答
- AI 回答可保存为 entry（status=log，加 `#ai_summary` 标签）

#### 4.8.2 MCP Server（仅桌面端）

桌面端附带一个独立的 MCP server 进程，让外部 AI 工具（Claude Desktop、Cursor 等）直接访问 vault。

**架构**：

```
┌──────────────────────────────────────────────────────┐
│  桌面 App (Tauri)                                    │
│    ├─ UI (React)                                     │
│    └─ Rust 后端                                       │
│         ├─ SQLite 读写                                │
│         ├─ Op log 追加 / 同步                          │
│         └─ 启动时 spawn MCP server 子进程              │
└──────────────────────────────────────────────────────┘
                         │ shared SQLite + op log
                         ▼
┌──────────────────────────────────────────────────────┐
│  MCP Server (独立 Node.js 进程)                       │
│    ├─ stdio 传输：对接 Claude Desktop / Cursor        │
│    ├─ 直接读写同一个 data.db 和 ops/                  │
│    ├─ WebSocket :9710 (Tool Bridge)                  │
│    └─ WebSocket :9711 (UI Bridge)                    │
└──────────────────────────────────────────────────────┘
                         │
                         ▼
                    Vault 文件系统
```

**关键设计**：

- MCP server 是独立进程，**App 关闭时仍可运行**
- App 启动时自动启动 MCP server（如未运行）；App 关闭不杀死 MCP server
- App 和 MCP server **共享同一个 SQLite 文件**，通过 SQLite 的 WAL 模式实现并发读写
- 任一方写操作都会追加 op、更新 SQLite，并触发对方通过 WebSocket 重载状态
- MCP server 通过 WebSocket 9711 主动通知 App UI 跳转
- App 启动时自动向 Claude Desktop 配置文件注册自己

**暴露的 Tools**：

| 类别 | Tool | 输入 | 输出 |
|---|---|---|---|
| 读 Entry | `list_entries` | `date?, tag?, status?, project_id?, limit?` | `Entry[]` |
| 读 Entry | `get_entry` | `id` | `Entry` |
| 读 Entry | `search_entries` | `query, limit?` | `Entry[]` |
| 读 Entry | `get_recent_logs` | `days?` | `Entry[]` |
| 写 Entry | `create_entry` | `content, status?, project_id?, metadata?` | `Entry` |
| 写 Entry | `complete_entry` | `id` | `Entry` |
| 写 Entry | `update_entry` | `id, content?, metadata?, status?, project_id?` | `Entry` |
| 写 Entry | `delete_entry` | `id` | `void` |
| 写 Entry | `set_entry_property` | `id, key, value` | `Entry` |
| 写 Entry | `upgrade_entry_to_project` | `id` | `Project` |
| 读 Project | `list_projects` | `status?, tag?` | `Project[]` |
| 读 Project | `get_project` | `id_or_slug` | `{ project: Project, entries: Entry[] }` |
| 写 Project | `create_project` | `name, body?, tags?` | `Project` |
| 写 Project | `update_project` | `id, name?, body?, tags?` | `Project` |
| 写 Project | `archive_project` | `id` | `Project` |
| 写 Project | `delete_project` | `id` | `void` |
| 读 Habit | `list_habits` | `status?` | `Habit[]` |
| 读 Habit | `get_habit` | `id_or_slug` | `{ habit: Habit, progress: HabitProgress, entries: Entry[] }` |
| 写 Habit | `create_habit` | `name, schedule, body?` | `Habit` |
| 写 Habit | `update_habit` | `id, name?, schedule?, body?, status?` | `Habit` |
| 写 Habit | `delete_habit` | `id` | `void` |
| 通用 | `vault_context` | — | `{ tags, recent_entries, active_projects, active_habits, stats }` |
| 通用 | `query_entries` | `filter (JSON)` | `Entry[]` |
| UI | `ui_open_entry` | `id` | `void` |
| UI | `ui_open_project` | `id_or_slug` | `void` |
| UI | `ui_open_habit` | `id_or_slug` | `void` |
| UI | `ui_open_today` | — | `void` |
| UI | `ui_open_tag` | `tag` | `void` |

UI 类 tools 通过 WebSocket 9711 推送给 App 前端；当 App 未运行时 UI tools 直接返回成功但不产生效果。

**MCP server 的写操作必须**：

- 经过 §1.5.6 路径边界检查
- 走 op-log-first 写流程（追加 op → 应用 SQLite → 触发 UI 重载）
- 触发 vault 同步（异步，不阻塞 tool 返回）

### 4.9 同步功能

#### 4.9.1 同步状态机

| State | 显示 | 颜色 | 触发条件 |
|---|---|---|---|
| `idle` | Synced / Synced Xm ago | 绿 | 同步成功 |
| `syncing` | Syncing… | 蓝 | 同步进行中 |
| `conflict` | Conflict | 橙 | 检测到真冲突 |
| `error` | Sync failed | 灰 | 网络/认证错误 |
| `disabled` | Sync off | 灰 | 用户关闭同步 |

状态显示位置：

- 桌面：底部状态栏
- 移动端：首页顶部右侧小图标

注：v1.x 中的 `pull_required` 状态在 v2.0 op log 模型下不存在——op log 不存在 push 被拒，所有变更按时间序回放即可。

#### 4.9.2 同步触发时机

| 触发器 | 时机 | 备注 |
|---|---|---|
| 启动 | App 启动后 3 秒 | 不阻塞 UI |
| 编辑防抖 | 任何写操作后 30s | 多次编辑只触发一次 |
| 应用失焦 | 桌面/移动端切到后台时立即 | 提高跨端及时性 |
| 应用获焦 | 桌面/移动端切回前台时立即 | 拉取远端变化 |
| 周期 | 每 N 分钟（默认 5，可配置） | 兜底 |
| 手动 | 用户点「立即同步」 | 任何时候可用 |

#### 4.9.3 同步流程

详见 §6.4。

#### 4.9.4 离线行为

- 离线时 App 完全可用，所有写操作正常追加 op、应用 SQLite
- 同步状态显示 `error`，但不阻塞使用
- 网络恢复后自动重试同步，未同步的 op 自动 push

### 4.10 跨平台一致性

| 能力 | 桌面 | iOS/Android/鸿蒙 |
|---|---|---|
| Entry / Project / Habit CRUD | ✅ | ✅ |
| WebDAV 同步 | ✅ | ✅ |
| AI 调用 | ✅ | ✅ |
| 搜索 | ✅ | ✅ |
| 全局快捷键呼出 | ✅ | ❌ |
| 系统托盘 | ✅ | ❌ |
| MCP server | ✅ | ❌ |
| 多窗口 | ✅ | ❌ |
| todo 到期系统通知 | ✅ | ✅ |

移动端不实现的能力，UI 上不出现对应入口，无需"功能不可用"提示。

### 4.11 Todo 到期系统通知

todo entry 可设置一个可选截止时间 `metadata.due`。当当前时间到达或超过该时间，且 entry 仍为 `todo` 状态时，App 必须触发一次本机系统通知。

**范围**：

- 仅 `todo` 状态触发通知；`done` / `log` / `ongoing` 永不触发
- 同一个 entry 的同一个 due 时间只通知一次，避免重复打扰
- 用户勾选完成、删除 todo、清除 due、转 ongoing 后，不再触发该通知
- 用户修改 due 后，按新的 due 重新调度通知
- 多端同步到带 `due` 的 todo 后，本机也应按该时间参与通知调度

**交互**：

- 详情页提供截止时间编辑入口：设置、修改、清除
- 首页 entry 行可用轻量 badge 展示截止时间；已过期且仍未完成的 todo 应有弱提醒样式

**系统行为**：

- 桌面端使用操作系统通知能力；移动端使用系统本地通知能力
- 系统通知权限未授权时，App 应在设置或首次设置 due 时引导用户授权；未授权不阻塞创建 todo
- App 启动、vault reload、同步完成、entry 写操作后，都必须重建或更新待通知队列
- 通知文案应包含 todo 正文摘要，不携带 `_` 前缀系统字段或敏感配置

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
    /core            # 纯 TypeScript：数据模型、SQLite 抽象、op log、同步逻辑、AI 调用
    /desktop         # Tauri + React
    /mobile          # React Native（含 iOS/Android/HarmonyOS 三个原生工程）
    /mcp-server      # 独立 Node.js MCP server
  /docs
```

`core` 包是数据契约的实施载体，三端通过 `Storage` 抽象接口注入各自的 SQLite 绑定，共享其余所有逻辑。

### 5.3 数据流分层

```
┌─────────────────────────────────┐
│  React / RN State (内存)         │  ← 派生
└──────────────▲──────────────────┘
               │ 订阅 SQLite 变更
┌──────────────┴──────────────────┐
│  SQLite (data.db)                │  ← 本地查询权威
└──────────────▲──────────────────┘
               │ op apply / replay
┌──────────────┴──────────────────┐
│  Op Log (ops/*.jsonl)            │  ← 同步真实来源
└─────────────────────────────────┘
```

**写操作流向**（严格自下而上）：

```
用户操作 → 计算 op → 追加 op 到 ops/today.jsonl → 应用 op 到 SQLite → 更新 UI 状态
                         ↑ 失败则中止后续
```

**读操作流向**：

```
启动：扫描 ops/ → 重放到 SQLite（如 SQLite 已存在且一致则跳过）→ 注入 UI
运行时：从 SQLite 读 → 渲染 UI
异常恢复：删除 SQLite → 从 op log 完全重建
```

### 5.4 平台特定 API 抽象

`core` 定义两个抽象接口：

- `Storage`：SQLite 访问抽象
  - 桌面：`tauri-plugin-sql`（基于 sqlx）
  - iOS/Android：`react-native-quick-sqlite`
  - 鸿蒙：`@ohos.data.relationalStore`
- `FileSystem`：op log 和 attachments 的文件 IO 抽象
  - 桌面：Tauri fs plugin
  - iOS/Android：`react-native-fs`
  - 鸿蒙：`@ohos.file.fs`

**密钥存储**：

- macOS：Keychain / Windows：Credential Manager / Linux：libsecret
- iOS：Keychain / Android：Keystore / 鸿蒙：HUKS

### 5.5 不做的技术选择

- ❌ 自有云服务、自有账号系统
- ❌ 服务端代码
- ❌ Electron（用 Tauri）
- ❌ Expo（裸 RN，因为鸿蒙）
- ❌ 富文本编辑器（entry content 是单行短文本；project / habit body 用基础 markdown）
- ❌ ORM（数据访问直接用 SQL，schema 简单不必引入复杂度）
- ❌ 主存储用 markdown（详见 ADR-005 反转）

---

## 6. 数据规范

### 6.1 Vault 文件组织

```
<vault-root>/
  data.db                      # 本地 SQLite 数据库（不同步）
  data.db-wal                  # SQLite WAL（不同步）
  data.db-shm                  # SQLite shared memory（不同步）
  ops/                         # Op log 目录（同步源）
    2026/
      05/
        2026-05-18.jsonl       # 当天的 op 日志，按行 append
        2026-05-19.jsonl
      04/
        ...
  attachments/                 # 附件（同步）
    images/
    files/
  exports/                     # 用户手动导出的快照（不同步）
    2026-05-22T10-30/
      markdown/
      data.json
  config.json                  # vault 内配置（同步，跨设备一致偏好）
  .local/                      # 本地缓存和临时状态（不同步）
    sync-state.json            # 上次同步状态
    notifications.json         # 通知调度队列
```

**同步范围**：仅 `ops/`、`attachments/`、`config.json` 参与 WebDAV 同步。`data.db*`、`exports/`、`.local/` 不同步。

**为什么 `data.db` 不同步**：SQLite 是 binary，不可按行 merge；多端并发写直接同步整库会丢数据。`data.db` 是从 op log 派生的本地缓存，可重建。

### 6.2 SQLite Schema

#### 6.2.1 entries 表

```sql
CREATE TABLE entries (
  id           TEXT PRIMARY KEY,         -- ULID
  content      TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('todo', 'done', 'log', 'ongoing')),
  date         TEXT NOT NULL,            -- YYYY-MM-DD
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL,            -- ISO 8601
  updated_at   TEXT NOT NULL,
  done_at      TEXT,                     -- ISO 8601，仅 status=done 时有值
  log_at       TEXT,                     -- ISO 8601，仅 status=log 时有值
  metadata     TEXT NOT NULL DEFAULT '{}'  -- JSON
);

CREATE INDEX idx_entries_date ON entries(date DESC);
CREATE INDEX idx_entries_status ON entries(status);
CREATE INDEX idx_entries_project ON entries(project_id);
CREATE INDEX idx_entries_updated ON entries(updated_at DESC);

CREATE TABLE entry_tags (
  entry_id     TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  tag          TEXT NOT NULL,
  PRIMARY KEY (entry_id, tag)
);
CREATE INDEX idx_entry_tags_tag ON entry_tags(tag);
```

#### 6.2.2 projects 表

```sql
CREATE TABLE projects (
  id           TEXT PRIMARY KEY,         -- ULID
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  body         TEXT NOT NULL DEFAULT '', -- markdown
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  archived_at  TEXT,
  metadata     TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_slug ON projects(slug);

CREATE TABLE project_tags (
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag          TEXT NOT NULL,
  PRIMARY KEY (project_id, tag)
);
```

#### 6.2.3 habits 表

```sql
CREATE TABLE habits (
  id           TEXT PRIMARY KEY,         -- ULID
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL CHECK (status IN ('active', 'paused', 'archived')),
  body         TEXT NOT NULL DEFAULT '',
  schedule     TEXT NOT NULL,            -- JSON: { period, target_min, target_max, match }
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  metadata     TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_habits_status ON habits(status);
CREATE INDEX idx_habits_slug ON habits(slug);
```

#### 6.2.4 同步元数据表

```sql
CREATE TABLE sync_meta (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL
);
-- 已知 key：
--   'last_applied_op_id'   ULID of last op applied to SQLite
--   'last_sync_at'          ISO 8601 of last successful sync
--   'device_id'             Stable per-device identifier
--   'schema_version'        Integer

CREATE TABLE applied_ops (
  op_id        TEXT PRIMARY KEY,         -- ULID
  applied_at   TEXT NOT NULL
);
CREATE INDEX idx_applied_ops_applied ON applied_ops(applied_at);
```

`applied_ops` 用于幂等保证——同一个 op 不会被重复应用，无论它来自本地还是从远端拉取。

### 6.3 Op Log 格式

每个 op 是一行 JSON（jsonl 格式），按时间分文件存储于 `ops/YYYY/MM/YYYY-MM-DD.jsonl`。

#### 6.3.1 Op 通用结构

```json
{
  "id": "01HXYZABCD1234567890ABCDEF",
  "device_id": "device-laptop-a1b2c3",
  "schema_version": 1,
  "at": "2026-05-18T22:15:33Z",
  "kind": "entry.create",
  "payload": { /* see kind-specific */ }
}
```

通用字段：

- `id`: Op ULID（时间序）
- `device_id`: 写入设备（用于诊断、不参与冲突解决）
- `schema_version`: 数据结构版本，便于未来演进
- `at`: 操作发生时间
- `kind`: 操作类型（见下）
- `payload`: 操作具体内容

#### 6.3.2 已定义的 op kind

**Entry**：

| Kind | Payload |
|---|---|
| `entry.create` | `{ id, content, status, date, project_id?, tags[], metadata }` |
| `entry.update` | `{ id, fields: { content?, status?, project_id?, tags?, metadata? } }` |
| `entry.delete` | `{ id }` |
| `entry.set_metadata` | `{ id, key, value }` （fine-grained，仅改一个字段） |

**Project**：

| Kind | Payload |
|---|---|
| `project.create` | `{ id, name, slug, body, tags[], metadata }` |
| `project.update` | `{ id, fields: { name?, slug?, body?, tags?, metadata? } }` |
| `project.archive` | `{ id, at }` |
| `project.unarchive` | `{ id }` |
| `project.delete` | `{ id }` |

**Habit**：

| Kind | Payload |
|---|---|
| `habit.create` | `{ id, name, slug, body, schedule, metadata }` |
| `habit.update` | `{ id, fields: { name?, slug?, body?, schedule?, status?, metadata? } }` |
| `habit.delete` | `{ id }` |

**Config**（vault config 也通过 op log 同步）：

| Kind | Payload |
|---|---|
| `config.set` | `{ path: ['ai', 'promptTemplates', 0], value }` |
| `config.unset` | `{ path }` |

#### 6.3.3 Op 应用规则

1. **幂等**：每个 op 通过 `id` 判重；已在 `applied_ops` 中则跳过
2. **顺序**：按 `id` 的 ULID 时间序应用，与设备无关
3. **Last-Write-Wins**：对同一 entity 的多次 update，按 op 时间序应用；最后一次胜出
4. **删除墓碑**：`*.delete` op 是终态；删除后再来的 update op 应被忽略（即使时间序更晚）—— 这通过应用时检查 entity 是否已被删除来实现
5. **Schema 演化**：`schema_version` 不匹配时，应用前先做 op payload 升级（转换层），保证旧 op 在新版 schema 下可应用

### 6.4 同步规则

#### 6.4.1 同步流程

```
1. 列出本地 ops/ 下所有 .jsonl 文件
2. 列出远端 ops/ 下所有 .jsonl 文件
3. 对比每个文件：
   - 仅本地有 → push
   - 仅远端有 → pull
   - 双方都有：
     a. 远端 size > 本地 size → pull 远端，本地追加远端新 op
     b. 本地 size > 远端 size → push 本地
     c. size 相同但 hash 不同 → 走 op-level 合并：
        - 解析双方所有 op
        - 取并集，按 op.id（ULID）排序去重
        - 写回合并后的内容
4. 同步 attachments/ 文件（按 mtime 简单 newer wins）
5. 同步 config.json（其实通过 op log 同步，无需单独处理；但首次同步可下载 config.json 引导）
6. 应用本次同步拉取的所有新 op 到 SQLite
7. 更新 sync_meta.last_sync_at
```

#### 6.4.2 Op-Level 合并

```
本地 ops = parse(local file)
远端 ops = parse(remote file)
合并 = sorted_unique_by_id(local_ops ∪ remote_ops)
写本地 file := 合并
写远端 file := 合并
```

由于 op 是 append-only 且 ID 是时间序，合并几乎不会产生真冲突。同一时刻的两个设备生成不同 op 也按各自 ULID 排序应用即可，结果一致。

#### 6.4.3 真冲突（极少发生）

理论真冲突场景：两个设备各自对同一 entity 字段做更新，且应用顺序不同会得到不同最终状态。**LWW 规则保证最终一致性，但用户可能感觉"我刚才改的怎么没了"**。

处理：

- LWW 自然生效，无须报错
- 详情页提供「历史」入口，展示该 entity 在 op log 中的所有变更记录（按时间倒序）
- 用户可从历史中恢复任意旧版本（生成一个新的 `*.update` op）

#### 6.4.4 应用层删除处理

不再需要 markdown 时代的 tombstone。`*.delete` op 本身就是软删除标记：

- 删除 entity → 追加 `*.delete` op
- 应用到 SQLite → `DELETE FROM ... WHERE id = ?`
- 但 op log 永远保留这个 delete op
- 若有迟到的 update op（在 delete 后到达），应用时检测到 entity 已不存在则跳过

#### 6.4.5 冲突 UI

由于真冲突极少且 LWW 自动解决，正常使用中不出现冲突提示。例外：

- 同步流程检测到本地 SQLite 与 op log replay 结果不一致（数据库损坏）→ 触发 `error` 状态，引导用户「重建本地数据库」
- 网络/认证错误 → 显示 `error`，不阻塞使用

### 6.5 Vault Config（跟随同步）

`<vault-root>/config.json`，存储**跨设备一致的偏好**。

```json
{
  "version": 2,
  "ui": {
    "theme": "auto",
    "language": "zh-CN",
    "ongoing_pinned": true
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
    "健康": "#10b981"
  }
}
```

**变更通过 op log 同步**（`config.set` / `config.unset` op）。`config.json` 是 op log 重放的派生结果，类似 SQLite 的角色。

**判断准则**：用户是否期望这条配置跨设备一致？是 → 放 vault config。

### 6.6 App Settings（仅本机）

桌面：`~/.config/<app>/settings.json`
移动：平台特定 app sandbox 内

存储**机器相关、凭据引用、运行时偏好**。

```json
{
  "version": 2,
  "vaultPath": "/Users/me/Documents/loop-vault",
  "deviceId": "device-laptop-a1b2c3",
  "sync": {
    "webdav": {
      "url": "https://dav.jianguoyun.com/dav/loop-app/",
      "username": "user@example.com",
      "passwordRef": "keychain://loop-app/webdav"
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
    "apiKeyRef": "keychain://loop-app/anthropic-key",
    "endpoint": null
  },
  "window": {
    "width": 1024,
    "height": 768
  }
}
```

**`deviceId` 必须放在 app settings**：每台设备需要稳定的标识用于 op 的 `device_id` 字段；该 ID 跨设备不能一致，所以不能放 vault config。

### 6.7 Metadata 扩展约定

Entry / Project / Habit 都有 `metadata` JSON 字段，存储扩展属性。

#### 6.7.1 Entry 基础字段（解析器约定识别）

| 字段 | 类型 | 说明 |
|---|---|---|
| `due` | ISO 8601 | todo 的截止时间 |
| `priority` | 0-3 | 优先级（0=无、1=P1、2=P2、3=P3） |

#### 6.7.2 系统字段约定（下划线前缀）

任何**以 `_` 开头的字段**是系统字段：

- UI 默认**不显示**（仅"显示元数据"折叠区可见）
- 不可在「问 AI」的上下文中默认携带（除非用户显式要求）
- 用于 App 内部状态、AI 自动生成的元数据

示例：

```json
{
  "_ai_category": "工作",
  "_ai_priority_suggestion": 3,
  "_last_notified_due": "2026-05-18T09:00:00Z"
}
```

#### 6.7.3 用户字段（无前缀）

用户/AI 可自由添加任何 key-value：

```json
{
  "due": "2026-05-25T09:00:00Z",
  "priority": 2,
  "context": "office",
  "estimated_minutes": 30
}
```

MVP 不做用户字段的编辑 UI（除 `due` 在详情页有专门入口），但解析器、MCP `set_entry_property` tool、AI 必须能读写这些字段。

#### 6.7.4 校验规则

- key：`[a-zA-Z_][a-zA-Z0-9_]*`，最长 40 字符
- value：JSON 标量（string、number、boolean、null）；不支持嵌套对象和数组
- 单个 metadata JSON 必须 < 4KB

---

## 7. 交互细节

### 7.1 设计原则

1. **首页能完成 80% 操作**：创建、查看、勾选、删除
2. **二级页是补充信息**：不放主要操作入口
3. **键盘优先（桌面）**：核心操作有快捷键
4. **手势优先（移动）**：列表项左滑、下拉刷新、长按
5. **新实体按需出现**：用户没建过 project / habit 时，相关入口不显示

### 7.2 桌面快捷键

| 快捷键 | 功能 |
|---|---|
| `Cmd/Ctrl + N` | 聚焦输入框（全局，App 在后台也响应） |
| `Cmd/Ctrl + F` | 进入搜索页 |
| `Cmd/Ctrl + P` | 项目列表 |
| `Cmd/Ctrl + H` | 习惯列表 |
| `Cmd/Ctrl + ,` | 进入设置 |
| `Cmd/Ctrl + S` | 立即同步 |
| `Cmd/Ctrl + R` | 重建本地数据库（应用层 §1.5.5 恢复路径） |
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
| 列表项长按 | 操作菜单（关联项目、升级为项目等） |
| 左侧边缘右滑 | 二级页返回 |

### 7.4 视觉规范

- 极简：默认无色彩（仅黑白灰），标签略带强调色（取自 vault config `tagColors` 或自动生成）
- 字体：系统默认（San Francisco / Segoe UI / Noto Sans CJK）
- 主题：跟随系统（亮 / 暗）
- 无图标库依赖，必要图标用 SVG 内联

### 7.5 品牌与视觉资产规范

#### 7.5.1 名称：Loop

Loop 的字面含义是循环、闭环。这个名字同时锚定产品的三层叙事：

1. **方法论**：Loop 对应 GTD 里的 open loop，所有未完成事项都是大脑里的开放循环，产品帮助用户关闭它们
2. **技术**：AI agent 的本质是 loop：感知、推理、行动、再感知。AI native 的 todo app 底层运行的也是 agent loop
3. **哲学**：人生本身由每天、每周、每季度、每年的循环组成。Loop 不是隐喻，而是产品要承载的事实——尤其在引入 Habit 后

#### 7.5.2 Logo 设计理念

Logo 的核心母题是**一个未闭合的圆 + 一个橙点**。

- **圆环**代表循环、系统、轨道
- **缺口**代表尚未完成的 open loop，是产品存在的理由
- **橙点**代表下一步行动（next action），停在缺口起点，等待被推进以闭合循环

产品名 Loop 指向闭合的理想状态，而 logo 呈现未闭合的现实状态。

#### 7.5.3 品牌颜色

| 颜色 | 值 | 用途 |
|---|---|---|
| 近黑 | `#1A1A1A` | 主图形、文字、极简高级感 |
| 珊瑚橙 | `#FF5C39` | 橙点、行动焦点、品牌强调色 |
| 暖白 | `#FAFAF7` | App icon 背景 |

橙点是 logo 中唯一的强色彩，语义上对应当前要推进的下一步行动。

#### 7.5.4 几何规范

- 圆环半径：28
- 描边：10
- 缺口：90°
- 橙点半径：7

#### 7.5.5 资产来源

品牌 SVG 源资产保留在 `/brand` 目录：

- `/brand/loop-icon.svg`
- `/brand/loop-app-icon.svg`
- `/brand/loop-logo-primary.svg`
- `/brand/loop-logo-mono-black.svg`
- `/brand/loop-logo-white.svg`

### 7.6 空状态与错误

- 空 vault：引导文案「写下你的第一件事」
- 无 project：「⋯」菜单不显示项目入口
- 无 habit：「⋯」菜单不显示习惯入口
- 同步失败：顶部黄色提示条，可点击查看详情，不阻塞使用
- AI 调用失败：弹窗提示，可重试
- 数据库损坏：引导「重建本地数据库」

---

## 8. 安全与隐私

### 8.1 数据安全

- 所有数据本地存储，未配置同步时不上传任何信息
- 同步内容仅在用户配置的 WebDAV 服务器
- 不收集遥测、不上报崩溃日志（首版）

### 8.2 密钥管理

- WebDAV 密码、AI API Key 一律存系统密钥库
- 不出现在 config.json、settings.json、op log 或日志中
- 应用卸载时由系统密钥库决定是否保留

### 8.3 AI 隐私

- AI 功能默认关闭，需用户主动开启
- 开启时弹窗提示：「问 AI 操作会将相关数据发送给所选 provider」
- 推荐使用本地 Ollama 选项
- 默认不携带 `_` 前缀系统字段到 AI 上下文

### 8.4 MCP Server 隐私

- MCP server 仅在桌面端启动
- 通过 §1.5.6 路径边界检查，外部 AI 无法越界访问 vault 外文件
- App 设置可一键禁用 MCP server

### 8.5 数据迁移与导出

- 「设置 → 导出」可生成三种格式：markdown 快照 / JSON dump / op log 拷贝
- 用户随时可访问 vault 目录，op log 是纯文本可读
- 不存在「锁定」机制

---

## 9. 验收标准

### 9.1 功能验收

**首次启动**：

- [ ] 无 vault 配置时显示 WelcomeScreen 三选项
- [ ] 创建新 vault 选项创建空 vault 并初始化数据库
- [ ] 打开已有 vault 选项可选目录并从 op log 重建数据库
- [ ] 从 WebDAV 拉取选项完成首次全量下载并重建

**首页**：

- [ ] 输入框创建 todo / log / done / ongoing 四种状态
- [ ] 时间流正确按日期分组、按时间倒序
- [ ] ongoing entry 默认置顶
- [ ] 标签实时高亮且可点击
- [ ] 勾选 todo 变 done，时间记录正确
- [ ] 设置 due 的 todo 到期时触发一次系统通知
- [ ] 完成、删除、清除 due、转 ongoing 后不再触发到期通知
- [ ] 长按/右键操作菜单包含「关联项目」「升级为项目」

**条目详情**：

- [ ] 编辑 content 后正确解析标签
- [ ] 可设置、修改、清除 todo 截止时间
- [ ] 可设置、修改、清除关联 project
- [ ] 元数据区显示基础字段，隐藏 `_` 前缀字段
- [ ] 历史入口可查看该 entry 的所有 update op

**项目**：

- [ ] 项目列表正确显示 active project
- [ ] 已归档项目入口可见且能恢复
- [ ] 项目详情页可编辑 body markdown
- [ ] 项目详情页展示所有关联 entry，可直接创建关联 entry
- [ ] 删除项目不删 entry，但解除关联
- [ ] 「升级 entry 为项目」流程完整可用

**习惯**：

- [ ] 习惯列表显示本周期进度
- [ ] 习惯详情页热力图展示历史达成
- [ ] 修改 schedule 后统计立即更新
- [ ] 暂停后不参与统计，恢复后正常
- [ ] 删除习惯不影响 entry

**搜索**：

- [ ] 支持文本 + 语法（status / date / tag / type / project）
- [ ] 结果分三段展示（entries / projects / habits）

**数据**：

- [ ] 写操作后 op log 正确追加，SQLite 正确更新
- [ ] 「重建本地数据库」从 op log 完全恢复数据
- [ ] 删除 data.db 后启动自动重建
- [ ] op log 是合法 jsonl，可被人和 AI 直接阅读
- [ ] metadata 中的用户字段（如 `priority`）可被读取并通过 MCP 修改

**配置分层**：

- [ ] vault config 通过 op log 同步，换设备一致
- [ ] app settings 不同步：A 设备的 WebDAV 凭据不会跑到 B 设备
- [ ] 密钥不出现在任何配置文件或 op log 中

**同步**：

- [ ] WebDAV 配置正确时双向同步成功
- [ ] 状态机五种状态正确显示
- [ ] 六种触发器都能正常触发同步
- [ ] 两端同时写入同一 entity，按 op 时间序合并不丢数据
- [ ] op log 文件可被任何文本工具打开（人类可读）
- [ ] 离线状态下应用正常使用，恢复网络后自动同步未发 op

**AI**：

- [ ] 「问 AI」能将当前视图作为上下文调用 LLM
- [ ] Prompt 模板增删改正常
- [ ] AI 回答可保存为 entry
- [ ] AI 上下文默认不含 `_` 前缀字段
- [ ] AI 可通过 MCP 创建 / 修改 project 和 habit

**MCP（桌面）**：

- [ ] Claude Desktop 配置后能看到所有 tools（含 project / habit 类）
- [ ] tools 可正确读写数据，操作结果反映到 App UI
- [ ] App 关闭后 MCP server 仍能服务
- [ ] UI 类 tools 在 App 运行时正确触发界面跳转
- [ ] 越界路径请求被拒绝（路径边界检查）

**跨平台**：

- [ ] 同一 vault 在桌面端与移动端能互相同步
- [ ] iOS / Android / 鸿蒙三端 UI 行为一致
- [ ] 中文输入法在所有平台无异常
- [ ] 移动端无 MCP / 全局快捷键入口（不出现"不支持"提示）

### 9.2 不变量验收（§1.5.5）

- [ ] 任何写操作 op 落盘失败时 SQLite 和 UI 状态不被错误更新
- [ ] 乐观更新失败时 UI 正确回滚
- [ ] Cmd+R 重建本地数据库能从异常状态恢复
- [ ] 删除 data.db 后下次启动自动重建，无数据丢失
- [ ] op 应用幂等：同一 op 应用两次结果一致

### 9.3 性能验收

- [ ] 10,000+ entry + 50 projects + 20 habits 时首页打开 < 1s
- [ ] 输入框创建 entry 到落盘（op + SQLite）< 100ms
- [ ] 全文搜索 10,000 entry < 500ms
- [ ] 同步 1000 个 op + 100 个文件 < 10s（不计网络）
- [ ] 从 op log 重建 10,000 entries 的 SQLite < 5s

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
| Vault | 数据根目录，包含 SQLite、op log、附件、导出快照 |
| Entry | 数据原子，四种状态：todo / done / log / ongoing |
| Project | 长期目标实体，承载 markdown 笔记和关联 entry |
| Habit | 持续性习惯实体，按 schedule 自动统计 entry |
| Tag | 内联在 content 中的 `#xxx` 标签，可被三种实体共享 |
| ULID | 时间有序的 26 字符 ID |
| Op | Operation，对 vault 数据的一次原子变更，记录在 op log 中 |
| Op Log | 所有 op 的有序持久化记录，是同步真实来源 |
| WebDAV | 用户自备的同步服务（如坚果云、NextCloud） |
| MCP | Model Context Protocol，AI 工具的标准协议 |
| Vault Config | 跟随同步的偏好（vault 内 config.json，通过 op log 同步） |
| App Settings | 仅本机的偏好和凭据引用 |
| 系统字段 | 以 `_` 开头的 metadata 字段，UI 默认隐藏 |
| LWW | Last-Write-Wins，按 op 时间序最后一次胜出 |

### 10.2 参考样例数据

**`<vault-root>/ops/2026/05/2026-05-18.jsonl`**：

```jsonl
{"id":"01HXYZABCD1234567890ABCDE1","device_id":"laptop-a1","schema_version":1,"at":"2026-05-18T08:30:00Z","kind":"entry.create","payload":{"id":"01HXYZABCD1234567890ENTRY1","content":"跑步 5km","status":"log","date":"2026-05-18","tags":["健康"],"metadata":{}}}
{"id":"01HXYZABCD1234567890ABCDE2","device_id":"laptop-a1","schema_version":1,"at":"2026-05-18T09:00:00Z","kind":"entry.create","payload":{"id":"01HXYZABCD1234567890ENTRY2","content":"准备周三的产品评审材料","status":"todo","date":"2026-05-18","tags":["工作"],"metadata":{"due":"2026-05-20T17:00:00Z"}}}
{"id":"01HXYZABCD1234567890ABCDE3","device_id":"phone-b2","schema_version":1,"at":"2026-05-18T10:15:00Z","kind":"project.create","payload":{"id":"01HXYZABCD1234567890PROJ01","name":"研究 AI 视频带货","slug":"ai-video-commerce","body":"# 目标\n搞清楚 AI 视频带货的工作流","tags":["工作","AI"]}}
{"id":"01HXYZABCD1234567890ABCDE4","device_id":"phone-b2","schema_version":1,"at":"2026-05-18T10:16:00Z","kind":"entry.create","payload":{"id":"01HXYZABCD1234567890ENTRY3","content":"看了 5 个 AI 视频带货头部账号","status":"log","date":"2026-05-18","project_id":"01HXYZABCD1234567890PROJ01","tags":["AI"]}}
{"id":"01HXYZABCD1234567890ABCDE5","device_id":"phone-b2","schema_version":1,"at":"2026-05-18T11:00:00Z","kind":"habit.create","payload":{"id":"01HXYZABCD1234567890HABIT1","name":"游泳","slug":"swimming","body":"心肺、肩颈、放松","schedule":{"period":"week","target_min":3,"target_max":4,"match":{"tag":"游泳"}}}}
{"id":"01HXYZABCD1234567890ABCDE6","device_id":"laptop-a1","schema_version":1,"at":"2026-05-18T20:00:00Z","kind":"entry.create","payload":{"id":"01HXYZABCD1234567890ENTRY4","content":"游泳 1.2km 蛙泳","status":"log","date":"2026-05-18","tags":["游泳"]}}
```

应用上述 op 后 SQLite 状态：

- entries 表：4 条记录
- projects 表：1 条（ai-video-commerce）
- habits 表：1 条（swimming）
- 习惯 swimming 本周期进度：1/3-4

### 10.3 解析与应用测试用例（最小集）

| 输入 | 期望行为 |
|---|---|
| 单条 `entry.create` op | entries 表插入 1 行，entry_tags 表插入对应 tag |
| 同 entry id 的 `entry.update` op | entries 表对应行更新对应字段，updated_at 设为 op.at |
| `entry.update` 在 `entry.delete` 之后 | 跳过 update，不报错 |
| 同一 op 被应用两次 | 第二次基于 applied_ops 判重跳过 |
| `entry.create` 携带未知字段 | 已知字段正常写入，未知字段进入 metadata |
| `habit.update` 改 schedule.target_max | 已有进度统计立即按新 target 计算 |
| `project.delete` op | projects 表行删除，相关 entries.project_id 设为 NULL |
| 损坏的 jsonl 行 | 跳过该行，记录解析错误，不影响其他 op |

### 10.4 开发参考资料

- ULID 规范：https://github.com/ulid/spec
- WebDAV 协议：RFC 4918
- MCP 协议：https://modelcontextprotocol.io
- Tauri 2 文档：https://tauri.app
- react-native-harmony：https://gitee.com/openharmony-sig/ohos_react_native
- react-native-quick-sqlite：https://github.com/margelo/react-native-quick-sqlite
- SQLite WAL 模式：https://www.sqlite.org/wal.html

---

## 11. 决策记录（ADR）

每条 ADR 记录一个关键技术/产品决策，及其考虑过的替代方案。Claude Code 实施时如遇与下列决策冲突的设计选择，必须明确升级请求而非自行偏离。

### ADR-001：桌面端用 Tauri 2，不用 Electron

- **决策**：桌面端使用 Tauri 2
- **理由**：体积小、启动快、Rust 后端处理 IO 性能好；前端仍可用 React
- **替代**：Electron（包体大、内存高）

### ADR-002：移动端用 React Native，不用 Flutter / 原生

- **决策**：移动端使用 React Native，含 `react-native-harmony` 适配鸿蒙
- **理由**：唯一能一套代码覆盖 iOS + Android + 鸿蒙的成熟方案；可与桌面端共享 `core` 包逻辑
- **替代**：
  - Flutter——鸿蒙支持不成熟，与桌面端无法共享逻辑
  - 三套原生——开发成本高

### ADR-003：桌面与移动用两套 UI 代码，共享 `core`

- **决策**：UI 代码不强制复用，仅复用 `core` 包的业务逻辑
- **理由**：UI 复用价值不如数据契约复用；强行用 RN 写桌面端会牺牲桌面体验
- **替代**：纯 RN 全平台——桌面 RN 体验不如 Tauri + React

### ADR-004：同步走 WebDAV，不走 Git

- **决策**：同步唯一方案是 WebDAV
- **理由**：用户自备的成熟服务覆盖最广；交互成本低于 Git
- **替代**：
  - Git——冲突合并不适合小白；需要 git 工具链
  - 自有云——违背"无服务端依赖"原则

### ADR-005（反转）：数据用 SQLite + Op Log，不用 Markdown

- **决策**：本地存储用 SQLite（查询权威），同步存储用 op log（同步权威）
- **背景**：v1.x 选 markdown 是出于 Obsidian 兼容和数据归属感。重新评估发现用户实际不打开 Obsidian，且引入 Project / Habit 后 markdown 跨文件关联和聚合统计代价急剧上升
- **理由**：
  - SQLite 让复杂查询、关联完整性、聚合统计简单高效
  - Op log 保留"按时间分文件、文本可读、AI 友好"的优势，承担同步与历史责任
  - Markdown 兼容性以「按需导出快照」方式保留
- **替代**：
  - 保持 markdown——表达 Project / Habit 别扭，统计低效
  - 纯 SQLite + binary 同步——SQLite 不能按行合并，多端并发写丢数据
  - Markdown 主存 + SQLite 索引（v1.x 方案）——双写复杂度高且 Obsidian 价值用户用不到

### ADR-006：ID 用 ULID，不用 UUID v4 / 自增

- **决策**：ULID（时间有序的 26 字符 ID）
- **理由**：时间有序便于排序；多设备同时生成几乎不冲突
- **替代**：UUID v4 非时间有序；自增 ID 多设备冲突

### ADR-007：MCP server 独立进程，不内嵌于 App

- **决策**：MCP server 作为独立 Node.js 进程；与 App 共享 SQLite 数据库（WAL 模式）和 op log；App 关闭不杀死 MCP
- **理由**：让 Claude Desktop 等外部 AI 工具随时可访问 vault；WebSocket UI 桥让 App 运行时 AI 操作能反映到 UI
- **替代**：
  - 内嵌 Tauri 主进程——App 关闭即不可用
  - 纯 Rust 实现——需维护两份 SQLite 访问逻辑

### ADR-008：通过 Op Log 实现同步与历史

- **决策**：所有数据变更通过 op log 表达；同步只同步 op log；本地 SQLite 是 op log 的派生
- **理由**：
  - Op log 是 append-only，避免 SQLite binary 文件无法 merge 的问题
  - LWW 按 op ULID 时间序自动解决冲突
  - 提供天然的历史追溯能力（详情页可查 entity 变更历史）
  - AI 完全可读 jsonl
- **替代**：
  - 整 SQLite 文件同步——无法多端合并
  - cr-sqlite（CRDT）——依赖原生扩展，跨平台一致性风险（特别是鸿蒙）
  - 应用层 entry-level 合并（v1.x markdown 方案）——只能处理 entry，不适合 project / habit 这类复杂实体

### ADR-009：配置分层为 vault config 与 app settings

- **决策**：跨设备一致的偏好放 vault 内 `config.json`（通过 op log 同步）；机器特定/凭据相关放 app settings（不同步）
- **理由**：避免 WebDAV 凭据通过 WebDAV 自身被同步；用户换设备打开同 vault 期望偏好一致
- **替代**：全部放 vault——凭据同步是隐私问题；全部放本地——UI 偏好换设备丢失

### ADR-010：系统字段用 `_` 前缀约定

- **决策**：metadata 中 `_xxx` 字段 UI 默认不显示
- **理由**：用纯约定替代代码硬编码字段列表；让用户字段和系统字段在同一格式内共存
- **替代**：分两个 metadata 字段——破坏简洁性

### ADR-011：规则克制——拒绝功能重叠和语义冲突的新规则

- **决策**：任何新增的输入语法、交互规则、命令前缀、UI 控件、实体类型，必须经过价值非冗余 + 协调一致双重检查
- **理由**：极简产品的复杂度增长是隐性的；明确的检查标准比"是否极简"的主观判断更可靠
- **实际拒绝过的设计**：
  - `#key:value` 通用语法（功能与 `@time`、`!priority` 重叠）
  - `/project` 项目前缀（与 `/log` `/done` 命令前缀语义冲突）
  - 输入框右侧字段按钮（暗示用户应主动加字段，破坏极简定位）
  - AI 实时解析输入（工程不可行：依赖云端、延迟、离线失效）

### ADR-012：引入 Entry / Project / Habit 三种实体，而非单一 Entry 扩展

- **决策**：在 Entry 之上新增 Project 和 Habit 两种独立实体，Entry 同时新增 `ongoing` 状态
- **背景**：用户痛点是「目标无法打勾」和「持续性习惯无法表达」。讨论了三种方案
- **选择**：三种实体并存，因为：
  - Project 和 Habit 在终态、周期、调整频率上和 Entry 本质不同（详见 §2 三表）
  - 强行用 Entry 状态扩展模拟两者会失去「承载推进过程」和「自动统计」能力
  - 三种实体仍通过 tag 共享分类维度，UI 上按需出现入口，不破坏极简
- **替代**：
  - 只加 `ongoing` 状态——能解决「打勾问题」但无法承载项目笔记和习惯统计
  - 引入通用「实体笔记」（Tolaria 式）——过于通用，UI 难做差异化
  - 不做——用户痛点持续存在

### ADR-013：Habit 不在 entries 表加外键，通过 schedule.match 动态匹配

- **决策**：habits 表存定义和匹配规则；统计时按 `schedule.match` 动态查询 entries
- **理由**：
  - 用户记 entry 时不必"想到 habit"，写 entry 是流畅的
  - 修改 habit 定义（如改匹配 tag）立即重算历史，无须迁移数据
  - 多个 habit 可以匹配同一 entry，无须多对多关系
- **替代**：
  - 加 `entries.habit_id`——用户必须显式关联，体验差
  - 多对多关联表——维护成本高

### ADR-014：Vault 文件夹保留概念，装 SQLite + op log + 附件 + 快照

- **决策**：vault 仍是用户可见的文件夹，只是里面装的不再是 markdown，而是 SQLite、op log、附件、导出快照
- **理由**：
  - WebDAV 同步一个文件夹更直白
  - 附件、导出快照需要落地位置
  - 保留多 vault 并存可能
  - 用户仍能用文件管理器看到自己的 vault
- **替代**：
  - 放弃 vault 概念，数据在 app 内部目录——"数据归用户所有"的实感变弱
  - 多个零散文件——用户难管理

---

**文档结束**
