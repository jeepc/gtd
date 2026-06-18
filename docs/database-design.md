# Database 能力设计说明 v2.0

> 本文档解释三件事：
> 1. Notion 的 database 是怎么实现的（理解原型）
> 2. Loop 如何在 SQLite + op log 体系下提供类似能力（不破坏极简定位）
> 3. 在「规则克制」原则下，演进路径上能加什么、不能加什么
>
> 不涉及技术规范、存储格式、API 设计——那些在 PRD 主文档里。

## v2.0 相对 v1.x 的主要变化

v2.0 跟随 PRD v2.0 的存储引擎重构，做出对应调整：

- **存储模型升级**：从「Markdown 文件 + 索引缓存」改为「SQLite + op log」。本文不再围绕"如何用 Markdown 表达 database"展开
- **Project 和 Habit 已从 Phase 4「可选」提前到 MVP 引入**（PRD v2.0 §2.2、§2.3）
- **演进路径重新分层**：v1.1 的四层 Level 调整为更贴合 SQLite 时代的演进步骤
- **新增「为什么从 Markdown 切到 SQLite」专章**（§3），保留 v1.1 中的取舍记录
- **AI 角色重新描述**：从「在 markdown 上做事后整理」改为「在结构化数据上做查询、补字段、生成视图」

---

## 1. 为什么要谈 database

Loop 工具用着用着，用户会自然产生需求：

- 「我想看本周所有 `#工作` 标签且未完成的事」
- 「这件事属于 Q3 评审项目，那个项目下还有哪些事？」
- 「按截止日期排序我所有的未完成 todo」
- 「这件事的优先级是 P1，那件是 P3」
- 「我每周游泳次数达标了吗？」

这些都不是简单"加个标签"能解决的——它们需要**结构化字段**和**结构化查询**。这正是 Notion database 的能力范畴。

但 Notion 把这件事做得很重：要先建数据库、定义字段、配置视图，用户从"输入一行字"变成"先设计表结构"。这与 Loop 的极简定位冲突。

所以问题不是"做不做 database"，而是**"如何在不破坏纯净交互的前提下，得到 database 的核心价值"**。

---

## 2. Notion 是怎么实现 database 的

理解 Notion 的设计是设计自己方案的前提。Notion 的 database **不是一张表**，它是「block + property + view」三件套。

### 2.1 一切皆 block

Notion 里所有东西都是同一种对象——block。段落、标题、图片、待办、整个页面、database 里的一行、整个 database 本身，**底层都是 block**。

每个 block 有：

- 唯一 ID（UUID）
- 类型（text / heading / database_row / page …）
- 内容字段（按类型不同）
- 元数据（时间戳、作者、权限）
- 与其他 block 的关系（父子、引用）

这个抽象让 Notion 可以把"一段文字"和"数据库的一行"用同一套机制处理。

### 2.2 Database 是一种特殊的 page block

Notion 的 database 不是关系型表。它是一个**容器 block**，里面装着许多 row block。

- Database block 本身：定义 schema（有哪些字段、字段类型、选项等）
- 每个 row：**也是一个 page block**，继承所属 database 的 schema，在自己的 properties 字段里填值
- 点开一行 → 进入一个完整的 page，可以写正文、嵌入其他 block

**关键洞察**：Notion 里"数据库的行"和"独立页面"在底层是同一个东西。

### 2.3 Property 是结构化字段

Database block 上挂着一组 property 定义：

```
{ name: 'status', type: 'select', options: ['Todo', 'Doing', 'Done'] }
{ name: 'priority', type: 'number' }
{ name: 'due', type: 'date' }
{ name: 'project', type: 'relation', target: <project_db_id> }
```

每个 row（page）在自己的 properties 字段里按这个 schema 填值。

### 2.4 View 是 schema 之上的查询

同一组 row 可以有多个 view：

- Table view（表格）
- Board view（看板，按某字段分组）
- Calendar view（日历，按日期字段）
- Gallery view（卡片）
- Timeline view（甘特图）

