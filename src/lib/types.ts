// 全局业务类型定义：与数据库表结构（coursegen_ 前缀）一一对应

/** 课程整体状态流转：草稿 → 已生成标题 → 已生成目录 → 小节生成中 → 全部完成 */
export type CourseStatus = "draft" | "titled" | "outlined" | "generating" | "completed";

/** 小节内容生成状态（保存在数据库中，通过 Realtime 广播） */
export type SectionStatus = "pending" | "queued" | "generating" | "completed" | "failed";

/** 用户附加资料（coursegen_profiles） */
export interface CourseProfile {
  id: string;
  display_name: string;
  created_at: string;
}

/** 课程（coursegen_courses） */
export interface Course {
  id: string;
  owner_id: string;
  title: string;
  subtitle: string | null;
  input_topic: string;
  cover_url: string | null;
  cover_seed: string | null;
  status: CourseStatus;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

/** 章节（coursegen_chapters） */
export interface Chapter {
  id: string;
  course_id: string;
  title: string;
  summary: string | null;
  sort_order: number;
  created_at: string;
}

/** 小节（coursegen_sections） */
export interface Section {
  id: string;
  course_id: string;
  chapter_id: string;
  title: string;
  content: string | null;
  status: SectionStatus;
  error: string | null;
  word_count: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** 章节 + 其下小节的组合视图（目录树渲染用） */
export interface ChapterWithSections extends Chapter {
  sections: Section[];
}

/** 用户 AI 生成配置（coursegen_settings） */
export interface CourseSettings {
  id: string;
  user_id: string;
  deepseek_api_key: string;
  model: string;
  title_prompt: string;
  outline_prompt: string;
  section_prompt: string;
  max_concurrency: number;
  updated_at: string;
}

/** DeepSeek 目录生成的返回结构 */
export interface OutlineResult {
  subtitle: string;
  chapters: {
    title: string;
    summary?: string;
    sections: { title: string }[];
  }[];
}

/** 小节状态的中文文案与色调映射（阅读界面 / 目录树共用） */
export const SECTION_STATUS_META: Record<
  SectionStatus,
  { label: string; dot: string; text: string }
> = {
  pending: { label: "待生成", dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
  queued: { label: "排队中", dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  generating: { label: "生成中", dot: "bg-sky-500 animate-pulse", text: "text-sky-600 dark:text-sky-400" },
  completed: { label: "已完成", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  failed: { label: "失败", dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
};

/** 并行生成小节的硬上限（与数据库 check 约束保持一致） */
export const MAX_PARALLEL = 8;
