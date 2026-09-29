// Markdown 讲义渲染：react-markdown + remark-gfm（表格、任务列表等）
// 排版样式集中在 index.css 的 .markdown-body 规则中
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <article className={cn("markdown-body", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 外链统一新窗口打开并阻断引用信息泄露
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          // 代码块语言信息透传给 class，便于后续高亮扩展
          code: ({ node: _node, className: codeClass, ...props }) => (
            <code className={codeClass} {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