view **不存数据**，只存「filter + sort + group_by + 显示哪些字段」的配置。

### 2.5 为什么 Notion 不用 Markdown

Notion 用自定义 JSON 表示富文本，不用 Markdown。原因：Markdown 表达不了 Notion 的 callout、彩色文字、synced block、column layout 等特殊 block 类型，也表达不了 database 的 schema 和 view 配置。

这是 Notion 选择"功能丰富度 vs 互操作性"时倒向前者的代价——你的数据被锁在 Notion 里。

### 2.6 一句话总结 Notion 的 database

> **Database = 一组共享 schema 的 page block 集合 + 多个 view 定义**

---

## 3. 为什么 Loop 从 Markdown 切到 SQLite

v1.x 选 Markdown 是因为它有几个看起来很重要的优势：Obsidian 兼容、AI 直接可读、跨工具迁移、用户可直接打开文件。

引入 Project / Habit 等复杂模型后，重新评估这些优势：

| Markdown 优势 | v2.0 重新评估 |
|---|---|
| Obsidian 兼容 | 用户实际不用 |
| 用户可直接看文件 | 用户不需要 |
| 跨工具迁移 | 程序导出 markdown 快照即可 |
| AI 可读 | JSON 比 markdown 更易被 AI 处理 |
| WebDAV 同步按行 merge | op log 仍按行追加，依然适合 WebDAV |

Markdown 的真实价值在 Loop 场景下接近 0，而它的代价在引入 Project / Habit 后急剧上升：

- 跨文件关联：删除 project 要扫所有日 entry 文件找引用
- Habit 统计：扫所有日文件、解析 metadata、按 tag 匹配、按周期聚合
- Schema 演化：要修改字段需要 grep 全 vault
- 一致性：用户用 Obsidian 直接改了文件后，索引重建是噩梦

切到 SQLite + op log 后：

- 跨实体关联：外键 + JOIN，毫秒级
- 统计聚合：一句 SQL
- Schema 演化：alter table
- 一致性：op log 是唯一权威，SQLite 是派生

"数据归用户所有"的承诺通过**按需导出 markdown 快照**继续兑现。用户随时可以一键把 vault 导出为 markdown，丢进 Obsidian 阅读。

详见 PRD v2.0 ADR-005（反转）和 ADR-008（op log 同步）。

---

## 4. Loop 的方案：三种实体 + 渐进结构化能力

### 4.1 已经在 MVP 里的（v2.0 起即有）

| 能力 | 对应 Notion |
|---|---|
| Entry 实体（todo / done / log / ongoing） | row block |
| Project 实体（含 body markdown + 关联 entry） | 一种 database |
| Habit 实体（含 schedule 统计规则） | 一种带聚合视图的 database |
| Tag 跨实体共享 | multi-select property |
| Entry 关联 Project（外键） | relation property |
| metadata JSON 字段（开放 key-value） | property（但无 schema） |
| MCP 暴露 `set_entry_property` 等工具 | API |

**关键观察**：MVP 引入的不是「完整 database」，而是「三种预定义的实体」。三种实体已经覆盖了用户多数场景，不需要用户自己定义新实体——这正是「不强制 schema」的体现。

### 4.2 暂未引入的能力（按用户信号触发演进）

| Level | 能力 | 对应 Notion | 触发条件 |
|---|---|---|---|
| 1 | 输入语法 `@time` `!priority` | property 的快捷输入 | 用户抱怨"加 due 太繁琐" |
| 2 | 视图（保存的查询） | view | 用户重复用同一查询 |
| 3 | 自定义实体类型 | 创建新 database | 用户需要 entry/project/habit 之外的对象 |

这些都不在 v2.0 MVP 范围，但都通过**SQLite schema 的字段开放性 + op log 的格式演化能力**留好了扩展空间。

---

### 4.3 Level 1：极少量协调一致的输入语法

