# 课程生成器 CourseGen

基于 AI 的中文课程生成平台：输入一个课程主题，自动生成课程标题、封面、完整章节目录，并支持逐节（或一键并行）生成讲义内容。

## 功能特性

- **AI 课程生成流水线**：主题 → 课程标题（DeepSeek）→ 章节目录 → 小节讲义，三步渐进
- **封面生成**：使用 [picsum.photos](https://picsum.photos) 占位图 API，按 seed 稳定生成课程封面，封面作为课程标题的背景图
- **提示词可配置**：标题 / 目录 / 小节三套提示词模板均支持 `${course_title}`、`${chapter_title}`、`${section_title}`、`${outline}` 等固定引用变量
- **自带 DeepSeek API Key**：每位用户在「系统配置」页填写自己的 Key；Key 仅存于数据库，AI 调用统一经 Supabase Edge Function 在服务端完成，前端绝不接触
- **并行生成小节（上限 8）**：小节生成状态保存在数据库，通过 Supabase Realtime 订阅实时刷新界面；并发上限由服务端「条件 UPDATE 原子领取」保证，方案简单、无竞态
- **公开课库**：网格 + 分页展示所有用户已生成成功的公开课程；访客可读，作者可管理
- **邮箱注册 / 登录 / 找回密码 / 重置密码**：基于 Supabase Auth（PKCE 流程）
- **RLS 行级安全**：所有表按「公开可读、仅作者可写」配置策略

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite 5 + TailwindCSS v4 + shadcn/ui + react-router v6 + TanStack Query |
| 后端 | Supabase（Postgres + Auth + Realtime + RLS + Edge Functions） |
| AI | DeepSeek Chat Completions（用户自带 Key，服务端代理调用） |
| 包管理 | pnpm |

## 快速开始

### 1. 准备 Supabase 项目

1. 在 [supabase.com](https://supabase.com) 创建项目；
2. 打开 **SQL Editor**，整段执行 [`docs/supabase-migrations.sql`](docs/supabase-migrations.sql)（建表、RLS、触发器、Realtime 发布）；
3. 在 **Authentication → Providers → Email** 确认邮箱登录已启用，并在 **URL Configuration** 中把 Site URL 设为你的前端地址（用于邮件跳转与 PKCE 回调）。

### 2. 部署 Edge Function

```bash
supabase functions deploy generate-course-content
# 可选：自定义 DeepSeek 接入点
supabase secrets set DEEPSEEK_API_URL=https://api.deepseek.com/chat/completions
```

### 3. 配置前端环境变量

```bash
cp .env.example .env.local
# 填入 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY
```

> 未配置环境变量时，页面顶部会显示醒目的配置提示条，所有功能安全降级，不会报未捕获异常。

### 4. 安装依赖并运行

```bash
pnpm install
pnpm dev        # 本地开发
pnpm build      # 生产构建
```

## 使用流程

1. 注册 / 登录账号；
2. 「系统配置」页填入 DeepSeek API Key（可选配模型、并发上限、三套提示词模板）；
3. 「课程生成」页输入课程主题 → 生成标题与封面 → 自动跳转目录页；
4. 目录页点击「生成课程目录」→ 逐节点击「生成」，或「一键并行生成」（最多 8 路并发，状态实时刷新）；
5. 打开任意已完成小节进入阅读页；确认内容满意后打开「发布到公开课库」开关。

## 目录结构

```
src/
  components/        # 通用组件（课程卡片、分页、Markdown 渲染、环境提示等）
    layout/          # 导航栏、认证页外壳
    ui/              # shadcn/ui 基础组件
  hooks/             # useAuth（认证）、useSectionRealtime（实时订阅）
  lib/               # supabase 客户端、db 数据访问层、generation 生成服务、prompts 模板、types
  pages/             # 十大页面（列表/目录/阅读/生成/配置/认证等）
functions/
  generate-course-content/   # Supabase Edge Function（服务端调用 DeepSeek）
docs/
  PRD.md                     # 产品需求文档
  supabase-migrations.sql    # 数据库迁移脚本（统一 coursegen_ 前缀）
```

## 设计说明

- **并发方案**：小节状态（pending / generating / completed / failed）持久化在 `coursegen_sections` 表；
  Edge Function 用「条件 UPDATE」原子领取生成权，并以数据库中 generating 状态计数作为跨设备并发上限（≤ 8）。
  前端只做两件事：发起生成请求、订阅 Realtime 刷新界面——没有本地任务队列，没有轮询，简单可靠。
- **安全边界**：DeepSeek Key 只写入 `coursegen_settings`（RLS 仅本人可读写），由 Edge Function 以用户身份读取并调用；
  客户端永远拿不到他人数据写权限，所有查询天然受 RLS 约束。
- **提示词变量**：`${user_topic}`、`${course_title}`、`${chapter_title}`、`${section_title}`、`${outline}` 等，
  服务端渲染，未识别的占位符原样保留，便于用户自定义模板。
