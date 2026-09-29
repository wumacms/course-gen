// =====================================================================
// CourseGen Edge Function：generate-course-content
//
// 前端契约（src/lib/generation.ts）：
//   请求体 { action, payload }，action ∈ { "title", "outline", "section" }
//   响应体 { ok, content?, error?, section_id?, already? }
//
// 职责：
//   - title   ：渲染用户标题提示词（${user_topic}）→ 调 DeepSeek → 返回纯文本标题
//   - outline ：读取课程行 → 渲染目录提示词（${course_title}）→ 返回原始 JSON 文本
//               （解析与入库由前端完成，走 RLS 正常写入）
//   - section ：服务端全流程 —— 并发校验 → 原子领取 → 调 DeepSeek → 回写
//               content/status/word_count；界面状态经 Realtime 广播
//
// 安全边界：
//   - 携带用户 JWT 创建客户端，所有读写经 RLS（只能操作本人课程数据）；
//   - DeepSeek Key 存于 coursegen_settings，仅在服务端内存中使用，绝不回传。
//
// 部署（在项目根目录）：
//   supabase link --project-ref <your-ref>
//   supabase functions deploy generate-course-content
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

/** DeepSeek 单次请求超时：小节长文生成较慢，留足余量 */
const LLM_TIMEOUT_MS = 180_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface FunctionResponse {
  ok: boolean;
  content?: string;
  error?: string;
  section_id?: string;
  already?: boolean;
}

function json(body: FunctionResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** 与前端 src/lib/prompts.ts 完全一致的 ${变量} 渲染 */
function renderPrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\$\{(\w+)\}/g, (raw, key: string) =>
    key in vars ? vars[key] : raw
  );
}

