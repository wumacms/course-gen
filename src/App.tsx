// 应用入口：路由表 + 全局 Provider（认证上下文 / 主题 / 通知）
// 页面均按懒加载拆分，保证首屏只加载壳层
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { createBrowserRouter, Link, Outlet, RouterProvider, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { EnvGuardBanner } from "@/components/EnvGuardBanner";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

// 懒加载页面模块
const CoursesPage = lazy(() => import("@/pages/CoursesPage").then((m) => ({ default: m.CoursesPage })));
const MyCoursesPage = lazy(() => import("@/pages/MyCoursesPage").then((m) => ({ default: m.MyCoursesPage })));
const GenerateCoursePage = lazy(() => import("@/pages/GenerateCoursePage").then((m) => ({ default: m.GenerateCoursePage })));
const CourseTocPage = lazy(() => import("@/pages/CourseTocPage").then((m) => ({ default: m.CourseTocPage })));
const SectionReaderPage = lazy(() => import("@/pages/SectionReaderPage").then((m) => ({ default: m.SectionReaderPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const LoginPage = lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("@/pages/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import("@/pages/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const AuthCallbackPage = lazy(() => import("@/pages/AuthCallbackPage").then((m) => ({ default: m.AuthCallbackPage })));

/** 全局加载占位 */
function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="size-8 animate-spin text-primary" />
    </div>
  );
}

/** 未找到页面 */
function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="font-serif text-7xl font-black text-primary">404</p>
      <h1 className="mt-4 font-serif text-2xl font-bold">页面不存在</h1>
      <p className="mt-2 text-muted-foreground">你访问的地址可能已被移除或输入有误。</p>
      <Link to="/" className="mt-6 inline-block text-primary underline underline-offset-4">
        返回课程库
      </Link>
    </div>
  );
}

/** 需要登录的路由守卫：未登录时跳转登录页并记录来源 */
function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/login", { replace: true, state: { from: window.location.pathname } });
    }
  }, [loading, isAuthenticated, navigate]);
  if (loading) return <PageLoader />;
  if (!isAuthenticated) return null;
  return <>{children}</>;
}

/** 全站布局：导航 + 环境提示 + 页面出口 */
function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <AppNavbar />
      <EnvGuardBanner />
      <main>
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        课程生成器 CourseGen · AI 生成内容仅供参考
      </footer>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <CoursesPage /> },
      { path: "/courses/:courseId", element: <CourseTocPage /> },
      { path: "/courses/:courseId/sections/:sectionId", element: <SectionReaderPage /> },
      {
        path: "/my",
        element: (
          <RequireAuth>
            <MyCoursesPage />
          </RequireAuth>
        ),
      },
      {
        path: "/generate",
        element: (
          <RequireAuth>
            <GenerateCoursePage />
          </RequireAuth>
        ),
      },
      {
        path: "/settings",
        element: (
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        ),
      },
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
      { path: "/reset-password", element: <ResetPasswordPage /> },
      { path: "/auth/callback", element: <AuthCallbackPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors closeButton />
    </AuthProvider>
  );
}
