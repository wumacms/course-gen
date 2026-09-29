// 课程生成服务：调用 Supabase Edge Function（服务端持有用户 DeepSeek Key 发起 AI 请求）
// 以及封面图片（picsum.photos）生成逻辑。
// 前端绝不接触 API Key；Key 仅存于用户配置表，由 Edge Function 在服务端读取使用。
import { GENERATE_FUNCTION_NAME, getSupabase } from "@/lib/supabase";
import { clearOutline, insertOutline, updateCourse } from "@/lib/db";
import type { OutlineResult } from "@/lib/types";

/** Edge Function 统一响应 */
interface FunctionResponse {
  ok: boolean;
  content?: string;
  error?: string;
  section_id?: string;
  already?: boolean;
}

/** 调用 Edge Function 的通用封装：自动携带 Supabase 访问令牌供服务端验权 */
async function callGenerate(
  action: string,
  payload: Record<string, unknown>
): Promise<FunctionResponse> {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke(GENERATE_FUNCTION_NAME, {
    body: { action, payload },
  });
  if (error) {
    // invoke 对非 2xx 会抛 FunctionsHttpError，尝试解析函数返回的业务错误信息
    const res = (error as { context?: { response?: Response } }).context?.response;
    if (res) {
      const body = (await res.json().catch(() => null)) as FunctionResponse | null;
      throw new Error(body?.error || "AI 服务调用失败");
    }
    throw error;
  }
  const body = data as FunctionResponse;
  if (!body?.ok) throw new Error(body?.error || "AI 服务返回异常");
  return body;
}

/**
 * 生成课程标题：服务端渲染用户提示词模板（${user_topic}）并调用 DeepSeek。
 * 返回清洗后的标题文本。
 */
export async function generateCourseTitle(userTopic: string): Promise<string> {
  const res = await callGenerate("title", { user_topic: userTopic });
  const title = (res.content ?? "").trim();
  if (!title) throw new Error("标题生成结果为空，请重试");
  return title;
}

/**
 * 从模型输出中提取 JSON：剥离可能的 Markdown 代码围栏并截取首个完整 JSON 对象，
 * 兼容 DeepSeek 偶尔附带解释文字的情况。
 */
function extractJson(text: string): unknown {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.search(/[{[]/);
  if (start === -1) throw new Error("目录生成结果不是合法 JSON，请重试");
  // 从首个 { 或 [ 开始做括号配平扫描，截取完整 JSON 片段
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1));
        } catch {
          throw new Error("目录 JSON 解析失败，请重试");
        }
      }
    }
  }
  throw new Error("目录 JSON 不完整，请重试");
}

/** 校验并归一化目录结构，丢弃缺标题/缺小节的脏数据 */
function normalizeOutline(parsed: unknown): OutlineResult {
  const obj = parsed as Record<string, unknown>;
  const rawChapters = Array.isArray(obj?.chapters) ? obj.chapters : [];
  return {
    subtitle: String(obj?.subtitle ?? "").trim(),
    chapters: rawChapters
      .map((ch) => {
        const c = ch as Record<string, unknown>;
        const rawSections = Array.isArray(c?.sections) ? c.sections : [];
        return {
          title: String(c?.title ?? "").trim(),
          summary: String(c?.summary ?? "").trim(),
          sections: rawSections
            .map((s) => {
              const item = s as Record<string, unknown>;
              return { title: String(item?.title ?? "").trim() };
            })
            .filter((s) => s.title),
        };
      })
      .filter((ch) => ch.title && ch.sections.length > 0),
  };
}

/**
 * 生成章节目录的完整前端流程：
 * 调用 Edge Function 获取目录 JSON → 解析 → 清空旧目录 → 批量写入章节与小节 → 更新课程状态。
 * 返回生成的小节总数。
 */
export async function generateOutlineForCourse(courseId: string): Promise<number> {
  const res = await callGenerate("outline", { course_id: courseId });
  const outline = normalizeOutline(extractJson(res.content ?? ""));
  if (!outline.chapters.length) throw new Error("目录生成结果为空，请重试");
  await clearOutline(courseId);
  const sectionCount = await insertOutline(
    courseId,
    outline.chapters.map((ch) => ({
      title: ch.title,
      summary: ch.summary,
      sections: ch.sections.map((s) => s.title),
    }))
  );
  await updateCourse(courseId, {
    status: "outlined",
    // 若模型返回了更贴切的副标题则一并回填
    ...(outline.subtitle ? { subtitle: outline.subtitle.slice(0, 200) } : {}),
  });
  return sectionCount;
}

/**
 * 触发一个小节的内容生成。
 * 服务端完成「并发校验 → 原子领取 → 调用 DeepSeek → 回写状态」全流程；
 * 客户端只需发起请求，界面状态通过 Supabase Realtime 订阅自动刷新。
 */
export async function generateSection(sectionId: string): Promise<FunctionResponse> {
  return callGenerate("section", { section_id: sectionId });
}

/**
 * 一键并行生成：以固定大小的并发池依次触发多个小节生成。
 * 方案刻意简单——每个任务就是「发起一次 Edge Function 调用」，
 * 真实并发上限由服务端按数据库状态原子校验（超出会返回 429 错误并被记为失败原因），
 * 前端池大小只是排队节流，界面进度完全依赖 Realtime 订阅刷新。
 */
export async function generateSectionsInParallel(
  sectionIds: string[],
  poolSize: number,
  onTaskDone?: (id: string, ok: boolean) => void
): Promise<void> {
  const queue = [...sectionIds];
  const workers = Array.from({ length: Math.min(poolSize, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift();
      if (!id) break;
      try {
        await generateSection(id);
        onTaskDone?.(id, true);
      } catch {
        // 失败详情已写入数据库（status=failed + error），Realtime 会同步到界面
        onTaskDone?.(id, false);
      }
    }
  });
  await Promise.all(workers);
}

/**
 * 生成封面图片 URL（picsum.photos 内容占位 API）。
 * seed 模式保证同一课程封面稳定不变。
 */
export function buildCoverUrl(seed: string, width = 1280, height = 720): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`;
}

/** 生成一个足够随机且可作为 picsum seed 的字符串 */
export function makeCoverSeed(): string {
  return `cg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