/** 调用 DeepSeek Chat Completions，返回首个 choice 的正文 */
async function callDeepSeek(
  apiKey: string,
  model: string,
  prompt: string
): Promise<string> {
  const res = await fetch(DEEPSEEK_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      temperature: 1.3,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!res.ok) {
    // 不透传上游原始错误体，避免泄露请求细节；仅保留可诊断的状态码
    throw new Error(
      `DeepSeek 接口返回 ${res.status}${
        res.status === 401 ? "（API Key 无效，请在设置页检查）" :
        res.status === 402 ? "（账户余额不足）" :
        res.status === 429 ? "（触发上游限流，请稍后重试）" : ""
      }`
    );
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) throw new Error("模型返回内容为空，请重试");
  return content;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "仅支持 POST 请求" }, 405);
  }

  // ---- 鉴权：必须以登录用户身份运行（RLS 依赖其 JWT） ----
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return json({ ok: false, error: "缺少访问令牌，请重新登录" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ ok: false, error: "登录状态无效，请重新登录" }, 401);
  }
  const userId = user.id;

  // ---- 解析请求 ----
  let action: string;
  let payload: Record<string, unknown>;
  try {
    const body = (await req.json()) as {
      action?: string;
      payload?: Record<string, unknown>;
    };
    action = body.action ?? "";
    payload = body.payload ?? {};
  } catch {
    return json({ ok: false, error: "请求体不是合法 JSON" }, 400);
  }

  // ---- 读取用户 AI 配置（RLS 保证只能读到本人行） ----
  async function loadSettings() {
    const { data, error } = await supabase
      .from("coursegen_settings")
      .select("deepseek_api_key, model, title_prompt, outline_prompt, section_prompt, max_concurrency")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("读取用户配置失败");
    if (!data) throw new Error("未找到用户配置，请在设置页完成配置");
    if (!data.deepseek_api_key) throw new Error("尚未配置 DeepSeek API Key，请前往设置页填写");
    return data;
  }

  try {
    switch (action) {
      // =============================================================
      // action = "title"：payload { user_topic }
      // =============================================================
      case "title": {
        const userTopic = String(payload.user_topic ?? "").trim();
        if (!userTopic) return json({ ok: false, error: "课程主题不能为空" }, 400);

        const settings = await loadSettings();
        const template = settings.title_prompt || DEFAULT_TITLE_PROMPT;
        const prompt = renderPrompt(template, { user_topic: userTopic });
        const raw = await callDeepSeek(
          settings.deepseek_api_key,
          settings.model,
          prompt
        );
        // 清洗：去引号/书名号/多余空白，截断到 60 字符防御超长输出
        const title = raw
          .replace(/["'“”《》「」]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 60);
        if (!title) return json({ ok: false, error: "标题生成结果为空，请重试" }, 502);
        return json({ ok: true, content: title });
      }

      // =============================================================
      // action = "outline"：payload { course_id }
      // 仅返回模型原始输出；JSON 解析、目录落库均由前端完成
      // =============================================================
      case "outline": {
        const courseId = String(payload.course_id ?? "");
        if (!courseId) return json({ ok: false, error: "缺少 course_id" }, 400);

        const { data: course, error: courseError } = await supabase
          .from("coursegen_courses")
          .select("id, title, input_topic")
          .eq("id", courseId)
          .eq("owner_id", userId) // 双保险：即便 RLS 放行也只碰自己的课
          .maybeSingle();
        if (courseError) return json({ ok: false, error: "读取课程失败" }, 500);
        if (!course) return json({ ok: false, error: "课程不存在或无权访问" }, 404);

        const settings = await loadSettings();
        const template = settings.outline_prompt || DEFAULT_OUTLINE_PROMPT;
        const prompt = renderPrompt(template, {
          course_title: course.title,
          user_topic: course.input_topic ?? "",
        });
        const content = await callDeepSeek(
          settings.deepseek_api_key,
          settings.model,
          prompt
        );
        return json({ ok: true, content });
      }

      // =============================================================
      // action = "section"：payload { section_id }
      // 服务端全流程：并发校验 → 原子领取 → 生成 → 回写
      // =============================================================
      case "section": {
        const sectionId = String(payload.section_id ?? "");
        if (!sectionId) return json({ ok: false, error: "缺少 section_id" }, 400);

        const { data: section, error: secError } = await supabase
          .from("coursegen_sections")
          .select("id, course_id, chapter_id, title, status, sort_order")
          .eq("id", sectionId)
          .maybeSingle(); // RLS 天然过滤非本人课程的小节
        if (secError) return json({ ok: false, error: "读取小节失败" }, 500);
        if (!section) return json({ ok: false, error: "小节不存在或无权访问" }, 404);

        if (section.status === "completed") {
          return json({ ok: true, section_id: sectionId, already: true });
        }

        const settings = await loadSettings();

        // ---- 并发校验：同一课程正在生成的小节数不得超过 max_concurrency ----
        const { count } = await supabase
          .from("coursegen_sections")
          .select("id", { count: "exact", head: true })
          .eq("course_id", section.course_id)
          .eq("status", "generating");
        if ((count ?? 0) >= settings.max_concurrency) {
          return json(
            { ok: false, error: `并行生成已达上限（${settings.max_concurrency}），请稍候再试` },
            429
          );
        }

        // ---- 原子领取：条件更新，0 行受影响说明已被其他请求抢走 ----
        const { data: claimed, error: claimError } = await supabase
          .from("coursegen_sections")
          .update({ status: "generating", error: null, updated_at: new Date().toISOString() })
          .eq("id", sectionId)
          .in("status", ["pending", "queued", "failed"])
          .select("id");
        if (claimError) return json({ ok: false, error: "领取生成任务失败" }, 500);
        if (!claimed?.length) {
          // 已被并发请求领取（或已完成），视为幂等成功，不报错
          return json({ ok: true, section_id: sectionId, already: true });
        }

        // 课程整体状态推进到 generating
        await supabase
          .from("coursegen_courses")
          .update({ status: "generating", updated_at: new Date().toISOString() })
          .eq("id", section.course_id)
          .eq("owner_id", userId)
          .in("status", ["draft", "titled", "outlined", "completed"]);

        try {
          // ---- 组装提示词变量 ----
          const [{ data: course }, { data: chapter }, outlineRows] = await Promise.all([
            supabase
              .from("coursegen_courses")
              .select("title, subtitle")
              .eq("id", section.course_id)
              .single(),
            supabase
              .from("coursegen_chapters")
              .select("title, summary")
              .eq("id", section.chapter_id)
              .single(),
            loadOutlineContext(supabase, section),
          ]);

          const template = settings.section_prompt || DEFAULT_SECTION_PROMPT;
          const prompt = renderPrompt(template, {
            course_title: course?.title ?? "",
            course_subtitle: course?.subtitle ?? "",
            chapter_title: chapter?.title ?? "",
            chapter_summary: chapter?.summary ?? "",
            section_title: section.title,
            outline: outlineRows.outlineText,
            previous_section_title: outlineRows.prevTitle,
            previous_section_content: outlineRows.prevTail,
            user_topic: course?.title ?? "",
          });

          const content = await callDeepSeek(
            settings.deepseek_api_key,
            settings.model,
            prompt
          );

          // ---- 回写完成状态 ----
          await supabase
            .from("coursegen_sections")
            .update({
              status: "completed",
              content,
              word_count: content.length,
              error: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sectionId);

          // ---- 全部小节完成则课程标记 completed ----
          const { count: unfinished } = await supabase
            .from("coursegen_sections")
            .select("id", { count: "exact", head: true })
            .eq("course_id", section.course_id)
            .neq("status", "completed");
          if (unfinished === 0) {
            await supabase
              .from("coursegen_courses")
              .update({ status: "completed", updated_at: new Date().toISOString() })
              .eq("id", section.course_id)
              .eq("owner_id", userId);
          }

          return json({ ok: true, section_id: sectionId, content });
        } catch (err) {
          // 生成失败：状态落库供前端展示，Realtime 同步
          const message = err instanceof Error ? err.message : "生成失败";
          await supabase
            .from("coursegen_sections")
            .update({
              status: "failed",
              error: message.slice(0, 500),
              updated_at: new Date().toISOString(),
            })
            .eq("id", sectionId);
          return json({ ok: false, error: message, section_id: sectionId }, 500);
        }
      }

      default:
        return json({ ok: false, error: `未知 action: ${action}` }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务内部错误";
    return json({ ok: false, error: message }, 500);
  }
});

// =====================================================================
// 小节上下文：完整大纲文本 + 前一个小节（按课程内全局 sort_order）
// =====================================================================
async function loadOutlineContext(
  supabase: ReturnType<typeof createClient>,
  section: { course_id: string; sort_order: number }
) {
  const [{ data: chapters }, { data: sections }] = await Promise.all([
    supabase
      .from("coursegen_chapters")
      .select("id, title, sort_order")
      .eq("course_id", section.course_id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("coursegen_sections")
      .select("id, chapter_id, title, content, sort_order")
      .eq("course_id", section.course_id)
      .order("sort_order", { ascending: true }),
  ]);

  const chapterMap = new Map((chapters ?? []).map((c) => [c.id, c]));
  const lines: string[] = [];
  let currentChapterId = "";
  for (const s of sections ?? []) {
    const ch = chapterMap.get(s.chapter_id);
    if (ch && ch.id !== currentChapterId) {
      currentChapterId = ch.id;
      lines.push(`第${ch.sort_order + 1}章 ${ch.title}`);
    }
    lines.push(`  - ${s.title}`);
  }

  // 前一个小节：全局排序中位于当前小节之前的最近一条（通常已完成）
  const prev = (sections ?? [])
    .filter((s) => s.sort_order < section.sort_order)
    .slice(-1)[0];

  const prevTail = prev?.content ? prev.content.slice(-500) : "";
  return {
    outlineText: lines.join("\n"),
    prevTitle: prev?.title ?? "无",
    prevTail,
  };
}

// =====================================================================
// 内置兜底提示词（与迁移脚本 / 前端默认值一致；仅当用户配置为空时使用）
// =====================================================================
const DEFAULT_TITLE_PROMPT = `你是一位资深课程策划专家。用户想学习以下主题：

「\${user_topic}」

请为该主题拟定一个专业、有吸引力的中文课程标题。要求：
1. 标题长度 10~24 个汉字，突出学习价值与目标人群；
2. 只输出标题本身，不要引号、书名号、解释或任何多余文字。`;

const DEFAULT_OUTLINE_PROMPT = `你是一位课程体系设计专家。请为课程《\${course_title}》设计完整的章节目录。

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
}`;

const DEFAULT_SECTION_PROMPT = `你是一位精通《\${course_title}》的授课讲师，请为课程撰写一个小节的完整讲义。

课程大纲：
\${outline}

当前章节：\${chapter_title}（\${chapter_summary}）
当前小节：\${section_title}
前一个小节：\${previous_section_title}
前一节结尾内容：
\${previous_section_content}

写作要求：
1. 使用 Markdown 格式，包含二级/三级小标题、要点列表、必要的代码示例或案例；
2. 内容紧扣「\${section_title}」，与前后小节自然衔接，不重复、不跑题；
3. 篇幅 800~1500 字，兼顾深度与可读性；
4. 直接输出正文 Markdown，不要输出小节标题本身，不要任何解释性开场白。`;
