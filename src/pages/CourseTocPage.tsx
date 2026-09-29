// 公开课章节目录页
// - 课程标题以封面图为背景展示
// - 所有者可生成章节目录、逐节生成讲义内容
// - 小节状态存于数据库，通过 Supabase Realtime 实时更新；
//   并行生成数量 = generating 状态的小节数，上限 8（服务端原子领取保证不超限）
import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  EyeOff,
  Globe,
  ListTree,
  Loader2,
  Lock,
  RefreshCw,
  Rocket,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { useSectionRealtime } from "@/hooks/useSectionRealtime";
import { fetchCourse, fetchOutline, updateCourse } from "@/lib/db";
import { generateOutlineForCourse, generateSection, generateSectionsInParallel } from "@/lib/generation";
import { isSupabaseConfigured } from "@/lib/supabase";
import { MAX_PARALLEL, SECTION_STATUS_META, type Section } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CourseTocPage() {
  const { courseId = "" } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // 课程基本信息
  const courseQuery = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => fetchCourse(courseId),
    enabled: isSupabaseConfigured && Boolean(courseId),
  });

  // 章节目录（含小节），Realtime 触发此查询重新拉取
  const outlineQuery = useQuery({
    queryKey: ["outline", courseId],
    queryFn: () => fetchOutline(courseId),
    enabled: isSupabaseConfigured && Boolean(courseId),
  });

  useSectionRealtime(courseId, isAuthenticated);

  const course = courseQuery.data;
  const isOwner = Boolean(course && user && course.owner_id === user.id);
  const sections: Section[] = (outlineQuery.data ?? []).flatMap((ch) => ch.sections);
  const generatingCount = sections.filter((s) => s.status === "generating").length;
  const completedCount = sections.filter((s) => s.status === "completed").length;
  const progress = sections.length > 0 ? Math.round((completedCount / sections.length) * 100) : 0;

  // 生成章节目录（解析 + 入库 + 状态回写都在 generateOutlineForCourse 内完成）
  const outlineMutation = useMutation({
    mutationFn: () => generateOutlineForCourse(courseId),
    onSuccess: (count) => {
      toast.success(`章节目录已生成，共 ${count} 个小节`);
      queryClient.invalidateQueries({ queryKey: ["outline", courseId] });
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // 触发单个小节生成（服务端原子领取 + 并发上限，重复点击安全）
  const sectionMutation = useMutation({
    mutationFn: (sectionId: string) => generateSection(sectionId),
    onSuccess: (res) => {
      if (res.already) toast.info("该小节已完成");
      else toast.success("小节生成完成");
      // 立即刷新一次以显示最新状态（Realtime 随后持续同步）
      queryClient.invalidateQueries({ queryKey: ["outline", courseId] });
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // 一键并行生成所有未完成小节：并发池大小 = min(剩余数, 8)
  const [batchRunning, setBatchRunning] = useState(false);
  const pendingSections = sections.filter(
    (s) => s.status === "pending" || s.status === "failed"
  );
  const batchMutation = useMutation({
    mutationFn: async () => {
      setBatchRunning(true);
      try {
        await generateSectionsInParallel(
          pendingSections.map((s) => s.id),
          Math.min(pendingSections.length, MAX_PARALLEL)
        );
      } finally {
        setBatchRunning(false);
      }
    },
    onSuccess: () => {
      toast.success("批量生成任务已结束，失败的小节可单独重试");
      queryClient.invalidateQueries({ queryKey: ["outline", courseId] });
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
    },
    onError: () => toast.error("批量生成中断，请刷新后重试"),
  });

  // 全部小节完成后，把课程状态标记为 completed（仅所有者触发，幂等安全）
  useEffect(() => {
    if (
      isOwner &&
      course &&
      course.status !== "completed" &&
      sections.length > 0 &&
      completedCount === sections.length
    ) {
      updateCourse(courseId, { status: "completed" })
        .then(() => queryClient.invalidateQueries({ queryKey: ["course", courseId] }))
        .catch(() => undefined);
    }
  }, [isOwner, course, sections.length, completedCount, courseId, queryClient]);

  // 切换公开状态（仅所有者）
  const visibilityMutation = useMutation({
    mutationFn: (isPublic: boolean) => updateCourse(courseId, { is_public: isPublic }),
    onSuccess: () => {
      toast.success("可见性已更新");
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
    },
    onError: () => toast.error("更新失败"),
  });

  const handleGenerateSection = (section: Section) => {
    if (generatingCount >= MAX_PARALLEL) {
      toast.warning(`并行生成已达上限（${MAX_PARALLEL} 节），请稍候再试`);
      return;
    }
    sectionMutation.mutate(section.id);
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center text-muted-foreground">
        请先配置 Supabase 环境变量。
      </div>
    );
  }

  if (courseQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="mt-8 space-y-4">
          {[60, 40, 55, 35].map((w, i) => (
            <Skeleton key={i} className="h-12" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (courseQuery.isError || !course) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <XCircle className="mx-auto mb-4 size-10 text-destructive" />
        <h1 className="font-serif text-2xl font-bold">课程不存在或无权访问</h1>
        <Button variant="outline" className="mt-6" onClick={() => navigate("/")}>
          返回公开课库
        </Button>
      </div>
    );
  }

  const chapters = outlineQuery.data ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* —— 课程 Hero：封面作为标题背景 —— */}
      <section className="relative overflow-hidden rounded-2xl border shadow-md">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={course.cover_url ? { backgroundImage: `url(${course.cover_url})` } : undefined}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/25" aria-hidden />
        <div className="relative flex min-h-[16rem] flex-col justify-end gap-3 p-6 text-white sm:min-h-[18rem] sm:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="bg-white/15 text-white backdrop-blur">
              {course.status === "completed" ? "已完成" : course.status === "outlined" ? "目录已生成" : "创作中"}
            </Badge>
            {isOwner && (
              <Badge variant="secondary" className="bg-white/15 text-white backdrop-blur">
                {course.is_public ? (
                  <><Globe className="mr-1 size-3" /> 公开</>
                ) : (
                  <><Lock className="mr-1 size-3" /> 私密</>
                )}
              </Badge>
            )}
          </div>
          <h1 className="font-serif text-3xl font-black leading-tight tracking-tight drop-shadow sm:text-4xl">
            {course.title}
          </h1>
          {course.subtitle && (
            <p className="max-w-2xl text-sm text-white/85 sm:text-base">{course.subtitle}</p>
          )}
        </div>
      </section>

      {/* —— 工具条：目录生成 / 并行状态 / 公开开关 —— */}
      <Card className="mt-6 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ListTree className="size-5 text-primary" />
            <div>
              <h2 className="font-serif text-lg font-bold">课程目录</h2>
              <p className="text-xs text-muted-foreground">
                {chapters.length > 0
                  ? `${chapters.length} 章 · ${sections.length} 节 · 已完成 ${completedCount} 节`
                  : "目录尚未生成"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isOwner && generatingCount > 0 && (
              <Badge variant="outline" className="gap-1.5 border-sky-500/50 text-sky-600 dark:text-sky-400">
                <Loader2 className="size-3 animate-spin" />
                并行生成 {generatingCount}/{MAX_PARALLEL}
              </Badge>
            )}
            {isOwner && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Switch
                  checked={course.is_public}
                  onCheckedChange={(v) => visibilityMutation.mutate(v)}
                  aria-label="公开课程"
                />
                {course.is_public ? "已发布到公开课库" : "发布到公开课库"}
              </label>
            )}
            {isOwner && chapters.length === 0 && (
              <Button
                onClick={() => outlineMutation.mutate()}
                disabled={outlineMutation.isPending}
              >
                {outlineMutation.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 size-4" />
                )}
                生成课程目录
              </Button>
            )}
            {isOwner && chapters.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm("重新生成将覆盖现有目录并清空已生成的讲义，确定继续？")) {
                    outlineMutation.mutate();
                  }
                }}
                disabled={outlineMutation.isPending}
              >
                <RefreshCw className={cn("mr-2 size-4", outlineMutation.isPending && "animate-spin")} />
                重新生成目录
              </Button>
            )}
            {/* 一键并行生成：并发池触发所有未完成小节，数量上限 8 */}
            {isOwner &&
              chapters.length > 0 &&
              pendingSections.length > 0 &&
              !batchRunning &&
              generatingCount === 0 && (
                <Button
                  size="sm"
                  onClick={() => batchMutation.mutate()}
                  disabled={batchMutation.isPending}
                >
                  <Rocket className="mr-2 size-4" />
                  一键并行生成（{pendingSections.length} 节，最多 {MAX_PARALLEL} 路并发）
                </Button>
              )}
            {batchRunning && (
              <Badge variant="outline" className="gap-1.5 border-sky-500/50 text-sky-600 dark:text-sky-400">
                <Loader2 className="size-3 animate-spin" />
                批量生成中，剩余 {Math.max(sections.length - completedCount, 0)} 节
              </Badge>
            )}
          </div>
        </div>
        {sections.length > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <Progress value={progress} className="h-2" />
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {progress}%
            </span>
          </div>
        )}
      </Card>

      {/* —— 目录主体 —— */}
      <div className="mt-6 space-y-4 pb-16">
        {outlineQuery.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : chapters.length === 0 ? (
          <div className="rounded-lg border border-dashed p-14 text-center">
            <p className="text-muted-foreground">
              {isOwner
                ? "点击右上角「生成课程目录」，AI 将根据标题规划章节与小节。"
                : "该课程目录暂不可见。"}
            </p>
          </div>
        ) : (
          chapters.map((chapter, chapterIndex) => {
            const open = expanded[chapter.id] ?? chapterIndex === 0;
            return (
              <Card key={chapter.id} className="overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-accent/50"
                  onClick={() => setExpanded((m) => ({ ...m, [chapter.id]: !open }))}
                  aria-expanded={open}
                >
                  {open ? (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-serif text-sm font-bold text-primary">
                    第 {chapterIndex + 1} 章
                  </span>
                  <span className="flex-1 font-semibold">{chapter.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {chapter.sections.filter((s) => s.status === "completed").length}/
                    {chapter.sections.length} 节
                  </span>
                </button>

                {open && (
                  <Separator />
                )}

                {open && (
                  <ul className="divide-y">
                    {chapter.sections.map((section, sectionIndex) => {
                      const meta = SECTION_STATUS_META[section.status];
                      const canRead = section.status === "completed";
                      return (
                        <li
                          key={section.id}
                          className="flex items-center gap-3 px-5 py-3 pl-12"
                        >
                          <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
                            {chapterIndex + 1}.{sectionIndex + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            {canRead ? (
                              <Link
                                to={`/courses/${courseId}/sections/${section.id}`}
                                className="truncate text-sm font-medium underline-offset-4 hover:text-primary hover:underline"
                              >
                                {section.title}
                              </Link>
                            ) : (
                              <span className="truncate text-sm text-muted-foreground">
                                {section.title}
                              </span>
                            )}
                            {section.status === "failed" && section.error && (
                              <p className="mt-0.5 truncate text-xs text-destructive">{section.error}</p>
                            )}
                          </div>
                          <span
                            className={cn(
                              "inline-flex shrink-0 items-center gap-1.5 text-xs",
                              meta.text
                            )}
                          >
                            <span className={cn("size-1.5 rounded-full", meta.dot)} />
                            {meta.label}
                          </span>
                          {isOwner && (
                            <Button
                              size="sm"
                              variant={canRead ? "ghost" : "outline"}
                              className="shrink-0"
                              disabled={
                                section.status === "generating" ||
                                section.status === "queued" ||
                                sectionMutation.isPending
                              }
                              onClick={() =>
                                canRead
                                  ? navigate(`/courses/${courseId}/sections/${section.id}`)
                                  : handleGenerateSection(section)
                              }
                            >
                              {section.status === "generating" || section.status === "queued" ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : canRead ? (
                                "阅读"
                              ) : section.status === "failed" ? (
                                "重试"
                              ) : (
                                "生成"
                              )}
                            </Button>
                          )}
                          {!isOwner && canRead && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => navigate(`/courses/${courseId}/sections/${section.id}`)}
                            >
                              阅读
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })
        )}

        {isOwner && course.is_public === false && chapters.length > 0 && (
          <div className="flex items-center justify-center gap-2 pt-4 text-xs text-muted-foreground">
            <EyeOff className="size-3.5" />
            课程当前为私密状态，仅自己可见。在上方开启发布后可出现在公开课库。
          </div>
        )}
        {!isOwner && (
          <div className="flex items-center justify-center pt-4 text-xs text-muted-foreground">
            <Users className="mr-1.5 size-3.5" />
            你正在以访客身份浏览该公开课。
          </div>
        )}
      </div>
    </div>
  );
}
