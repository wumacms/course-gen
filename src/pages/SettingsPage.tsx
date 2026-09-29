// 系统配置页：DeepSeek API Key、模型、并行上限与三套提示词模板
// 提示词模板使用固定引用变量（${course_title} 等），配置页提供变量速查与占位符校验
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { fetchSettings, saveSettings } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  DEFAULT_OUTLINE_PROMPT,
  DEFAULT_SECTION_PROMPT,
  DEFAULT_TITLE_PROMPT,
  PROMPT_VARIABLES,
} from "@/lib/prompts";
import { MAX_PARALLEL, type CourseSettings } from "@/lib/types";

/** 可编辑的表单状态（与配置行对应，Key 允许空串） */
interface SettingsForm {
  deepseek_api_key: string;
  model: string;
  title_prompt: string;
  outline_prompt: string;
  section_prompt: string;
  max_concurrency: number;
}

/** 常用 DeepSeek 模型选项 */
const MODEL_OPTIONS = ["deepseek-chat", "deepseek-reasoner"];

/** 校验模板中的 ${变量} 是否都在支持列表内，返回未知变量名 */
function findUnknownVars(template: string): string[] {
  const known = new Set(PROMPT_VARIABLES.map((v) => v.name));
  const found = template.matchAll(/\$\{(\w+)\}/g);
  const unknown: string[] = [];
  for (const m of found) {
    if (!known.has(m[1]) && !unknown.includes(m[1])) unknown.push(m[1]);
  }
  return unknown;
}

