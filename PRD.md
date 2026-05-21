# 个人 GTD App — 产品需求文档（PRD）

> 本文档是产品需求说明，描述「做什么」与「为什么这么做」。  
> 不涉及开发计划、阶段划分、估时等执行层内容。

---

## 0. 文档元信息

| 项 | 值 |
|---|---|
| 文档版本 | v1.0 |
| 状态 | Final, 可交付开发 |
| 适用对象 | Claude Code（实施方） |
| 产品类型 | 个人单用户工具，本地优先，跨平台 |

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
- ❌ 提醒、通知、重复任务（首版不做）
- ❌ 自有云服务、账号系统
- ❌ 浏览器插件、Web 版

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
| `metadata` | object | 时间戳、扩展字段 |

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
                            └─ 二级页：关于
```

### 3.2 导航规则

- 所有二级页通过 push 进入，左上角返回（或手势返回）
- 二级页之间不可横向跳转，必须返回首页或上一级
- 设置内部允许多层 push（设置 → 同步配置）

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
- 显示元数据（折叠，默认隐藏）
- 删除按钮（带二次确认）
- 标签可点击 → 跳到标签视图

### 4.3 二级页：标签视图

- 顶部展示标签名 + 该标签下 entry 总数
- 列表样式同首页时间流，仅过滤为该标签
- 顶部 toggle：「全部 / 仅未完成 / 仅已完成」

### 4.4 二级页：搜索

- 顶部搜索框，实时搜索
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
- 自动同步开关（默认开，启动时 + 创建/修改 entry 后 30s 防抖）
- 冲突列表入口（如有冲突文件）

#### 4.5.2 AI 配置

- Provider 选择：Anthropic / OpenAI / Ollama / 自定义 endpoint
- API Key 输入（存密钥库）
- Model 选择（按 provider 动态加载或预设列表）
- 「测试」按钮：发一条 "hello" 验证
- AI 功能总开关（默认关，需主动开启）

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

桌面端自带 MCP server，可通过 Claude Desktop 等支持 MCP 的客户端访问。

暴露的 tools：

| Tool | 输入 | 输出 |
|---|---|---|
| `list_entries` | `date?`, `tag?`, `status?` | `Entry[]` |
| `create_entry` | `content`, `status?` | `Entry` |
| `complete_entry` | `id` | `Entry` |
| `update_entry` | `id`, `content?` | `Entry` |
| `delete_entry` | `id` | `void` |
| `search_entries` | `query`, `limit?` | `Entry[]` |
| `get_recent_logs` | `days?` | `Entry[]` |

MCP server 独立于 app 运行，app 关闭时仍可访问数据。

### 4.7 同步功能

详见 §6.4。

---

## 5. 平台与技术约束

### 5.1 支持平台

| 平台 | 技术栈 |
|---|---|
| Windows / macOS / Linux | Tauri 2 + React + TypeScript |
| iOS / Android / HarmonyOS | React Native + react-native-harmony |

### 5.2 共享代码层

- 一个 `core` 包（纯 TypeScript），实现数据模型、Markdown 解析、同步逻辑、AI 调用
- 桌面与移动端共用 `core`，仅 UI 与平台 API 适配层独立
- MCP server 独立二进制（Rust 实现，复用同一数据格式）

### 5.3 平台特定 API 抽象

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

### 5.4 不做的技术选择

- ❌ SQLite 或任何二进制数据库
- ❌ 自有云服务、自有账号系统
- ❌ 服务端代码
- ❌ Electron（用 Tauri）
- ❌ Expo（裸 RN，因为鸿蒙）

---

## 6. 数据规范

### 6.1 文件组织

```
<vault-root>/
  config.json
  2026/
    05/
      2026-05-18.md
      2026-05-17.md
    04/
      ...
  .conflicts/
    2026-05-18.md.conflict-20260518T1023Z
```

- 每天一个 `.md` 文件，路径 `YYYY/MM/YYYY-MM-DD.md`
- 配置存于根目录 `config.json`
- 冲突备份存于 `.conflicts/`，不同步到远端

**为什么按月分目录**：部分 WebDAV 服务对单目录文件数有性能限制，月级分目录将单目录文件数控制在 31 以内。

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
content    ::= <any text, may contain spaces and #tags>
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

#### Metadata JSON Schema

```typescript
{
  done?: string         // ISO 8601；仅 done 必填
  log?: string          // ISO 8601；仅 log 必填
  updated: string       // ISO 8601；所有 entry 必填，用于冲突解决
  priority?: number     // 0-9，可选
  ai_summary?: string   // AI 生成的摘要，可选
  custom?: object       // 扩展字段
}
```

#### 边缘情况

| 情况 | 处理 |
|---|---|
| content 内含 `#` 但不是 tag（如 `#1 priority`） | tag 必须前接空格或行首 |
| content 多行 | 用 `\n` 字面量（不换行成多行 markdown）|
| content 内含 `^` | tag 后的 `^` 才识别为 ID |
| 无 ID 的旧数据 | 解析时自动补 ID（基于行号 + 文件 mtime）|
| metadata JSON 损坏 | 当作无 metadata，content 不丢 |
| 文件无 frontmatter | 容错读取，写回时补全 |

### 6.3 ID 规范

- 使用 ULID（Crockford Base32 编码的 UUID v7）
- 26 字符，时间有序，可读
- 字符集：`0-9, A-H, J-K, M, N, P-T, V-Z`（排除易混 I/L/O/U）
- 示例：`01HXYZABCD1234567890ABCDEF`

### 6.4 同步规则

#### 6.4.1 触发时机

- App 启动时
- 创建/修改/删除 entry 后 30s 防抖
- 用户手动触发

