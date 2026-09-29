// 注册页面：邮箱 + 昵称 + 密码（Supabase 会发送邮箱确认邮件）
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";

export function RegisterPage() {
  const { signUp, configured } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!configured) {
      toast.error("请先配置 Supabase 环境变量");
      return;
    }
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
      await signUp(email.trim(), password, displayName.trim() || email.split("@")[0]);
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "注册失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="注册成功" subtitle="我们已向你的邮箱发送确认邮件">
        <div className="space-y-6">
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertDescription>
              请打开邮箱 <strong>{email}</strong> 点击确认链接完成注册。
              若收件箱没有，请检查垃圾邮件文件夹。确认后即可登录。
            </AlertDescription>
          </Alert>
          <Button className="w-full" variant="secondary" onClick={() => navigate("/login")}>
            前往登录
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="创建账号"
      subtitle="注册后即可使用 AI 生成属于你的课程"
      footer={
        <>
          已有账号？{" "}
          <Link to="/login" className="font-medium text-primary underline underline-offset-4">
            直接登录
          </Link>
        </>
      }
    >
      {!configured && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>Supabase 环境变量未配置，暂时无法注册。请参考 README 完成配置。</AlertDescription>
        </Alert>
      )}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="reg-email">邮箱</Label>
          <Input
            id="reg-email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reg-name">昵称</Label>
          <Input
            id="reg-name"
            maxLength={24}
            placeholder="课程作者显示名称（可选）"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="reg-password">密码</Label>
            <Input
              id="reg-password"
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
            <Label htmlFor="reg-confirm">确认密码</Label>
            <Input
              id="reg-confirm"
              type="password"
              required
              autoComplete="new-password"
              placeholder="再次输入密码"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={submitting || !configured}>
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />} 注册
        </Button>
      </form>
    </AuthShell>
  );
}
