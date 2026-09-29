-- =====================================================================
-- 课程生成器（CourseGen）数据库迁移脚本
-- 前缀约定：所有数据库对象统一使用 coursegen_ 前缀
-- 使用方式：在 Supabase 控制台 SQL Editor 中整段执行，
--           或 supabase db push（配合 supabase CLI 管理迁移）
-- =====================================================================

-- 依赖扩展（Supabase 默认已启用）
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. 用户资料表：注册时由触发器自动创建
-- ---------------------------------------------------------------------
create table if not exists public.coursegen_profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at   timestamptz not null default now()
);
alter table public.coursegen_profiles enable row level security;

-- ---------------------------------------------------------------------
-- 2. 用户 AI 配置表：DeepSeek Key、提示词模板、并行上限
--    （提示词模板中的 ${变量} 由 Edge Function 渲染）
-- ---------------------------------------------------------------------
create table if not exists public.coursegen_settings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references auth.users (id) on delete cascade,
  deepseek_api_key text not null default '',
  model            text not null default 'deepseek-chat',
  title_prompt     text not null default '',
  outline_prompt   text not null default '',
  section_prompt   text not null default '',
  -- 并行生成小节上限：数据库与应用层都强制不超过 8
  max_concurrency  int  not null default 4 check (max_concurrency between 1 and 8),
  updated_at       timestamptz not null default now()
);
alter table public.coursegen_settings enable row level security;