#### 是什么

引入两条新的输入语法，加上一个输入辅助工具栏。**总共增加 2 条规则**。

| 维度 | 符号 | 例子 | 含义 |
|---|---|---|---|
| 时间/截止 | `@` | `@周三` `@5/25` `@明早7点` | metadata.due |
| 优先级 | `!` `!!` `!!!` | `准备评审 !!` | metadata.priority = 1/2/3 |

合并 MVP 已有规则后，输入框总规则数为 **6 条**：

1. `#tag` 标签（已有）
2. 行首 `/log` 命令（已有）
3. 行首 `/done` 命令（已有）
4. 行首 `/ongoing` 命令（已有，v2.0 新增）
5. `@time` 截止（新增）
6. 行尾 `!`/`!!`/`!!!` 优先级（新增）

#### 规则克制原则的验证

按 PRD §1.5.7，每条新规则要过两道检查：

**`@time` 规则**：

- 价值非冗余：截止日期是 GTD 核心维度，无其他规则可承担
- 协调一致：`@` 在中文文本中极少出现；行中任意位置识别；不与 `#` `/` `!` 冲突

**`!`/`!!`/`!!!` 规则**：

- 价值非冗余：优先级是 GTD 第二维度
- 协调一致：**仅在行尾识别**（避免和中文感叹句"快去做!"冲突）

#### 自然语言时间解析（本地实现，无 AI）

`@` 后跟的时间表达式用本地 JS 库（chrono-node 或类似）解析，**完全离线**：

```
@明天       → 2026-05-23
@周三       → 本周或下周三的具体日期
@5/25       → 2026-05-25
@5/25 9点   → 2026-05-25T09:00
@明早7点    → 2026-05-23T07:00
```

**解析失败时**：字段值就是字符串 `"xxxx"`，保留意图、不阻塞、不弹错。详情页可手动调整。

#### 输入辅助工具栏

为解决中文输入法切换 `@` `!` 等符号的摩擦，输入框聚焦时上方出现一个紧凑工具栏：

```
┌──────────────────────────┐
│  #    @    !             │
├──────────────────────────┤
│  准备评审 #工作 @周三      │
└──────────────────────────┘
```

- 这不是新规则，是已有规则的辅助输入
- 点击符号 → 在光标位置插入字符
- 桌面端可在设置中关闭
- 移动端默认显示

#### 曾被拒绝的设计

| 方案 | 拒绝理由 |
|---|---|
| `#key:value` 通用语法 | 与 `@`/`!` 功能重叠；视觉噪音 |
| `/project` 项目前缀 | 与 `/log` `/done` `/ongoing` 命令前缀语义冲突 |
| 输入框右侧 `+` 字段按钮 | 暗示用户应主动加字段，破坏极简定位 |
| AI 实时解析输入 | 依赖云端、延迟、离线失效 |

---

### 4.4 Level 2：视图（保存的查询）+ AI 即时查询

#### 是什么

把"按某些条件过滤、排序、分组"的查询保存下来。Loop 有**两条并存路径**实现：

**路径 A：视图（数据库行 / op log）**

视图存储为 SQLite 中的一行 `views` 记录，通过 op log 同步：

```json
{
  "id": "01HX...",
  "name": "本周 P1",
  "filter": {
    "type": "entry",
    "status": ["todo", "ongoing"],
    "priority": 1,
    "due_between": ["this_week_start", "this_week_end"]
  },
  "sort": [["due", "asc"]],
  "group_by": null
}
```

UI 上：

- 首页右上角「⋯」→「视图」，列出所有视图
- 点视图进入二级页，按 filter / sort / group 渲染数据
- 在标签视图、搜索结果页右上角"另存为视图"
- 预置视图：「今天」「本周」「未完成 P1」「最近完成」「待整理为 project 的 ongoing」

**路径 B：AI 即时查询**

用户在「问 AI」入口直接说：

