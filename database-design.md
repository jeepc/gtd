# Database 能力设计说明

> 本文档解释两件事：
> 1. Notion 的 database 是怎么实现的（理解原型）
> 2. 本产品如何在 Markdown 体系下提供类似能力（不破坏极简定位）
>
> 不涉及技术规范、存储格式、API 设计——那些在 PRD 主文档里。

---

## 1. 为什么要谈 database

GTD 工具用着用着，用户会自然产生需求：

- 「我想看本周所有 `#工作` 标签且未完成的事」
- 「这件事属于 Q3 评审项目，那个项目下还有哪些事？」
- 「按截止日期排序我所有的未完成 todo」
- 「这件事的优先级是 P1，那件是 P3」

这些都不是简单"加个标签"能解决的——它们需要**结构化字段**和**结构化查询**。这正是 Notion database 的能力范畴。

但 Notion 把这件事做得很重：要先建数据库、定义字段、配置视图，用户从"输入一行字"变成"先设计表结构"。这与本产品的极简定位冲突。

所以问题不是"做不做 database"，而是**"如何在不破坏 Markdown 纯文本和极简交互的前提下，得到 database 的核心价值"**。

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

**关键洞察**：Notion 里"数据库的行"和"独立页面"在底层是同一个东西。区别仅在于这个 page 是否被某个 database 容器引用、是否继承了 schema。

### 2.3 Property 是结构化字段

Database block 上挂着一组 property 定义：

```
{ name: 'status', type: 'select', options: ['Todo', 'Doing', 'Done'] }
{ name: 'priority', type: 'number' }
{ name: 'due', type: 'date' }
{ name: 'assignee', type: 'person' }
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

view **不存数据**，只存「filter + sort + group_by + 显示哪些字段」的配置。换 view = 换查询。

### 2.5 为什么 Notion 不用 Markdown

Notion 用自定义 JSON 表示富文本，不用 Markdown。原因：Markdown 表达不了 Notion 的 callout、彩色文字、synced block、column layout 等特殊 block 类型，也表达不了 database 的 schema 和 view 配置。

这是 Notion 选择"功能丰富度 vs 互操作性"时倒向前者的代价——你的数据被锁在 Notion 里。

### 2.6 一句话总结 Notion 的 database

> **Database = 一组共享 schema 的 page block 集合 + 多个 view 定义**

理解这个公式，就能想清楚怎么在 Markdown 里复现它的核心。

---

## 3. 本产品的极简定位与 database 的张力

明确两件事：

**本产品不做 Notion 那样的完整 database**。原因：

- 极简交互是产品定位，要求用户能"输入一行字就上手"，不能强迫先建表
- 单用户 GTD 不需要权限、协作、多人字段等复杂概念
- Markdown 纯文本是不可让步的底线（数据归用户所有）

**但本产品需要 database 的"核心价值"**：

- 给 entry 加结构化字段（不止 tag）
- 用结构化字段做查询、过滤、排序
- AI 能读懂这些字段，做更精准的分析

所以策略是：**抽出 Notion 思路的精华，用 Markdown 的方式表达，且让用户感知不到"在用 database"**。

---

## 4. 本产品的方案：把 database 拆成可独立引入的四层

不一次性引入"完整 database"，而是把它分成四个能力层，按价值密度排序，逐层引入。MVP 不做任何一层，但**数据格式从第一天就为它们留好位置**（这是 PRD v1.1 §6.7 metadata 开放扩展的目的）。

### 4.1 四层概览

| Level | 能力 | 对应 Notion | 引入时机 |
|---|---|---|---|
| 1 | 自由 metadata 字段 | property（无 schema） | Phase 2 |
| 2 | K:V tag 输入语法 | 给 property 加快捷输入 | Phase 2 |
| 3 | 视图（保存的查询） | view | Phase 3 |
| 4 | 实体（项目/领域） | 关联的 database | Phase 4，可选 |

**MVP 阶段保持现状**：只有 Entry + tag + status，没有上面任何一层。但 metadata JSON 的格式已经允许写入任意 key-value（PRD §6.7），所以未来引入 Level 1 时**老数据无需迁移**。

---

### 4.2 Level 1：自由 metadata 字段（property 的极简版）

#### 是什么

允许每条 entry 携带任意 key-value 字段。**字段不预先定义、不需要 schema、不强制校验**——用户/AI 写什么就是什么。

```markdown
- [ ] 准备 Q3 评审材料 #工作 ^01HX... <!-- {
  "updated":"...",
  "project":"q3-review",
  "priority":2,
  "due":"2026-05-25"
} -->
```

`project`、`priority`、`due` 都是用户字段，与 Notion 的 property 在含义上等价，但**没有 schema 约束**。

#### 为什么这样设计

Notion 的 schema 是双刃剑：保证一致性，但提高了入门门槛。本产品是单用户工具，"用户字段写错"代价很小，"必须先建 schema"才是真正的体验障碍。

借鉴 Tolaria 的实践（PRD §1.5.3 无硬编码例外）：**用约定替代 schema**。某些字段名如 `due`、`priority`、`project` 被解析器特殊渲染（如把 `due` 显示为日期 badge），但**没写这些字段也不影响使用**。

#### 用户能做什么

- 在 entry 详情页的"元数据"区，看到所有自定义字段
- 通过 MCP 让 AI 自动给 entry 加字段（"帮我把这些 todo 按 P1/P2/P3 分级"）
- 后续视图（Level 3）和查询能按这些字段过滤/排序

#### 用户不需要做什么

- 不需要预先声明字段
- 不需要为每个字段选类型
- 不需要担心字段写错

#### 与 Notion 的取舍

| 维度 | Notion property | 本产品 metadata |
|---|---|---|
| 是否需要先定义 | 是 | 否 |
| 类型校验 | 严格 | 无 |
| 字段一致性 | schema 保证 | 用户/AI 自觉 |
| 入门成本 | 高 | 接近零 |
| 数据可移植性 | 低（专有 JSON） | 高（纯 Markdown） |

---

### 4.3 Level 2：K:V tag 输入语法（让加字段比加 tag 还快）

#### 是什么

扩展输入框的标签语法。除了 `#tag`，还支持 `#key:value`：

