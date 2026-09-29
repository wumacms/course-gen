// 课程生成页：三步流程（生成标题+封面 → 生成章节目录 → 逐节生成内容）
// 步骤 1：输入课程主题，调用 DeepSeek 生成正式课程标题与一句话简介，
//         标题与封面保存成功后跳转到课程目录页（封面作为标题背景图）。
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { createCourse, updateCourse } from "@/lib/db";
import { buildCoverUrl, generateCourseTitle, makeCoverSeed } from "@/lib/generation";

export function GenerateCoursePage() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    const value = topic.trim();
    if (!value) {
      toast.error("请先输入课程主题");
      return;
    }
    if (!user) {
      toast.error("登录状态已失效，请重新登录");
      return;
    }
    setSubmitting(true);
    try {
      // 1. 先建课程记录（状态 draft），保证 AI 调用失败时也有可追溯的记录
      const course = await createCourse(user.id, value);
      // 2. 调用 DeepSeek 生成正式标题
      const title = await generateCourseTitle(value);
      // 3. 封面使用 picsum.photos 的稳定 seed 地址（无需上传，直接作为外链存储）
      const seed = makeCoverSeed();
      await updateCourse(course.id, {
        title,
        cover_url: buildCoverUrl(seed),
        cover_seed: seed,
        status: "titled",
      });
      toast.success("课程标题与封面已生成");
      // 4. 跳转到课程目录页继续生成章节目录
      navigate(`/courses/${course.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-serif text-3xl font-bold">生成新课程</h1>
        <p className="mt-3 text-muted-foreground">登录后即可创建属于你的 AI 课程。</p>
        <Button className="mt-6" onClick={() => navigate("/login")}>
          去登录
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="mb-10 text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
          Step 1 · 课程立项
        </p>
        <h1 className="font-serif text-4xl font-black tracking-tight">你想开一门什么课？</h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          输入一个主题或想法，AI 会为你拟定正式的课程标题与简介，并自动配上封面。
          随后可继续生成章节目录与小节讲义。
        </p>
      </div>

      <Card className="border-primary/20 shadow-sm">
        <CardContent className="pt-6">
          <form onSubmit={handleGenerate} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="topic">课程主题</Label>
              <Input
                id="topic"
                placeholder="例如：给前端工程师的 Rust 入门"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={submitting}
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">
                描述越具体，生成的目录越贴合你的预期。
              </p>
            </div>

            {submitting && (
              <div className="space-y-3 rounded-lg border border-dashed p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> 正在调用 DeepSeek 生成课程标题…
                </div>
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={submitting || !isSupabaseConfigured}>
              {submitting ? (
                <Loader2 className="mr-2 size-5 animate-spin" />
              ) : (
                <Wand2 className="mr-2 size-5" />
              )}
              生成课程标题与封面
            </Button>
            {!isSupabaseConfigured && (
              <p className="text-center text-xs text-destructive">
                Supabase 环境变量未配置，无法调用生成服务。
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {/* 后续步骤说明，帮助用户理解整体流程 */}
      <ol className="mt-10 grid gap-4 text-sm sm:grid-cols-3">
        {[
          { n: "1", t: "标题与封面", d: "AI 拟定标题，picsum 自动配图" },
          { n: "2", t: "章节目录", d: "一键生成章节与小节结构" },
          { n: "3", t: "小节讲义", d: "按需生成，支持最多 8 节并行" },
        ].map((s) => (
          <li key={s.n} className="rounded-lg border bg-card p-4">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary font-serif text-base font-bold text-primary-foreground">
              {s.n}
            </span>
            <p className="mt-3 font-semibold">{s.t}</p>
            <p className="mt-1 text-muted-foreground">{s.d}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