> "本周需要推动的 P1 项目"
> "我上个月在健身上花了多少时间？"
> "我手头的 ongoing 哪些应该升级为 project？"

AI 通过 MCP 调用 `query_entries` 等工具，把结果以时间流形式展示，不需要预先创建视图。

#### 为什么两条路径并存

- **路径 A 适合反复使用的视图**：每天都看的「今天」「本周」，保存为视图避免重复筛选
- **路径 B 适合一次性查询**：临时想看的、复杂的、用自然语言更舒服的

#### 视图的种类

只支持一种渲染模式——**时间流列表**或**实体列表**。

明确**不做**：

- Board view（看板拖拽）——违背"极简"
- Calendar view（日历）——首版不做提醒
- Gallery view（卡片）——entry 不适合卡片

#### 演进推论

如果 AI 能力进一步提升，路径 B 可能取代路径 A 中的大部分场景——用户直接说话即可，根本不需要"视图列表"页面。

Level 2 实施顺序：

1. 先做 SQL 查询引擎 + MCP tool（路径 B 可用）
2. 再做视图保存 + UI 列表（路径 A 可用）
3. 视图编辑器 UI 后做或不做

---

### 4.5 Level 3：自定义实体类型（可选）

#### 是什么

到目前为止，Loop 有三种预定义实体：Entry / Project / Habit。所有用户场景都尝试用这三种表达。但极少数用户可能确实需要更多实体类型，比如：

- 「人物」：客户档案、联系人
- 「资源」：书籍、文章、收藏
- 「领域 / Area」：相对长期的关注面，比 project 更大

#### 触发条件

只有当用户大量出现"用 tag 模拟某种实体"且抱怨「tag 不够用」时，才进入 Level 3。否则不做。

#### 实现思路

借鉴 Tolaria 经验：

- 用户在 SQLite 中创建一种新实体类型（`entity_types` 表）
- 实体类型有自己的 markdown 模板和 schema
- 实例（具体的人物 / 资源）存在 `entities` 表
- Entry 可关联到任意实体类型的实例

但这一步是真正的"用户配置 schema"，违背了 Loop 一直以来的"不强制 schema"原则。**必须等到用户痛点足够明确才做**。

---

### 4.6 不会做的方向

明确**不会**演进到的方向：

| 方向 | 理由 |
|---|---|
| Notion 式的完整 database UI | 违背"输入一行字就上手"的极简定位 |
| Schema 配置面板 | 用户需自己设计字段类型——回到 Notion 的入门门槛 |
| 富文本编辑器 | Entry content 是单行短文本；project body 用基础 markdown 足够 |
| 跨 database 的复杂关系图 | 单用户工具不需要 Roam Research 式的双向链接图谱 |

---

## 5. AI 在 Loop 中的角色

AI 不是 Loop 的辅助工具，而是**让 database 在极简 UI 下可用的核心**。

### 5.1 AI 的合适场景

| AI 适合做 | AI 不适合做 |
|---|---|
| 事后整理：把这周所有 ongoing 按 project 归类 | 实时解析单条输入（延迟、离线、隐私问题） |
| 批量打标：给这 50 条未完成的事打优先级 | 用户打字时浮 chip 提示 |
| 提取关键事件：从这周 log 中找重要进展 | 输入框自动补全 |
| 字段规范化：整理散乱的 metadata 字段名 | 单条 entry 的字段识别 |
| 即时查询：本周 P1 有哪些？ | 替代核心输入路径 |
| 创建 project：从一组相关 entry 自动建项目 | 强制为每个 entry 选 project |
| 调整 habit schedule：根据历史达成情况建议 target | 自动修改 habit 定义 |

### 5.2 AI 解决"分类整理"的成本

> "我这周记了 50 条 entry，帮我看看哪些属于同一个项目"

AI 读 entries 表 → 识别主题聚合 → 调 `create_project` 建 project → 调 `update_entry` 给每条加 `project_id`。**用户不需要预先 design schema，AI 在事后帮 ta 整理**。

