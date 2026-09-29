// 公开课详情阅读页：展示单个小节的 Markdown 讲义
// - 小节未完成时，所有者可直接在本页触发生成并实时看到状态
// - 提供上一章/下一章导航（按目录顺序）
import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BookOpen, Loader2, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownContent } from "@/components/MarkdownContent";
import { useAuth } from "@/hooks/useAuth";
import { useSectionRealtime } from "@/hooks/useSectionRealtime";
import { fetchCourse, fetchOutline, fetchSection } from "@/lib/db";
import { generateSection } from "@/lib/generation";
import { isSupabaseConfigured } from "@/lib/supabase";
import { SECTION_STATUS_META } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SectionReaderPage() {
  const { courseId = "", sectionId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const sectionQuery = useQuery({
    queryKey: ["section", sectionId],
    queryFn: () => fetchSection(sectionId),
    enabled: isSupabaseConfigured && Boolean(sectionId),
  });
  const courseQuery = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => fetchCourse(courseId),
    enabled: isSupabaseConfigured && Boolean(courseId),
  });
  const outlineQuery = useQuery({
    queryKey: ["outline", courseId],
    queryFn: () => fetchOutline(courseId),
    enabled: isSupabaseConfigured && Boolean(courseId),
  });

  // 本页同样订阅小节状态：所有者在此触发重试时可实时刷新
  useSectionRealtime(courseId, true);

  const section = sectionQuery.data;
  const course = courseQuery.data;
  const isOwner = Boolean(course && user && course.owner_id === user.id);

  // 计算当前小节在扁平目录序列中的前后邻居，用于上一章/下一章导航
  const flat = (outlineQuery.data ?? []).flatMap((ch, ci) =>
    ch.sections.map((s, si) => ({ section: s, label: `${ci + 1}.${si + 1}` }))
  );
  const idx = flat.findIndex((f) => f.section.id === sectionId);
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;

  const generateMutation = useMutation({
    mutationFn: () => generateSection(sectionId),
    onSuccess: () => {
      toast.success("已开始生成，完成后自动展示");
      queryClient.invalidateQueries({ queryKey: ["section", sectionId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center text-muted-foreground">
        请先配置 Supabase 环境变量。
      </div>
    );
  }

  if (sectionQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Skeleton className="mb-4 h-6 w-40" />
        <Skeleton className="mb-8 h-10 w-3/4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-4" style={{ width: `${95 - i * 6}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (sectionQuery.isError || !section) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <XCircle className="mx-auto mb-4 size-10 text-destructive" />
        <h1 className="font-serif text-2xl font-bold">小节不存在或无权访问</h1>
        <Button variant="outline" className="mt-6" onClick={() => navigate(`/courses/${courseId}`)}>
          返回课程目录
        </Button>
      </div>
    );
  }

  const meta = SECTION_STATUS_META[section.status];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* 页眉：返回、课程名、状态 */}
      <div className="mb-2 flex items-center justify-between">
        <Link
          to={`/courses/${courseId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> 课程目录
        </Link>
        <span className={cn("inline-flex items-center gap-1.5 text-xs", meta.text)}>
          <span className={cn("size-1.5 rounded-full", meta.dot)} />
          {meta.label}
        </span>
      </div>

      <h1 className="font-serif text-3xl font-black leading-tight tracking-tight">
        {section.title}
      </h1>
      {course && (
        <p className="mt-2 text-sm text-muted-foreground">
          选自《{course.title}》 · {section.word_count > 0 ? `${section.word_count} 字` : "讲义"}
        </p>
      )}

      <div className="my-6 h-px bg-border" />

      {/* 未完成状态的占位与操作 */}
      {section.status !== "completed" ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          {section.status === "generating" ? (
            <>
              <Loader2 className="mx-auto mb-4 size-10 animate-spin text-sky-500" />
              <p className="font-medium">讲义生成中…</p>
              <p className="mt-2 text-sm text-muted-foreground">
                AI 正在撰写本节内容，完成后本页会自动展示，无需刷新。
              </p>
            </>
          ) : section.status === "failed" ? (
            <>
              <XCircle className="mx-auto mb-4 size-10 text-destructive" />
              <p className="font-medium">上次生成失败</p>
              {section.error && (
                <p className="mx-auto mt-2 max-w-md text-sm text-destructive/90">{section.error}</p>
              )}
              {isOwner && (
                <Button
                  className="mt-6"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                >
                  <Sparkles className="mr-2 size-4" /> 重新生成
                </Button>
              )}
            </>
          ) : (
            <>
              <BookOpen className="mx-auto mb-4 size-10 text-muted-foreground/50" />
              <p className="font-medium">本节讲义尚未生成</p>
              {isOwner ? (
                <Button
                  className="mt-6"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-4" />
                  )}
                  生成本节讲义
                </Button>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">请等待课程作者完成本节内容。</p>
              )}
            </>
          )}
        </div>
      ) : (
        <MarkdownContent content={section.content ?? ""} />
      )}

      {/* 上一节 / 下一节导航 */}
      <div className="mt-12 flex items-stretch justify-between gap-4 border-t pt-6">
        {prev ? (
          <Button
            variant="outline"
            className="max-w-[48%] justify-start"
            onClick={() => navigate(`/courses/${courseId}/sections/${prev.section.id}`)}
          >
            <ArrowLeft className="mr-2 size-4 shrink-0" />
            <span className="truncate">{prev.label} {prev.section.title}</span>
          </Button>
        ) : (
          <span />
        )}
        {next && (
          <Button
            variant="outline"
            className="max-w-[48%]"
            onClick={() => navigate(`/courses/${courseId}/sections/${next.section.id}`)}
          >
            <span className="truncate">{next.label} {next.section.title}</span>
            <ArrowRight className="ml-2 size-4 shrink-0" />
          </Button>
        )}
      </div>

      {section.status === "completed" && (
        <div className="mt-8 text-center">
          <Badge variant="outline" className="text-xs">
            由 AI 生成，请注意甄别内容准确性
          </Badge>
        </div>
      )}
    </div>
  );
}