```
准备 Q3 评审 #project:q3 #due:0525 #!!
```

解析为：

```json
{
  "content": "准备 Q3 评审",
  "tags": [],
  "metadata": {
    "project": "q3",
    "due": "2026-05-25",
    "priority": 2
  }
}
```

#### 为什么这样设计

Notion 加 property 要打开右侧面板、选字段、填值，至少三步。本产品的核心交互是"输入框一行搞定"，必须让加字段的成本**不高于加 tag**。

`#k:v` 是市面上成熟的语法（Things、TickTick、Logseq 都有类似），用户认知成本几乎为零。加上一些常用 shortcut（`!`/`!!`/`!!!` 表示优先级，`@日期` 表示截止），就能在一行内完成"加 4 个属性"。

#### 用户能做什么

- 用 `#k:v` 给任意字段赋值
- 用 shortcut 快速加优先级、截止日期等常用字段
- 输入框实时高亮，每个 `#k:v` 渲染成独立 chip
- 写错可直接编辑 entry detail，metadata 字段都列出来

#### 和 tag 的关系

- `#工作`（无冒号）→ tag
- `#project:q3`（有冒号）→ metadata 字段
- 一条 entry 可以同时有 tag 和 metadata 字段

tag 仍然是首页时间流可见的快速过滤维度；metadata 字段是结构化数据的承载。两者不冲突。

---

### 4.4 Level 3：视图（保存的查询）

#### 是什么

把"按某些条件过滤、排序、分组 entry"的查询保存下来，成为一个可命名的视图。

例如：
- **「本周工作」**：filter=`tag:工作` AND `date:本周`
- **「未完成 P1」**：filter=`status:todo` AND `priority:1`
- **「Q3 项目」**：filter=`project:q3` AND `status:todo|done`，group by `due`

视图是 vault 内的一份配置（一个 yaml 文件），跟随同步，所以**在桌面端创建的视图在手机上也能看到**。

#### 为什么这样设计

到了这一层，用户已经有了几百几千条带结构化字段的 entry。简单的"标签视图"不够用了，需要：

- **多条件组合**（不止单个 tag）
- **保存为命名视图**（避免每次重新筛选）
- **跨设备共享**（在桌面 build 好视图，手机上直接用）