export function SettingsPage() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [showKey, setShowKey] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["settings", user?.id],
    queryFn: () => fetchSettings(),
    enabled: isSupabaseConfigured && isAuthenticated,
  });

  // 拉取到配置后初始化表单
  useEffect(() => {
    if (settingsQuery.data) {
      const s = settingsQuery.data;
      setForm({
        deepseek_api_key: s.deepseek_api_key,
        model: s.model,
        title_prompt: s.title_prompt,
        outline_prompt: s.outline_prompt,
        section_prompt: s.section_prompt,
        max_concurrency: s.max_concurrency,
      });
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (patch: Partial<CourseSettings>) => saveSettings(user!.id, patch),
    onSuccess: () => {
      toast.success("配置已保存");
      queryClient.invalidateQueries({ queryKey: ["settings", user?.id] });
    },
    onError: (err: Error) => toast.error(`保存失败：${err.message}`),
  });

  // 各模板中未知变量（用于内联警告）
  const unknownVars = useMemo(() => {
    if (!form) return {};
    return {
      title: findUnknownVars(form.title_prompt),
      outline: findUnknownVars(form.outline_prompt),
      section: findUnknownVars(form.section_prompt),
    };
  }, [form]);

  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center text-muted-foreground">
        请先配置 Supabase 环境变量，再在此页面管理 AI 生成配置。
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center text-muted-foreground">
        登录后可配置你的 DeepSeek API Key 与提示词模板。
      </div>
    );
  }

  if (settingsQuery.isLoading || !form) {
    return (
      <div className="mx-auto flex max-w-3xl items-center justify-center px-4 py-24">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const patch = (p: Partial<SettingsForm>) => setForm((f) => (f ? { ...f, ...p } : f));

  const handleSave = () => {
    if (!form.deepseek_api_key.trim()) {
      toast.error("请填写 DeepSeek API Key");
      return;
    }
    const allUnknown = [...unknownVars.title, ...unknownVars.outline, ...unknownVars.section];
    if (allUnknown.length > 0) {
      toast.error(`提示词包含未知变量：${allUnknown.map((v) => "${" + v + "}").join("、")}`);
      return;
    }
    saveMutation.mutate({
      deepseek_api_key: form.deepseek_api_key.trim(),
      model: form.model,
      title_prompt: form.title_prompt,
      outline_prompt: form.outline_prompt,
      section_prompt: form.section_prompt,
      max_concurrency: form.max_concurrency,
    });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="size-6 text-primary" />
          <h1 className="font-serif text-3xl font-bold tracking-tight">系统配置</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          配置你的 DeepSeek API Key 与生成提示词。Key 仅保存在你的账户配置中，
          调用时由服务端 Edge Function 读取，前端页面不会直接携带它访问 DeepSeek。
        </p>
      </header>

      {/* —— DeepSeek 连接配置 —— */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-primary" /> DeepSeek 连接
          </CardTitle>
          <CardDescription>API Key 可在 platform.deepseek.com 创建</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="api-key">DeepSeek API Key</Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showKey ? "text" : "password"}
                placeholder="sk-..."
                value={form.deepseek_api_key}
                onChange={(e) => patch({ deepseek_api_key: e.target.value })}
                className="pr-10 font-mono"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 size-9 text-muted-foreground"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>模型</Label>
            <Select value={form.model} onValueChange={(v) => patch({ model: v })}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              deepseek-chat 速度快，适合讲义批量生成；deepseek-reasoner 推理更深但更慢。
            </p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>并行生成小节数上限</Label>
              <span className="font-serif text-lg font-bold tabular-nums text-primary">
                {form.max_concurrency}
              </span>
            </div>
            <Slider
              min={1}
              max={MAX_PARALLEL}
              step={1}
              value={[form.max_concurrency]}
              onValueChange={([v]) => patch({ max_concurrency: v })}
            />
            <p className="text-xs text-muted-foreground">
              同时处于「生成中」的小节数量上限（1–{MAX_PARALLEL}）。超出的请求会被服务端拒绝，
              界面上会实时显示当前并行数。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* —— 提示词变量速查 —— */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="size-4 text-primary" /> 提示词可用变量
          </CardTitle>
          <CardDescription>在下方模板中以 {"${变量名}"} 形式引用，生成时自动替换为实际内容</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {PROMPT_VARIABLES.map((v) => (
              <div key={v.name} className="flex items-baseline gap-2 text-sm">
                <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary">
                  {`\${${v.name}}`}
                </code>
                <span className="text-muted-foreground">{v.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* —— 三套提示词模板 —— */}
      <PromptCard
        title="课程标题提示词"
        hint="用于把用户输入的主题打磨为正式课程标题"
        value={form.title_prompt}
        onChange={(v) => patch({ title_prompt: v })}
        unknowns={unknownVars.title}
        onReset={() => patch({ title_prompt: DEFAULT_TITLE_PROMPT })}
      />
      <PromptCard
        title="章节目录提示词"
        hint="用于生成章节与小节结构，输出必须为 JSON"
        value={form.outline_prompt}
        onChange={(v) => patch({ outline_prompt: v })}
        unknowns={unknownVars.outline}
        onReset={() => patch({ outline_prompt: DEFAULT_OUTLINE_PROMPT })}
      />
      <PromptCard
        title="小节内容提示词"
        hint="用于生成单个小节的 Markdown 讲义"
        value={form.section_prompt}
        onChange={(v) => patch({ section_prompt: v })}
        unknowns={unknownVars.section}
        onReset={() => patch({ section_prompt: DEFAULT_SECTION_PROMPT })}
      />

      <div className="sticky bottom-4 mt-8 flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Save className="mr-2 size-4" />
          )}
          保存配置
        </Button>
      </div>
    </div>
  );
}

/** 单个提示词编辑卡片：模板编辑 + 未知变量警告 + 恢复默认 */
interface PromptCardProps {
  title: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  unknowns: string[];
  onReset: () => void;
}

function PromptCard({ title, hint, value, onChange, unknowns, onReset }: PromptCardProps) {
  const id = `prompt-${title}`;
  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{hint}</CardDescription>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onReset} className="text-muted-foreground">
          <RotateCcw className="mr-1.5 size-3.5" /> 恢复默认
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor={id} className="sr-only">
          {title}
        </Label>
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={8}
          className="font-mono text-sm leading-6"
        />
        {unknowns.length > 0 ? (
          <p className="text-xs text-destructive">
            包含未知变量：{unknowns.map((v) => "${" + v + "}").join("、")}，请修正后再保存。
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            当前引用了 {countVars(value)} 个变量。
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** 统计模板中出现的变量引用个数 */
function countVars(template: string): number {
  return new Set([...template.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1])).size;
}
