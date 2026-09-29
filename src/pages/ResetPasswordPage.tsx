// 重置密码页面：通过邮件链接换取会话后，设置新密码
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export function ResetPasswordPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("密码至少 6 位");
      return;
    }
    if (password !== confirm) {
      toast.error("两次输入的密码不一致");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await getSupabase().auth.updateUser({ password });
      if (error) throw error;
      sessionStorage.removeItem("cg_recovery");
      toast.success("密码已更新，请使用新密码登录");
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="重置密码"
      subtitle="为你的账号设置一个新密码"
      footer={
        <Link to="/login" className="font-medium text-primary underline underline-offset-4">
          返回登录
        </Link>
      }
    >
      {!isSupabaseConfigured ? (
        <Alert variant="destructive">
          <AlertDescription>Supabase 环境变量未配置。</AlertDescription>
        </Alert>
      ) : !isAuthenticated ? (
        <Alert>
          <AlertDescription>
            还没有有效的重置会话。请先通过邮件中的重置链接打开本页；
            若链接失效，可重新发起{" "}
            <Link to="/forgot-password" className="text-primary underline">
              找回密码
            </Link>
            。
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="rp-password">新密码</Label>
            <Input
              id="rp-password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="至少 6 位"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rp-confirm">确认新密码</Label>
            <Input
              id="rp-confirm"
              type="password"
              required
              autoComplete="new-password"
              placeholder="再次输入新密码"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />} 保存新密码
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