这正是 Notion view 的核心价值。但本产品要去掉 Notion view 的复杂度——**不做拖拽配置 UI**，视图就是一份纯文本配置，可以在 app 内编辑也可以用任何文本编辑器直接改。

#### 用户能做什么

- 首页右上角「⋯」→「视图」，看到所有视图列表
- 点视图进入二级页，展示过滤/排序/分组后的 entry 流
- 在标签视图、搜索结果页右上角"另存为视图"
- 视图二级页可重命名、删除、编辑过滤条件
- 预置视图：「今天」「本周」「未完成 P1」「最近完成」

#### 视图的种类

只支持一种渲染模式——**时间流列表**（同首页、同标签视图）。

明确**不做**：

- Board view（看板拖拽）——违背"极简"
- Calendar view（日历）——首版不做提醒，不必要
- Gallery view（卡片）——entry 是单行短文本，不适合卡片

#### 与 Notion 的取舍

| 维度 | Notion view | 本产品视图 |
|---|---|---|
| 视图种类 | Table / Board / Calendar / Gallery / Timeline | 仅时间流 |
| 配置方式 | 拖拽 UI | yaml 文件（也有简易 UI） |
| 跨设备同步 | 是 | 是 |
| 跨 database | 否 | 不适用（无 database） |

---

### 4.5 Level 4：实体（可选）

#### 是什么

到这一层，entry 不再是唯一的实体类型。系统支持"实体笔记"——比如「项目」「领域」「人物」——每个实体也是一个 Markdown 文件，但**作为长期存在的对象**而非单次行为记录。

```
<vault>/
  2026/05/2026-05-18.md     # 日 entry 文件（继续保持）
  entities/
    project/q3-review.md    # 一个项目实体
    project/blog-revamp.md
    area/work.md            # 一个领域实体
    area/health.md
```

entry 通过 metadata 字段引用实体：

```markdown
- [ ] 准备评审材料 ^01HX... <!-- {"project":"[[q3-review]]","area":"[[work]]"} -->
```

实体笔记本身有 frontmatter 描述自己的属性：

```markdown
---
type: project
status: active
start_date: 2026-04-01
due: 2026-09-30
---

# Q3 评审

## 目标
...

## 风险
...
```

#### 为什么这样设计

GTD 用久了，"项目"会自然冒出来——比如装修房子、写一本书、跑半马训练。把"项目"做成独立笔记，可以：

- 给项目本身写笔记、记录进展
- 在项目笔记里反向看到"所有引用我的 entry"
- 让 AI 理解"这件事属于哪个项目"，做更智能的分析

这一步走完，本产品就有了 Notion 那种"database 之间互相 relation"的雏形。

#### 为什么标为"可选"

- 不是所有用户都需要项目/领域。轻度用户只用 entry + tag 就够了
- 引入实体后，UI 必须有"项目列表"入口，破坏了"只有首页+二级页"的极简结构
- 与 GTD 的核心定位有距离了（开始向 PKM 方向移动）

如果产品演进发现核心用户都是"重度多项目用户"，再做 Level 4；否则保持在 Level 3。

#### 借鉴 Tolaria 的设计

Tolaria 已经把这一思路完整实现：

- 实体类型在 `type:` frontmatter 字段表达
- 类型本身也是一个 markdown 文件（`type/project.md`），定义这个类型的 schema 元信息
- 字段值含 `[[wikilink]]` 自动识别为关系（无需硬编码字段名）

本产品若引入 Level 4，**直接照搬 Tolaria 这套**，不再设计。Tolaria 的实现已经经过 1800+ commit 的实战检验。

---

## 5. 现状对照与演进路径

### 5.1 MVP 现在是什么样

PRD v1.1 当前状态：

- ✅ Entry 是唯一实体
- ✅ Tag 和 status 是仅有的结构化维度
- ✅ metadata 格式开放（基础字段 + `_` 前缀系统字段 + 任意用户字段）
- ✅ MCP `set_entry_property` tool 让 AI 可以写入用户字段
- ❌ 无 K:V tag 语法
- ❌ 无视图
- ❌ 无实体

这意味着：

- 用户感知到的是"极简 GTD"
- 但**数据格式已经为后续 Level 1-4 留好了所有位置**
- AI 可以从 day 1 开始在 metadata 里加字段，不需要等到 Phase 2

### 5.2 演进触发条件