#### 6.4.2 同步流程

```
1. 列出本地所有 .md 文件 + .config.json
2. 列出远端所有同类文件
3. 对比每个文件路径：
   - 仅本地有 → push
   - 仅远端有 → pull
   - 双方都有：
     a. 比较 frontmatter.updatedAt
     b. 若相同 → 跳过
     c. 若不同 → 执行 entry-level 合并（见 6.4.3）
4. 更新本地 / 远端
5. 写同步日志到内存（供 UI 显示）
```

#### 6.4.3 Entry-Level 合并

```
解析双方为 Entry[]
对所有 id ∈ local.ids ∪ remote.ids:
  case 仅本地       → 保留本地
  case 仅远端       → 保留远端
  case 内容相同     → 保留任一
  case updated 不同 → 保留 updated 较新者
  case updated 相同但内容不同（真冲突，极少）：
    保留本地
    将远端版本备份到 .conflicts/
    标记 entry.metadata.custom.conflict = true（UI 显示警告）
```

#### 6.4.4 删除处理

物理删除会导致同步歧义（A 端删除 vs B 端尚未拉到），首版策略：

- 删除时不立即从文件移除，先打 tombstone：在该 entry 行末尾追加 `<!-- {"deleted":"<ISO>","updated":"<ISO>"} -->`
- 同步合并时，`deleted` 字段 newer 的版本胜出
- 30 天后清理 tombstone（物理删除行）

#### 6.4.5 冲突 UI

- 同步结果含 conflict 时，首页顶部出现一条提示条
- 点击进入冲突列表二级页，逐条解决（接受本地 / 接受远端 / 都保留）

### 6.5 Config 文件

```json
{
  "version": 1,
  "sync": {
    "webdav": {
      "url": "https://dav.jianguoyun.com/dav/todo-app/",
      "username": "user@example.com",
      "passwordRef": "keychain://todo-app/webdav"
    },
    "autoSync": true
  },
  "ai": {
    "enabled": false,
    "provider": "anthropic",
    "model": "claude-opus-4-7",
    "apiKeyRef": "keychain://todo-app/anthropic-key",
    "endpoint": null,
    "promptTemplates": [
      {
        "id": "summary-week",
        "name": "总结这周",
        "prompt": "请总结我这周的活动和待办..."
      }
    ]
  },
  "ui": {
    "theme": "auto",
    "language": "zh-CN"
  }
}
```

**密钥引用**：所有敏感字段用 `keychain://<service>/<key>` 引用，实际值存在各端系统密钥库。

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

- 极简：默认无色彩（仅黑白灰），标签略带强调色
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
- 不出现在 config.json 或日志中
- 应用卸载时由系统密钥库决定是否保留

### 8.3 AI 隐私

- AI 功能默认关闭，需用户主动开启
- 提示用户：开启 AI 后，「问 AI」操作会将相关 entries 发送给所选 provider
- 推荐使用本地 Ollama 选项

### 8.4 数据迁移与导出

- 「设置 → 关于 → 导出」：打包整个 vault 为 zip
- 用户可随时直接访问 vault 目录，用任何工具操作
- 不存在「锁定」机制

---

## 9. 验收标准

### 9.1 功能验收

**首页**：
- [ ] 输入框创建 todo / log / done 三种状态
- [ ] 时间流正确按日期分组、按时间倒序
- [ ] 标签实时高亮且可点击
- [ ] 勾选 todo 变 done，时间记录正确
- [ ] 长按/右键操作菜单完整
- [ ] 滚动加载更早条目流畅

**二级页**：
- [ ] 详情页编辑 content 后正确解析标签
- [ ] 标签视图按选择的标签过滤正确
- [ ] 搜索支持文本 + 语法（status / date / tag）
- [ ] 设置项修改后立即生效

**数据**：
- [ ] 创建/修改/删除 entry 后文件内容符合 §6.2 规范
- [ ] 文件可被 Obsidian 打开且基本可读
- [ ] 解析非法格式不崩溃，原文件保留

**同步**：
- [ ] WebDAV 配置正确时双向同步成功
- [ ] 两端同时修改同一文件，按 entry-level 合并不丢数据
- [ ] 真冲突场景产生 `.conflicts/` 备份并 UI 提示
- [ ] 离线状态下应用正常使用，恢复网络后自动同步

**AI**：
- [ ] 「问 AI」能将当前视图作为上下文调用 LLM
- [ ] Prompt 模板增删改正常
- [ ] AI 回答可保存为 entry

**MCP（桌面）**：
- [ ] Claude Desktop 配置后能看到所有 tools
- [ ] tools 可正确读写 vault，操作结果反映到 app UI

**跨平台**：
- [ ] 同一 vault 在桌面端与移动端能互相同步
- [ ] iOS / Android / 鸿蒙三端 UI 行为一致
- [ ] 中文输入法在所有平台无异常

### 9.2 性能验收

- [ ] vault 含 10,000+ entry 时首页打开 < 1s
- [ ] 输入框创建 entry 到落盘 < 100ms
- [ ] 全文搜索 10,000 entry < 500ms
- [ ] 同步 100 个文件 < 10s（不计网络）

### 9.3 体验验收

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
| 无 frontmatter 的文件 | 容错读取，date 从文件名推断 |

### 10.4 开发参考资料

- ULID 规范：https://github.com/ulid/spec
- WebDAV 协议：RFC 4918
- MCP 协议：https://modelcontextprotocol.io
- Tauri 2 文档：https://tauri.app
- react-native-harmony：https://gitee.com/openharmony-sig/ohos_react_native

---

**文档结束**
