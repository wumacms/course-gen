# 产品需求文档（PRD）— 课程生成器 CourseGen

版本：v1.0 ｜ 状态：已实现

## 1. 产品定位

CourseGen 是一个「输入主题 → 产出完整课程」的 AI 内容平台。用户只需给出一个想学习的主题，
系统调用 DeepSeek 依次生成课程标题、封面、章节目录，并允许用户逐节（或并行批量）生成讲义正文，
最终将成品课程发布到公开课库供所有人阅读。

## 2. 目标用户与场景

| 角色 | 场景 |
| --- | --- |
| 课程作者（登录用户） | 创建课程、配置提示词与 API Key、生成并管理课程内容、决定是否公开 |
| 访客 / 普通读者 | 浏览公开课库、阅读章节目录与小节讲义 |

## 3. 功能需求

### 3.1 账号体系（Supabase Auth，邮箱）

- 邮箱 + 密码注册（邮件确认）、登录、登出；
- 找回密码：发送重置邮件；邮件链接经 PKCE 回调换取会话后进入重置密码页；
- 未登录用户仅可浏览公开课库与阅读内容，所有写操作跳转登录。

### 3.2 课程生成流水线

1. **立项**：输入课程主题 → 服务端用「标题提示词模板」调用 DeepSeek 生成正式课程标题；
   同时以随机 seed 生成 picsum.photos 封面。标题与封面保存成功后跳转课程目录页，
   封面作为课程标题的背景图展示。
2. **目录**：点击「生成课程目录」→ 用「目录提示词模板」生成结构化 JSON（4~6 章、每章 3~5 节），
   解析校验后写入章节与小节表。
3. **正文**：每个小节独立触发「生成」；支持「一键并行生成」，并行数量上限 8，
   界面上实时显示「并行生成 n/8」。

### 3.3 系统配置

- DeepSeek API Key（保存于数据库，仅 Edge Function 服务端读取，前端展示时掩码）；
- 模型名称（默认 deepseek-chat）；
- 并行生成上限（1~8）；
- 三套提示词模板（标题 / 目录 / 小节），支持固定引用变量：
  `${user_topic}`、`${course_title}`、`${course_subtitle}`、`${chapter_title}`、
  `${chapter_summary}`、`${section_title}`、`${outline}`、`${previous_section_title}`、
  `${previous_section_content}`；未识别变量原样保留。

### 3.4 浏览与阅读

- 公开课列表：网格 + 分页（每页 12），仅展示生成成功（outlined/generating/completed）且公开的课程；
- 章节目录页：树形展示章节与小节状态（待生成 / 生成中 / 已完成 / 失败），失败可重试；
- 阅读页：Markdown 渲染讲义正文，含上一章/下一章导航；未完成小节对访客显示占位提示。

## 4. 关键技术方案

### 4.1 并行生成与状态同步（刻意简单）

- 小节生成状态持久化在 `coursegen_sections.status`；
- Edge Function 领取生成权使用「条件 UPDATE」（仅 pending/failed → generating），天然防重复点击竞态；
- 并发上限 = 服务端统计该课程 generating 状态小节数（跨标签页/跨设备一致），超限直接拒绝；
- 前端通过 **Supabase Realtime** 订阅小节表 UPDATE 事件，触发 react-query 重新拉取目录，
  无轮询、无本地队列、无乐观状态机——状态唯一来源是数据库。

### 4.2 安全

- 所有表启用 RLS：公开课程与完成小节全员可读，写操作仅课程作者；
- DeepSeek Key 永不下发前端；AI 调用统一走 Edge Function（校验用户 JWT 后以用户身份读写）；
- 数据库对象统一 `coursegen_` 前缀，便于同库多项目共存。

### 4.3 降级提示

- 开发者未配置 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 时，
  全站顶部显示配置指引横幅，客户端为 null，所有查询禁用，不产生未捕获异常。

## 5. 页面清单

| 路由 | 页面 | 权限 |
| --- | --- | --- |
| `/` | 公开课列表 | 公开 |
| `/courses/:courseId` | 章节目录 | 公开可读，作者可操作 |
| `/courses/:courseId/sections/:sectionId` | 详情阅读 | 公开可读 |
| `/my` | 我的课程 | 登录 |
| `/generate` | 课程生成 | 登录 |
| `/settings` | 系统配置 | 登录 |
| `/login` `/register` `/forgot-password` `/reset-password` `/auth/callback` | 认证流程 | 公开 |

## 6. 数据模型

见 [`supabase-migrations.sql`](./supabase-migrations.sql)：
`coursegen_profiles`、`coursegen_settings`、`coursegen_courses`、`coursegen_chapters`、`coursegen_sections`
及注册触发器、RLS 策略、Realtime 发布配置。

## 7. 非目标（v1 明确不做）

- 课程协作编辑、付费体系、导出 PDF、多语言界面。
