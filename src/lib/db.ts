// Supabase 数据访问层：所有表读写集中在此模块，页面组件不直接拼查询
// 表前缀统一为 coursegen_；权限完全交由 RLS 策略兜底
import { getSupabase } from "@/lib/supabase";
import type {
  Chapter,
  ChapterWithSections,
  Course,
  CourseSettings,
  Section,
} from "@/lib/types";

/** 每页课程数量（公开课/我的课程网格分页共用） */
export const PAGE_SIZE = 12;

// ————————————————————————— 课程 —————————————————————————

/** 分页查询公开课列表（仅生成成功且已公开的课程） */
export async function fetchPublicCourses(page: number): Promise<Course[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("coursegen_courses")
    .select("*")
    .eq("is_public", true)
    .in("status", ["outlined", "generating", "completed"])
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw error;
  return (data ?? []) as Course[];
}

/** 分页查询我的课程列表（RLS 自动限定为本人课程） */
export async function fetchMyCourses(page: number): Promise<Course[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("coursegen_courses")
    .select("*")
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw error;
  return (data ?? []) as Course[];
}

/** 按 ID 查询单个课程（可读性由 RLS 决定：公开或本人） */
export async function fetchCourse(courseId: string): Promise<Course | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("coursegen_courses")
    .select("*")
    .eq("id", courseId)
    .maybeSingle();
  if (error) throw error;
  return (data as Course) ?? null;
}

/** 创建课程记录（生成流程第一步：先落库用户主题，状态 draft） */
export async function createCourse(ownerId: string, inputTopic: string): Promise<Course> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("coursegen_courses")
    .insert({
      owner_id: ownerId,
      input_topic: inputTopic,
      title: inputTopic, // 占位标题，AI 生成正式标题后覆盖
      is_public: false, // 新课程默认私密，作者确认后发布
      status: "draft",
    })
    .select()
    .single();
  if (error) throw error;
  return data as Course;
}

/** 局部更新课程字段 */
export async function updateCourse(
  courseId: string,
  patch: Partial<Pick<Course, "title" | "subtitle" | "cover_url" | "cover_seed" | "status" | "is_public">>
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("coursegen_courses")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", courseId);
  if (error) throw error;
}

/** 删除整门课程（章节与小节由外键级联删除） */
export async function deleteCourse(courseId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("coursegen_courses").delete().eq("id", courseId);
  if (error) throw error;
}

// ————————————————————————— 章节目录 —————————————————————————

/** 查询课程的完整目录树（章节 + 小节，按排序号组织） */
export async function fetchOutline(courseId: string): Promise<ChapterWithSections[]> {
  const supabase = getSupabase();
  const [chaptersRes, sectionsRes] = await Promise.all([
    supabase
      .from("coursegen_chapters")
      .select("*")
      .eq("course_id", courseId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("coursegen_sections")
      .select("*")
      .eq("course_id", courseId)
      .order("sort_order", { ascending: true }),
  ]);
  if (chaptersRes.error) throw chaptersRes.error;
  if (sectionsRes.error) throw sectionsRes.error;
  const chapters = (chaptersRes.data ?? []) as Chapter[];
  const sections = (sectionsRes.data ?? []) as Section[];
  return chapters.map((c) => ({
    ...c,
    sections: sections.filter((s) => s.chapter_id === c.id),
  }));
}

/** 清空课程目录（重新生成目录前调用；小节随外键级联删除） */
export async function clearOutline(courseId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("coursegen_chapters").delete().eq("course_id", courseId);
  if (error) throw error;
}

/** 批量写入章节与小节（目录生成成功后调用），返回写入的小节总数 */
export async function insertOutline(
  courseId: string,
  chapters: { title: string; summary: string; sections: string[] }[]
): Promise<number> {
  const supabase = getSupabase();
  // 先构建全部行，一次事务式批量插入，避免逐章往返造成半成品目录
  const chapterRows = chapters.map((ch, ci) => ({
    course_id: courseId,
    title: ch.title,
    summary: ch.summary || null,
    sort_order: ci,
  }));
  const { data: createdChapters, error: chErr } = await supabase
    .from("coursegen_chapters")
    .insert(chapterRows)
    .select("id, sort_order");
  if (chErr) throw chErr;
  if (!createdChapters?.length) return 0;

  // sort_order 映射回对应章节的新 ID
  const idByOrder = new Map(createdChapters.map((c) => [c.sort_order as number, c.id as string]));
  const sectionRows = chapters.flatMap((ch, ci) =>
    ch.sections.map((title, si) => ({
      course_id: courseId,
      chapter_id: idByOrder.get(ci) as string,
      title,
      sort_order: ci * 100 + si, // 跨章节全局有序
      status: "pending" as const,
    }))
  );
  if (sectionRows.length) {
    const { error: secErr } = await supabase.from("coursegen_sections").insert(sectionRows);
    if (secErr) throw secErr;
  }
  return sectionRows.length;
}

// ————————————————————————— 小节 —————————————————————————

/** 按 ID 查询单个小节 */
export async function fetchSection(sectionId: string): Promise<Section | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("coursegen_sections")
    .select("*")
    .eq("id", sectionId)
    .maybeSingle();
  if (error) throw error;
  return (data as Section) ?? null;
}

// ————————————————————————— 用户配置 —————————————————————————

/** 读取当前用户配置（行由注册触发器自动创建，此处兜底补建） */
export async function fetchSettings(): Promise<CourseSettings> {
  const supabase = getSupabase();
  const { data: me, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const userId = me.user!.id;
  const { data, error } = await supabase
    .from("coursegen_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as CourseSettings;
  // 老用户没有配置行时补建（默认值由数据库 DEFAULT 提供）
  const { data: created, error: insErr } = await supabase
    .from("coursegen_settings")
    .insert({ user_id: userId })
    .select()
    .single();
  if (insErr) throw insErr;
  return created as CourseSettings;
}

/** 保存当前用户配置 */
export async function saveSettings(
  userId: string,
  patch: Partial<Omit<CourseSettings, "id" | "user_id" | "updated_at">>
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("coursegen_settings")
    .update(patch)
    .eq("user_id", userId);
  if (error) throw error;
}
