// 认证页面共享外壳：左侧品牌视觉 + 右侧表单区（移动端仅表单）
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { GraduationCap } from "lucide-react";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl grid-cols-1 items-stretch gap-0 px-4 py-8 lg:grid-cols-2 lg:gap-10">
      {/* 品牌视觉区：大号衬线标语 + 装饰性目录线条 */}
      <div className="relative hidden flex-col justify-between overflow-hidden rounded-2xl bg-primary p-10 text-primary-foreground lg:flex">
        <div>
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary-foreground/15">
              <GraduationCap className="size-5" />
            </span>
            <span className="font-serif text-lg font-bold">课程生成器 CourseGen</span>
          </Link>
          <h2 className="mt-16 font-serif text-4xl font-black leading-tight">
            一个主题，
            <br />
            一门完整的课程。
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-6 text-primary-foreground/80">
            输入你想学习的主题，AI 为你规划章节大纲，并逐节撰写讲义。目录、正文、封面，一次生成。
          </p>
        </div>
        {/* 装饰：模拟目录树线条 */}
        <div aria-hidden className="pointer-events-none select-none space-y-2 font-mono text-xs text-primary-foreground/45">
          <p>第1章 认识你的课程蓝图</p>
          <p className="pl-4">1.1 从主题到大纲</p>
          <p className="pl-4">1.2 AI 提示词工程</p>
          <p>第2章 并行生成与实时状态</p>
          <p className="pl-4">2.1 小节状态机</p>
          <p className="pl-4">2.2 Realtime 订阅</p>
        </div>
      </div>

      {/* 表单区 */}
      <div className="flex flex-col justify-center py-6 lg:py-0">
        <div className="mx-auto w-full max-w-md">
          <h1 className="font-serif text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