### 5.3 AI 解决"升级"的成本

> "我这条 ongoing 已经做了一个月还没结束，是不是该升级为项目？"

AI 调 `list_entries({ status: 'ongoing' })` → 分析每条的活跃度 → 提议升级或建议如何收尾。用户确认后 AI 调 `upgrade_entry_to_project` 即可。

### 5.4 AI 解决"习惯回顾"的成本

> "我这周习惯达成怎么样？"

AI 调 `list_habits` 得到所有 active habit，对每个调 `get_habit` 得到本周期 progress，汇总回答。不需要用户进入习惯页面。

### 5.5 AI 解决"查询"的成本

> "我上个月在健身上花了多少时间？"

AI 通过 `query_entries({ tags: ['健身'], date_range: 'last_month' })` 读到数据，自己做聚合，回答用户。

### 5.6 关键约束：AI 不进入实时输入路径

PRD §1.5.7 拒绝了"AI 实时解析输入"的方案，原因：

- 依赖网络的核心输入路径违反"本地优先"
- API 延迟（200-300ms）破坏 capture 体验
- 端侧 LLM 在 2026 年的工程现实下不可用
- 每条 entry 都过云端是隐私问题

**AI 始终是异步、批量、对话式的能力**，不参与单条 entry 的实时输入解析。

---

## 6. 三种实体的边界与判定

引入 Entry / Project / Habit 三种实体后，用户面临一个隐性认知负担：**这件事该建模为哪种？**

### 6.1 默认 Entry，主动升级

Loop 的处理策略是：**任何东西默认先记为 Entry**。只有当 entry 在使用中表现出"无法二值打勾、需要拆解、有自己的笔记"等特征时，才考虑：

- 升级为 Project：「这件事是个长期目标，需要记录推进过程」
- 转为 ongoing：「这件事持续在做，但不需要建项目级的笔记」
- 不动：「这就是一次性任务，没必要复杂化」

判断不在录入时，而在事后整理时。AI 也可以参与判断（§5.3）。

### 6.2 Habit vs Recurring Task

「每周游泳 3-4 次」这种重复性场景：

- **Habit**：关注的是「行为模式形成」，记录的是「累计达成」，没有完成状态
- **Recurring Task（不做）**：会污染时间流，且把"每次都打勾"变成机械任务

Loop 明确选 Habit 模型，不做 recurring task。详见 PRD §1.4 非目标和 ADR-013。

### 6.3 Project vs Area

「研究 AI 视频带货」是 Project（有终态）；「我的健康」是 Area（永远不会完成）。

Loop **不为 Area 单独建模**：

- Area 通过 tag 表达（`#健康` `#工作`）
- 多个 project 和 entry 可共享同一 tag
- 用户在标签视图就能看到「健康」相关的全部内容（含 project / habit / entry 三段）

这是规则克制的体现——不引入新实体来解决可以用现有规则承担的需求。

### 6.4 判断负担的真实成本

用户每次记一件事都判断「是 entry / project / habit」是认知负担。Loop 的减负策略：

1. **录入时永远是 entry**：输入框只创建 entry
2. **二级页提供升级路径**：长按 entry → "升级为项目"
3. **AI 主动建议**：周报 prompt 模板内置"整理为 project 建议"

新用户在前期可能完全只用 entry，直到 vault 里出现"一直在跑的事项"才会自然想到 project。这种自然演进比"强制选实体类型"更友好。

---

## 7. 演进路径

### 7.1 MVP 现在是什么样

PRD v2.0 当前状态：

- ✅ Entry / Project / Habit 三种实体
- ✅ Entry 四种 status（含 ongoing）
- ✅ Tag 跨实体共享
- ✅ Entry 通过 `project_id` 外键关联 project
- ✅ Habit 通过 `schedule.match` 动态匹配 entry
- ✅ metadata 格式开放（基础字段 + `_` 系统字段 + 用户字段）
- ✅ MCP 完整暴露三种实体的 CRUD + 查询工具
- ✅ 输入框规则：`#tag` + `/log` `/done` `/ongoing`（共 4 条规则）
- ❌ 无 `@time` `!priority` 输入语法（Level 1）
- ❌ 无视图保存（Level 2）
- ❌ 无自定义实体类型（Level 3）