每一 Level 不靠时间表推进，靠**用户信号**触发：

| 触发信号 | 引入的 Level |
|---|---|
| 用户开始用 `priority:` `due:` 这样的 tag 表达字段（被 AI 教会的） | Level 1（让详情页正式展示这些字段） |
| 用户抱怨"加字段太繁琐"，希望像加 tag 一样快 | Level 2（K:V 语法） |
| 用户重复用同一个搜索查询，或问"能不能保存这个过滤条件" | Level 3（视图） |
| 用户开始用 tag 模拟项目（如 `#proj-q3-review`），且抱怨 tag 不够用 | Level 4（实体） |

每一 Level 引入时，**老数据 100% 兼容**。这是 metadata 开放设计的核心价值。

### 5.3 演进过程中的不变量

无论走到哪一 Level，以下保持不变：

1. **数据是 Markdown，可以被任何编辑器打开**
2. **首页是时间流，没有底部菜单**
3. **新 entry 创建的核心交互是"输入框一行字"**
4. **没有"必须先建 X 才能用"的强制流程**
5. **WebDAV 同步格式不变，只是文件内容富了**

---

## 6. AI 在 database 能力中的角色

AI 不是 database 的辅助工具，而是**让 database 在极简 UI 下可用的核心**。

### 6.1 AI 解决"加字段"的成本

Notion 的 schema 配置门槛高，因为需要用户自己想清楚"我要哪些字段"。在本产品里，AI 可以反过来做：

> "我这周记了 50 条 entry，帮我看看哪些属于同一个项目，加上 `project:` 字段"

AI 读完所有 entry 后，给每条调用 `set_entry_property`，把 `project` 字段填好。**用户不需要预先 design schema，AI 在事后帮 ta 整理出 schema**。

### 6.2 AI 解决"建视图"的成本

> "帮我做一个『本周需要推动的 P1 项目』视图"

AI 调用 MCP 写一个视图 yaml 文件到 vault，下次同步后所有设备都能看到。

### 6.3 AI 解决"查询"的成本

> "我上个月在健身上花了多少时间？"

AI 读 metadata 字段，自己做 group by 和聚合，回答用户。**这种查询用户根本不需要进入"视图"页面**——直接对话就行。

### 6.4 推论：UI 上的 view 配置 vs AI 对话

未来如果 AI 能力足够强，可能根本不需要"视图列表"这个二级页——用户直接说"展示本周 P1"，AI 把 entry 流过滤好直接呈现在主界面。

所以 Level 3 视图的引入应该**先做"yaml 文件 + MCP tool 让 AI 创建"，UI 编辑器后做或不做**。

---

## 7. 总结：本产品的 database 设计哲学

一句话：

> **不做 database，而是让数据格式开放、让 AI 能读能写、让用户在不感知 database 的情况下得到 database 的价值。**

四点原则：

1. **不强制 schema**：用户写什么是什么，AI 后期帮整理
2. **不强制 UI 配置**：所有结构化能力（字段、视图）都可以通过 AI 对话产生
3. **按需引入**：四层能力按用户信号触发，每一层都向后兼容
4. **数据始终是纯文本 Markdown**：无论走到哪一层，用 Obsidian 也能打开

这套设计赌的是：**AI 能力的提升会让传统"用户自己配置 database"变得过时**。本产品的极简 UI + 开放数据格式，刚好是 AI 时代 GTD 的形态。

---

## 8. 与 PRD 的关系

本文档与 PRD v1.1 的关系：

| 内容 | 归属 |
|---|---|
| 设计哲学和产品理念 | 本文档 |
| 与 Notion / Tolaria 的对比 | 本文档 |
| 四层能力的概念定义 | 本文档 |
| 演进路径和触发条件 | 本文档 |
| MVP 当前实现什么 | PRD v1.1 §2、§4、§6 |
| metadata 格式规范 | PRD v1.1 §6.7 |
| MCP `set_entry_property` 接口 | PRD v1.1 §4.6.2 |
| 后续 Level 引入时的存储格式 | 引入时新增 PRD 章节 |

本文档作为产品设计文档存在，不被 Claude Code 当作开工输入；Claude Code 实施 MVP 时只看 PRD v1.1。但当未来要引入 Level 1-4 任一层时，本文档是"为什么这么做"的背景。

---

**文档结束**
