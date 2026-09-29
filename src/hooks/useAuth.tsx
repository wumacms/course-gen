// 认证上下文：封装 Supabase 邮箱登录/注册/登出与会话状态
// 未配置 Supabase 环境变量时全部安全降级为「未登录 + 空操作」，由 UI 统一提示
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

interface AuthContextValue {
  /** Supabase 环境变量是否已配置 */
  configured: boolean;
  /** 初始化会话中 */
  loading: boolean;
  user: User | null;
  session: Session | null;
  /** 是否已登录 */
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** 发送密码重置邮件 */
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** 把 Supabase 错误码翻译为中文提示 */
function friendlyAuthError(err: { code?: string; message: string }): Error {
  const map: Record<string, string> = {
    invalid_credentials: "邮箱或密码不正确",
    email_not_confirmed: "邮箱尚未确认，请先到邮箱中点击确认链接",
    user_already_exists: "该邮箱已注册，请直接登录或找回密码",
    weak_password: "密码强度不足，至少 6 位",
    over_quota: "注册请求过于频繁，请稍后再试",
  };
  return new Error(map[err.code ?? ""] ?? err.message ?? "操作失败，请重试");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabase();

    // 初始化：读取本地持久化会话
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    // 监听登录态变化（含邮箱确认、密码重置回调后的自动登录）
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) throw friendlyAuthError(error);
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    // 注册成功后 Supabase 会发送确认邮件；redirect 指向应用首页
    const { error } = await getSupabase().auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw friendlyAuthError(error);
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw friendlyAuthError(error);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      user,
      session,
      isAuthenticated: Boolean(user),
      signIn,
      signUp,
      signOut,
      resetPassword,
    }),
    [loading, user, session, signIn, signUp, signOut, resetPassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** 读取认证上下文；组件中必须包裹在 AuthProvider 内 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return ctx;
}