-- ---------------------------------------------------------------------
-- 3. 课程表
-- ---------------------------------------------------------------------
create table if not exists public.coursegen_courses (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  subtitle    text,
  input_topic text not null default '',
  cover_url   text,
  cover_seed  text,
  status      text not null default 'draft'
              check (status in ('draft', 'titled', 'outlined', 'generating', 'completed')),
  is_public   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists coursegen_courses_owner_idx
  on public.coursegen_courses (owner_id, created_at desc);
create index if not exists coursegen_courses_public_idx
  on public.coursegen_courses (is_public, created_at desc)
  where is_public;
alter table public.coursegen_courses enable row level security;

-- ---------------------------------------------------------------------
-- 4. 章节表
-- ---------------------------------------------------------------------
create table if not exists public.coursegen_chapters (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.coursegen_courses (id) on delete cascade,
  title      text not null,
  summary    text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists coursegen_chapters_course_idx
  on public.coursegen_chapters (course_id, sort_order);
alter table public.coursegen_chapters enable row level security;

-- ---------------------------------------------------------------------
-- 5. 小节表：生成状态保存在这里，前端通过 Realtime 订阅状态变化
-- ---------------------------------------------------------------------
create table if not exists public.coursegen_sections (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.coursegen_courses (id) on delete cascade,
  chapter_id  uuid not null references public.coursegen_chapters (id) on delete cascade,
  title       text not null,
  content     text,
  status      text not null default 'pending'
              check (status in ('pending', 'queued', 'generating', 'completed', 'failed')),
  error       text,
  word_count  int not null default 0,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists coursegen_sections_course_idx
  on public.coursegen_sections (course_id, sort_order);
create index if not exists coursegen_sections_status_idx
  on public.coursegen_sections (course_id, status);
alter table public.coursegen_sections enable row level security;

-- ---------------------------------------------------------------------
-- 6. RLS 策略
--    规则：公开课对所有人可读；写操作仅限课程所有者；
--          章节/小节的读写权限跟随所属课程；配置只允许本人读写。
-- ---------------------------------------------------------------------

-- 资料：登录用户可读任意资料（展示作者名），仅本人可改
drop policy if exists coursegen_profiles_select on public.coursegen_profiles;
create policy coursegen_profiles_select on public.coursegen_profiles
  for select to authenticated using (true);
drop policy if exists coursegen_profiles_update on public.coursegen_profiles;
create policy coursegen_profiles_update on public.coursegen_profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- 配置：仅本人读写
drop policy if exists coursegen_settings_own on public.coursegen_settings;
create policy coursegen_settings_own on public.coursegen_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 课程：公开课（已生成目录及以后）所有人可读；本人始终可读写自己的课程
drop policy if exists coursegen_courses_select on public.coursegen_courses;
create policy coursegen_courses_select on public.coursegen_courses
  for select using (is_public and status in ('outlined', 'generating', 'completed') or owner_id = auth.uid());
drop policy if exists coursegen_courses_insert on public.coursegen_courses;
create policy coursegen_courses_insert on public.coursegen_courses
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists coursegen_courses_update on public.coursegen_courses;
create policy coursegen_courses_update on public.coursegen_courses
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists coursegen_courses_delete on public.coursegen_courses;
create policy coursegen_courses_delete on public.coursegen_courses
  for delete to authenticated using (owner_id = auth.uid());

-- 章节：所属课程可读即可读；仅课程所有者可写
drop policy if exists coursegen_chapters_select on public.coursegen_chapters;
create policy coursegen_chapters_select on public.coursegen_chapters
  for select using (
    exists (select 1 from public.coursegen_courses c
            where c.id = course_id and (c.is_public or c.owner_id = auth.uid()))
  );
drop policy if exists coursegen_chapters_write on public.coursegen_chapters;
create policy coursegen_chapters_write on public.coursegen_chapters
  for all to authenticated using (
    exists (select 1 from public.coursegen_courses c
            where c.id = course_id and c.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.coursegen_courses c
            where c.id = course_id and c.owner_id = auth.uid())
  );

-- 小节：所属课程可读即可读；课程所有者可写（Edge Function 以所有者身份回写状态）
drop policy if exists coursegen_sections_select on public.coursegen_sections;
create policy coursegen_sections_select on public.coursegen_sections
  for select using (
    exists (select 1 from public.coursegen_courses c
            where c.id = course_id and (c.is_public or c.owner_id = auth.uid()))
  );
drop policy if exists coursegen_sections_write on public.coursegen_sections;
create policy coursegen_sections_write on public.coursegen_sections
  for all to authenticated using (
    exists (select 1 from public.coursegen_courses c
            where c.id = course_id and c.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.coursegen_courses c
            where c.id = course_id and c.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- 7. 注册触发器：自动创建资料行与配置行（配置行预填默认提示词）
-- ---------------------------------------------------------------------
create or replace function public.coursegen_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.coursegen_profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, ''), '@', 1));

  insert into public.coursegen_settings (user_id, title_prompt, outline_prompt, section_prompt)
  values (
    new.id,
    -- 默认标题提示词
    $prompt$你是一位资深课程策划专家。用户想学习以下主题：

「${user_topic}」

请为该主题拟定一个专业、有吸引力的中文课程标题。要求：
1. 标题长度 10~24 个汉字，突出学习价值与目标人群；
2. 只输出标题本身，不要引号、书名号、解释或任何多余文字。$prompt$,
    -- 默认目录提示词
    $prompt$你是一位课程体系设计专家。请为课程《${course_title}》设计完整的章节目录。

要求：
1. 共 4~6 章，每章 3~5 个小节，遵循由浅入深的学习路径；
2. 章节与小节标题使用简体中文，具体、可执行，避免空泛；
3. 严格输出 JSON，不要输出任何其他内容，格式如下：
{
  "subtitle": "一句话课程简介，30字以内",
  "chapters": [
    {
      "title": "章节标题",
      "summary": "章节内容简介",
      "sections": [
        { "title": "小节标题" }
      ]
    }
  ]
}$prompt$,
    -- 默认小节提示词
    $prompt$你是一位精通《${course_title}》的授课讲师，请为课程撰写一个小节的完整讲义。

课程大纲：
${outline}

当前章节：${chapter_title}（${chapter_summary}）
当前小节：${section_title}
前一个小节：${previous_section_title}
前一节结尾内容：
${previous_section_content}

写作要求：
1. 使用 Markdown 格式，包含二级/三级小标题、要点列表、必要的代码示例或案例；
2. 内容紧扣「${section_title}」，与前后小节自然衔接，不重复、不跑题；
3. 篇幅 800~1500 字，兼顾深度与可读性；
4. 直接输出正文 Markdown，不要输出小节标题本身，不要任何解释性开场白。$prompt$
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists coursegen_on_user_created on auth.users;
create trigger coursegen_on_user_created
  after insert on auth.users
  for each row execute function public.coursegen_handle_new_user();

-- ---------------------------------------------------------------------
-- 8. Realtime：小节与课程表变更广播
--    前端订阅 coursegen_sections 的 UPDATE 事件，
--    跨设备/跨标签页实时感知小节生成状态（并行数量指示即来源于此）
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'coursegen_sections'
  ) then
    alter publication supabase_realtime add table public.coursegen_sections;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'coursegen_courses'
  ) then
    alter publication supabase_realtime add table public.coursegen_courses;
  end if;
end $$;

-- REPLICA IDENTITY FULL：让 Realtime 事件携带变更前后完整行数据
alter table public.coursegen_sections replica identity full;
alter table public.coursegen_courses replica identity full;

-- ---------------------------------------------------------------------
-- 完成。请继续部署 Edge Function：
--   supabase functions deploy generate-course-content
-- =====================================================================
