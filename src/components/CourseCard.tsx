// 课程卡片：公开课/我的课程网格中的展示单元
// 封面使用 picsum 生成的稳定图片；标题区叠加衬线字体突出学院气质
import { Link } from "react-router-dom";
import { BookOpen, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Course } from "@/lib/types";
import { cn } from "@/lib/utils";

/** 课程状态 → 中文标签与色调 */
const STATUS_META: Record<
  Course["status"],
  { label: string; className: string }
> = {
  draft: { label: "草稿", className: "bg-muted text-muted-foreground" },
  titled: {
    label: "待生成目录",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  outlined: {
    label: "已生成目录",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
  generating: {
    label: "内容生成中",
    className: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  },
  completed: {
    label: "已完成",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
};

interface CourseCardProps {
  course: Course;
  /** 是否展示状态徽标（我的课程页使用） */
  showStatus?: boolean;
}

export function CourseCard({ course, showStatus }: CourseCardProps) {
  const meta = STATUS_META[course.status];
  return (
    <Link
      className="group block focus-visible:outline-none"
      to={`/courses/${course.id}`}
    >
      <Card className="h-full overflow-hidden transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-lg group-focus-visible:ring-2 ring-ring">
        {/* 封面区：16:9 图片，加载失败时降级为主色渐变 */}
        <div className="relative aspect-[16/9] overflow-hidden bg-muted">
          {course.cover_url ? (
            <img
              src={course.cover_url}
              alt={`《${course.title}》封面`}
              loading="lazy"
              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-primary/10">
              <BookOpen className="size-10 text-primary/40" />
            </div>
          )}
          {showStatus && (
            <Badge
              className={cn(
                "absolute left-3 top-3 border-0 text-xs",
                meta.className,
              )}
            >
              {meta.label}
            </Badge>
          )}
        </div>
        <div className="p-4">
          <h3 className="font-serif text-lg font-bold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {course.title}
          </h3>
          {course.subtitle && (
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground line-clamp-2">
              {course.subtitle}
            </p>
          )}
          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <BookOpen className="size-3.5" />
              {new Date(course.created_at).toLocaleDateString("zh-CN")}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" />
              {course.is_public ? "公开课" : "私密"}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
