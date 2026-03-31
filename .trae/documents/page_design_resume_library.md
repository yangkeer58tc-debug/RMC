# 页面设计文档：简历库（Desktop-first）

## 全局设计规范（适用于所有页面）

### Layout
- 桌面优先：内容最大宽度 1200px，居中布局；两侧留白随视口增大而增加。
- 主要布局：`Header（顶栏） + Main（内容区）`；列表/详情页在桌面端采用“左列表右详情/右侧信息卡”的双栏变体（视具体页面说明）。
- 间距系统：8px 基础单位（8/16/24/32）。
- 响应式：
  - ≥1024px：完整导航与双栏布局
  - 768–1023px：紧凑导航，部分组件改为上下堆叠
  - <768px：表格降级为卡片列表（可选实现）

### Meta Information（默认）
- Title 模板：`{页面名} - 简历库`
- Description：`导入、解析并结构化存储简历关键信息，便于检索与查看。`
- Open Graph：
  - og:title 同 Title
  - og:description 同 Description
  - og:type: website

### Global Styles
- 背景：#F7F8FA
- 主体卡片背景：#FFFFFF
- 文字：
  - 主文字 #111827
  - 次文字 #6B7280
- 主色（Primary）：#2563EB（按钮、主链接、强调）
- 成功：#16A34A；警告：#D97706；错误：#DC2626
- 字体层级（建议）：
  - H1 24/32, H2 20/28, H3 16/24
  - Body 14/20
- 按钮：
  - Primary：填充主色；hover 加深 8%；disabled 40% 透明
  - Secondary：描边灰；hover 背景浅灰
- 链接：主色下划线仅 hover 显示
- 过渡：hover/展开 150–200ms ease-out

### 通用组件
- TopBar：产品名“简历库” + 主导航（导入/列表）
- Toast：用于导入成功/失败、校验错误提示
- EmptyState：列表为空、搜索无结果
- StatusBadge：processing/success/failed

---

## 页面 1：导入简历页（/import）

### Meta
- Title：导入简历 - 简历库

### Page Structure
- 单列居中卡片布局：上方说明 + 导入方式 Tabs + 表单区 + 状态区。

### Sections & Components
1. 顶栏（TopBar）
   - 左侧：简历库
   - 右侧：导航链接“导入 / 简历列表”
2. 页面标题区
   - H1：导入简历
   - 说明文本：支持上传文件或输入文件链接导入
3. 导入方式 Tabs
   - Tab A：手动上传
   - Tab B：文件链接
4. 表单区（Card）
   - 手动上传（Tab A）
     - FilePicker：支持拖拽/点击选择（显示已选文件名与大小）
     - Primary Button：开始导入
     - 辅助提示：支持的文件类型（如 PDF/DOCX，若实现支持）
   - 链接导入（Tab B）
     - TextInput：文件链接
     - 校验提示：空值/非 URL 格式时就地提示
     - Primary Button：开始导入
5. 状态区（Card，可折叠或固定在表单下方）
   - 导入任务列表（最近 N 条）：
     - 行内容：文件名/链接摘要 + StatusBadge + 时间
     - 失败态：展示 errorMessage；提供“重试”按钮（对同一输入重试）

### Interaction
- 点击“开始导入”后：按钮进入 loading，状态区新增一条 processing 任务。
- 解析成功：提示 toast，并给出“查看简历”入口（跳转到详情）。

---

## 页面 2：简历列表页（/resumes）

### Meta
- Title：简历列表 - 简历库

### Page Structure
- 顶部筛选条 + 主体列表区域。
- 桌面端推荐：筛选条固定在列表上方；列表使用表格；右侧可选信息卡（显示当前筛选统计）。

### Sections & Components
1. 顶栏（TopBar）
2. 页面标题区
   - H1：简历列表
   - 次要信息：显示总条数（如可获得）
3. 搜索与筛选条（FilterBar）
   - 搜索框：姓名（支持回车触发）
   - 国家/城市：两个输入框或组合选择器（实现其一即可）
   - 工作年限：范围（最小/最大）
   - Buttons：
     - Primary：搜索/应用筛选
     - Secondary：重置
4. 列表区（Table/Card List）
   - 列：姓名、国家/城市、工作年限、联系方式概览（如 email/phone）、状态、导入时间、操作
   - 操作：查看（跳转详情）
   - 行状态：processing 显示“解析中…”，failed 显示失败原因 tooltip 或次级文本
5. EmptyState
   - 无数据：引导去导入页
   - 无结果：提示调整筛选条件

### Interaction
- 筛选条件变更后不自动请求，点击“搜索/应用筛选”再刷新结果（减少误触）。

---

## 页面 3：简历详情页（/resumes/:id）

### Meta
- Title：简历详情 - 简历库

### Page Structure
- 桌面端双栏：
  - 左侧：结构化字段（主要内容）
  - 右侧：来源与状态信息卡（辅助信息）

### Sections & Components
1. 顶栏（TopBar）
2. 面包屑（Breadcrumbs）
   - 简历列表 / 简历详情
3. 主内容区（两栏 Grid）
   - 左栏：信息分组卡片
     1) 基本信息（Card）
        - 字段：姓名、国家、城市、工作年限
     2) 联系方式（Card）
        - 展示 contact 中常见字段（phone/email/linkedin/github/website）
        - 不存在字段不展示，仅显示有值项
     3) 教育经历（Card）
        - education 数组以时间倒序卡片/列表展示：学校、学位、专业、起止时间
     4) 自我介绍摘要（原语言）（Card）
        - 多行文本块（保留原语言，不做翻译）
        - 提供“复制”按钮（复制摘要文本）
   - 右栏：来源与解析状态（Sticky Card）
     - StatusBadge：processing/success/failed
     - 来源类型：upload/url
     - 原始文件名（如有）
     - 原链接或存储引用（用于追溯）
     - 失败时显示 parse_error

### Interaction
- processing 状态：页面顶部显示提示条“解析进行中，可稍后刷新”。
- failed 状态：突出显示错误原因，并提供“返回导入页”快捷入口。
