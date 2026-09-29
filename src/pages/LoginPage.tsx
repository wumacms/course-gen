// 登录页面：邮箱 + 密码
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";

export function LoginPage() {
  const { signIn, configured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 登录成功后回到来源页（未登录被拦截时记录在 state.from）
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!configured) {
      toast.error("请先配置 Supabase 环境变量");
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      toast.success("登录成功，欢迎回来");
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="登录"
      subtitle="使用注册邮箱登录，继续你的课程生成之旅"
      footer={
        <>
          还没有账号？{" "}
          <Link to="/register" className="font-medium text-primary underline underline-offset-4">
            注册新账号
          </Link>
        </>
      }
    >
      {!configured && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>Supabase 环境变量未配置，暂时无法登录。请参考 README 完成配置。</AlertDescription>
        </Alert>
      )}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="login-email">邮箱</Label>
          <Input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">密码</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              忘记密码？
            </Link>
          </div>
          <Input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="输入密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting || !configured}>
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />} 登录
        </Button>
      </form>
    </AuthShell>
  );
}
