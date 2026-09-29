// 找回密码页面：输入邮箱，发送密码重置邮件
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, MailQuestion } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";

export function ForgotPasswordPage() {
  const { resetPassword, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!configured) {
      toast.error("请先配置 Supabase 环境变量");
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发送失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="找回密码"
      subtitle="输入注册邮箱，我们会发送密码重置链接"
      footer={
        <>
          想起密码了？{" "}
          <Link to="/login" className="font-medium text-primary underline underline-offset-4">
            返回登录
          </Link>
        </>
      }
    >
      {!configured && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>Supabase 环境变量未配置，暂时无法找回密码。</AlertDescription>
        </Alert>
      )}
      {sent ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertDescription>
            重置链接已发送到 <strong>{email}</strong>。
            请在邮箱中点击链接，并回到本站「重置密码」页面设置新密码。
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex items-center gap-3 text-muted-foreground">
            <MailQuestion className="size-8 shrink-0 text-primary" />
            <p className="text-sm leading-6">
              邮件链接有效期有限，请尽快操作。若长时间未收到，请检查垃圾邮件。
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="forgot-email">注册邮箱</Label>
            <Input
              id="forgot-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting || !configured}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />} 发送重置链接
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