### 7.2 演进触发条件

每一 Level 不靠时间表推进，靠**用户信号**触发：

| 触发信号 | 引入的 Level |
|---|---|
| 用户抱怨"设置 due 或 priority 太繁琐"，希望像加 tag 一样快 | Level 1（`@time` + `!priority` 语法） |
| 用户重复用同一个搜索查询，或问"能不能保存这个过滤条件" | Level 2（视图） |
| 用户大量用 tag 模拟某种新实体，且抱怨 tag 不够 | Level 3（自定义实体类型，慎重） |

每一 Level 引入时，**老数据 100% 兼容**——通过 op log 的 schema_version 字段做向前兼容。

### 7.3 演进过程中的不变量

无论走到哪一 Level，以下保持不变：

1. **数据归用户所有**：随时可一键导出 markdown / JSON 快照
2. **首页是时间流，没有底部菜单**
3. **新 entry 创建的核心交互是"输入框一行字"**
4. **没有"必须先建 X 才能用"的强制流程**
5. **WebDAV 同步格式不变**（仍是 op log 文件夹）
6. **规则克制：新增规则必须通过"价值非冗余 + 协调一致"双重检查**
7. **AI 不进入实时输入路径**

---

## 8. 总结：Loop 的 database 设计哲学

一句话：

> **不做 database UI，而是预定义三种实体（Entry / Project / Habit），让数据格式开放、让 AI 能读能写、让用户在不感知 database 的情况下得到 database 的价值。**

五点原则：

1. **预定义少量高频实体，不让用户自己设计 schema**：Entry / Project / Habit 覆盖 GTD 全场景
2. **不强制 UI 配置**：结构化能力（字段、视图）可通过 AI 对话产生
3. **录入时永远是 Entry，事后再升级**：判断负担推后到整理时
4. **数据格式开放**：metadata 是 JSON、op log 可任意扩展 kind、SQLite schema 可演化
5. **规则克制**：任何新增规则必须通过"价值非冗余 + 协调一致"双重检查

这套设计赌的是：**AI 能力的提升会让传统"用户自己配置 database"变得过时**。Loop 的极简 UI + 三种预定义实体 + 开放数据格式，刚好是 AI 时代 GTD + 习惯管理的形态。

---

## 9. 与 PRD 的关系

本文档与 PRD v2.0 的关系：

| 内容 | 归属 |
|---|---|
| 设计哲学和产品理念 | 本文档 |
| 与 Notion / Tolaria 的对比 | 本文档 |
| 三种实体的边界与判定 | 本文档 |
| 演进路径和触发条件 | 本文档 |
| 曾被拒绝的设计（负面案例库） | 本文档 |
| MVP 当前实现什么 | PRD v2.0 §2、§4、§6 |
| SQLite schema | PRD v2.0 §6.2 |
| Op log 格式 | PRD v2.0 §6.3 |
| MCP tools 接口 | PRD v2.0 §4.8.2 |
| 规则克制原则 | PRD v2.0 §1.5.7、ADR-011 |
| 三种实体的 ADR | PRD v2.0 ADR-012、ADR-013、ADR-014 |
| Markdown → SQLite 切换的 ADR | PRD v2.0 ADR-005、ADR-008 |
| 后续 Level 引入时的存储格式 | 引入时新增 PRD 章节 |

本文档作为产品设计文档存在，不被 Claude Code 当作开工输入；Claude Code 实施 MVP 时只看 PRD v2.0。但当未来要引入 Level 1-3 任一层时，本文档是"为什么这么做"的背景。

---

**文档结束**
