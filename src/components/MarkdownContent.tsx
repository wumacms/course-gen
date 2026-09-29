// Markdown 讲义渲染：react-markdown + remark-gfm（表格、任务列表等）+ rehype-highlight（代码高亮）
// 排版样式集中在 index.css 的 .markdown-body 规则中
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { Children, isValidElement, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Root } from "hast";

// lowlight 的 common 语言集未注册 vue，直接高亮会抛 Unknown language 而被跳过；
// 这里在 rehype-highlight 之前把 vue 映射为 html（xml 别名），并用 data 属性保留原始语言名
const LANG_ALIASES: Record<string, string> = { vue: "html" };

type HastLike = {
  type: string;
  children?: HastLike[];
  properties?: { className?: unknown; [key: string]: unknown };
};

function rehypeMapLanguages() {
  const walk = (node: HastLike) => {
    for (const child of node.children ?? []) {
      if (child.type === "element" && Array.isArray(child.properties?.className)) {
        const props = child.properties!;
        const classes = props.className as string[];
        const index = classes.findIndex((c) => c.startsWith("language-"));
        if (index !== -1) {
          const lang = classes[index]!.slice("language-".length);
          const alias = LANG_ALIASES[lang];
          if (alias) {
            // 原位替换为已注册语言；原始语言名写入 data-lang，供头部标识与复制围栏使用
            classes[index] = `language-${alias}`;
            props["data-lang"] = lang;
          }
        }
      }
      walk(child);
    }
  };
  return (tree: Root) => {
    walk(tree as unknown as HastLike);
  };
}

// 递归收集 React 节点中的纯文本（children 已被 react-markdown 渲染为元素树）
function collectText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join("");
  if (isValidElement(node)) {
    return collectText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

interface MarkdownContentProps {
  content: string;
  className?: string;
}

// rehype-highlight 把 language-xxx 加在 pre 的子 code 元素上，需从 children 中提取；
// 若语言被映射过（vue→html），优先使用 data-lang 中保留的原始语言名
function extractLanguage(children: ReactNode): string | null {
  let lang: string | null = null;
  Children.forEach(children, (child) => {
    if (lang || !isValidElement(child)) return;
    const childProps = child.props as {
      className?: string;
      children?: ReactNode;
      "data-lang"?: string;
      dataLang?: string;
    };
    const original = childProps["data-lang"] ?? childProps.dataLang;
    if (original) {
      lang = original;
      return;
    }
    const match = /language-(\w+)/.exec(childProps.className ?? "");
    if (match) {
      lang = match[1];
      return;
    }
    // 兜底：再向下找一层（自定义 code 渲染器可能再包一层）
    lang = extractLanguage(childProps.children);
  });
  return lang;
}

function CodeBlock({
  className,
  children,
  ...props
}: ComponentProps<"pre">) {
  const [copied, setCopied] = useState(false);

  // 优先取子 code 元素上的 language-xxx；未标注语言时由 highlight.js 自动识别
  const language =
    extractLanguage(children) ?? /language-(\w+)/.exec(className ?? "")?.[1] ?? "text";
  // children 已被 react-markdown 渲染为元素树，需递归收集纯文本
  const codeText = collectText(children).replace(/\n$/, "");
  // 复制内容保留 Markdown 围栏（含语言标识），粘贴后可直接还原为代码块
  const copyText = "```" + language + "\n" + codeText + "\n```";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 降级处理
      const textarea = document.createElement("textarea");
      textarea.value = copyText;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // 静默失败
      }
      document.body.removeChild(textarea);
    }
  };

  return (
    <div className="group relative my-4 overflow-hidden rounded-lg border bg-muted/30">
      {/* 代码块头部：语言标识 + 复制按钮 */}
      <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-medium uppercase tracking-wide">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={copied ? "已复制" : "复制代码"}
        >
          {copied ? (
            <>
              <Check className="size-3.5" />
              <span>已复制</span>
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              <span>复制</span>
            </>
          )}
        </button>
      </div>
      {/* 代码块主体：children 即 react-markdown 渲染出的 <code class="hljs language-xxx"> */}
      <pre className={cn("m-0 bg-transparent", className)} {...props}>
        {children}
      </pre>
    </div>
  );
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <article className={cn("markdown-body", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeMapLanguages, rehypeHighlight]}
        components={{
          // 外链统一新窗口打开并阻断引用信息泄露
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          // 代码块使用自定义组件（带头部、语言标识、复制按钮）
          pre: CodeBlock,
          // 行内代码保持原样；透传 data-lang 以便头部显示被映射前的原始语言名
          code: ({ node: _node, className: codeClass, ...rest }) => {
            const dataLang = (rest as Record<string, unknown>)["data-lang"] ?? rest.dataLang;
            const restProps = { ...rest } as Record<string, unknown>;
            delete restProps.dataLang;
            return (
              <code
                className={codeClass}
                {...(dataLang ? { "data-lang": String(dataLang) } : {})}
                {...restProps}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
