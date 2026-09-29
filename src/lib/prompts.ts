// 提示词模板：默认文案、可用变量说明与变量渲染函数
// 模板中使用 ${变量名} 引用固定变量（在 TS 模板字符串中以 \${ 转义书写），渲染时替换为实际内容

/** 提示词中支持的全部固定引用变量及其说明（配置页展示用） */
export const PROMPT_VARIABLES: { name: string; desc: string }[] = [
  { name: "course_title", desc: "课程标题" },
  { name: "course_subtitle", desc: "课程副标题（一句话简介）" },
  { name: "user_topic", desc: "用户输入的课程主题" },
  { name: "chapter_title", desc: "当前章节标题" },
  { name: "chapter_summary", desc: "当前章节简介" },
  { name: "section_title", desc: "当前小节标题" },
  { name: "outline", desc: "完整课程章节目录（文本大纲）" },
  { name: "previous_section_title", desc: "前一个小节标题（首个小节为“无”）" },
  { name: "previous_section_content", desc: "前一个小节正文末尾（用于衔接上下文）" },
];

/** 默认「课程标题」提示词：根据用户输入生成一个更完善的课程标题 */
export const DEFAULT_TITLE_PROMPT = `你是一位资深课程策划专家。用户想学习以下主题：

「\${user_topic}」

请为该主题拟定一个专业、有吸引力的中文课程标题。要求：
1. 标题长度 10~24 个汉字，突出学习价值与目标人群；
2. 只输出标题本身，不要引号、书名号、解释或任何多余文字。`;

/** 默认「章节目录」提示词：根据课程标题生成完整章节与小节结构 */
export const DEFAULT_OUTLINE_PROMPT = `你是一位课程体系设计专家。请为课程《\${course_title}》设计完整的章节目录。

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

/** 默认「小节内容」提示词：为指定小节撰写完整讲义 */
export const DEFAULT_SECTION_PROMPT = `你是一位精通《\${course_title}》的授课讲师，请为课程撰写一个小节的完整讲义。

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

/**
 * 渲染提示词模板：把 ${变量名} 替换为实际值。
 * 未提供的变量保持原样，方便用户在配置页发现拼写错误。
 */
export function renderPrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\$\{(\w+)\}/g, (raw, key: string) =>
    key in vars ? vars[key] : raw
  );
}
