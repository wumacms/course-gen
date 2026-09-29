// 公开课列表页（首页）：网格 + 分页展示所有用户生成成功的公开课程
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpenCheck, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseCard } from "@/components/CourseCard";
import { Pagination } from "@/components/Pagination";
import { fetchPublicCourses, PAGE_SIZE } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase";

export function CoursesPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["public-courses", page],
    queryFn: () => fetchPublicCourses(page),
    enabled: isSupabaseConfigured,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* 页头：展示型标题 + 行动入口 */}
      <header className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            <Sparkles className="size-3.5" /> AI 驱动的课程创作
          </p>
          <h1 className="font-serif text-4xl font-black tracking-tight md:text-5xl">
            公开课库
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            这里汇集了社区创作者用 AI 生成的完整课程。点开任意一门，即可阅读章节目录与小节讲义。
          </p>
        </div>
        <Button asChild size="lg" className="shrink-0">
          <Link to="/generate">
            <BookOpenCheck className="mr-2 size-5" /> 生成我的课程
          </Link>
        </Button>
      </header>

      {!isSupabaseConfigured ? (
        <div className="rounded-lg border border-dashed p-16 text-center text-muted-foreground">
          请先配置 Supabase 环境变量后浏览课程库。
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-dashed p-16 text-center">
          <p className="mb-4 text-muted-foreground">课程列表加载失败，请检查网络或 Supabase 配置。</p>
          <Button variant="outline" onClick={() => refetch()}>
            重试
          </Button>
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-16 text-center text-muted-foreground">
          还没有公开发布的课程，
          <Link to="/generate" className="text-primary underline underline-offset-4">
            去生成第一门课程
          </Link>
          吧。
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
          <div className="mt-10">
            <Pagination
              page={page}
              pageCount={data.length}
              pageSize={PAGE_SIZE}
              onChange={(p) => {
                setPage(p);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
