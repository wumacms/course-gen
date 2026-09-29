// 认证回调页：处理邮箱确认 / 密码重置邮件中的链接
// PKCE 流程下 Supabase 会带上 ?code=xxx，需要在此换取会话后跳转
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState("正在验证链接…");
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const code = params.get("code");
    // 兼容 implicit 流程：token 直接出现在 hash 中（#access_token=...）
    const hash = window.location.hash;

    if (!isSupabaseConfigured) {
      setMessage("Supabase 未配置，无法完成验证。");
      setTimeout(() => navigate("/login", { replace: true }), 1500);
      return;
    }

    const supabase = getSupabase();

    const isRecovery = hash.includes("type=recovery") || sessionStorage.getItem("cg_recovery") === "1";

    // supabase-js 初始化时可能已自动完成授权码换取；先查现有会话，避免重复换码报错
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate(isRecovery ? "/reset-password" : "/", { replace: true });
        return;
      }
      if (code) {
        supabase.auth
          .exchangeCodeForSession(code)
          .then(({ error }) => {
            if (error) {
              setMessage("链接已失效或无效，请重新操作。");
              setTimeout(() => navigate("/login", { replace: true }), 2000);
              return;
            }
            navigate(isRecovery ? "/reset-password" : "/", { replace: true });
          });
        return;
      }
      setMessage("未找到有效的验证参数。");
      setTimeout(() => navigate("/login", { replace: true }), 1800);
    });
  }, [params, navigate]);



  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
