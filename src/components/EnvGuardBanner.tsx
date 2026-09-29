// Supabase 环境未配置时的全局提示条
// 需求要求：开发者没有配置 Supabase 环境变量时，必须给出清晰提示与配置指引
import { AlertTriangle } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase";

export function EnvGuardBanner() {
  if (isSupabaseConfigured) return null;
  return (
    <div className="border-b border-amber-500/40 bg-amber-500/10">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="text-amber-800 dark:text-amber-300">
          <p className="font-semibold">尚未配置 Supabase 环境变量，网站功能不可用</p>
          <p className="mt-1 leading-relaxed">
            请在项目根目录创建 <code className="rounded bg-amber-500/20 px-1">.env.local</code>，填写{" "}
            <code className="rounded bg-amber-500/20 px-1">VITE_SUPABASE_URL</code> 与{" "}
            <code className="rounded bg-amber-500/20 px-1">VITE_SUPABASE_ANON_KEY</code>，
            并执行 <code className="rounded bg-amber-500/20 px-1">docs/supabase-migrations.sql</code>{" "}
            初始化数据库、部署 <code className="rounded bg-amber-500/20 px-1">functions/generate-course-content</code> Edge Function。
            详细说明见项目 README。
          </p>
        </div>
      </div>
    </div>
  );
}
