// 我的课程列表页：网格 + 分页展示当前用户创建的全部课程
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseCard } from "@/components/CourseCard";
import { Pagination } from "@/components/Pagination";
import { useAuth } from "@/hooks/useAuth";
import { fetchMyCourses, PAGE_SIZE } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase";

export function MyCoursesPage() {
  const { user, isAuthenticated } = useAuth();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["my-courses", user?.id, page],
    queryFn: () => fetchMyCourses(page),
    enabled: isSupabaseConfigured && isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-24 text-center">
        <h1 className="font-serif text-3xl font-bold">我的课程</h1>
        <p className="mt-3 text-muted-foreground">登录后查看你创建的全部课程。</p>
        <Button asChild className="mt-6">
          <Link to="/login">去登录</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-serif text-4xl font-black tracking-tight">我的课程</h1>
          <p className="mt-3 text-muted-foreground">管理你创建的每门课程：目录、小节与发布状态。</p>
        </div>
        <Button asChild size="lg" className="shrink-0">
          <Link to="/generate">
            <PlusCircle className="mr-2 size-5" /> 新建课程
          </Link>
        </Button>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-16 text-center text-muted-foreground">
          你还没有创建课程，
          <Link to="/generate" className="text-primary underline underline-offset-4">
            从这里开始
          </Link>
          。
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
