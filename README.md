# 简历库（Resume Library）

支持上传文件或输入文件链接导入；解析并保存姓名、国家/城市、邮箱、WhatsApp、电话、工作年限、教育经历、自我介绍摘要（原语言）；支持手动校正与搜索筛选。

后端使用 Supabase（Postgres + Storage），前端为纯静态站点（可部署到 Cloudflare Pages）。

## 本地开发

1. 复制环境变量文件：`cp .env.example .env`
2. 在 `.env` 中填入：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. 安装依赖：`npm install`
4. 启动：`npm run dev`

前端：`http://localhost:5173/`

## 部署

### Cloudflare Pages

- Build command：`npm run build`
- Output directory：`dist`
- 环境变量：
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

Pages 默认会按 SPA 方式处理路由刷新（项目不提供顶层 `404.html`）。

### Cloudflare Pages Function（可选，但推荐）

已新增 `functions/proxy.ts`，用于“文件链接导入”时由服务端代下载，绕过浏览器 CORS 限制。部署到 Pages 后自动生效：
- 路径：`/proxy?url=https://...`
- 限制：只允许 http/https、阻止 localhost/内网 IP、最大 15MB

### AI 字段抽取（可选，提升准确率）

已新增 `functions/ai-extract.ts`：前端会在本地规则解析后，额外调用 `/ai-extract` 用大模型做字段抽取与纠错（姓名/地点/年限等）。

在 Cloudflare Pages → Settings → Environment variables 配置（Production/Preview 都建议配）：
- `LLM_BASE_URL`：你的 Poe/OpenAI 兼容网关 base url（需支持 OpenAI Chat Completions）。
  - 可填 `https://api.poe.com` 或 `https://api.poe.com/v1`（两种都支持）
- `LLM_API_KEY`：对应的 key（只配置在 Cloudflare，不会下发到浏览器）
- `LLM_MODEL`：模型名（可选，默认 `gpt-4o-mini`）

### Supabase Storage（必须配置一次）

前端会用 `anon key` 直传文件到 Storage。请在 Supabase 控制台里给 `resumes` bucket 开启上传权限（否则会报 RLS 错误）。

在 SQL editor 执行：

```sql
create policy "resumes_anon_insert" on storage.objects
for insert to anon, authenticated
with check (bucket_id = 'resumes');

create policy "resumes_anon_select" on storage.objects
for select to anon, authenticated
using (bucket_id = 'resumes');
```

### Vercel（可选）

项目仍保留了 `vercel.json` 与 `/api/index` 入口（如果你想保留 Node API）。

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  extends: [
    // other configs...
    // Enable lint rules for React
    reactX.configs['recommended-typescript'],
    // Enable lint rules for React DOM
    reactDom.configs.recommended,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```
