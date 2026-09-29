// 应用顶部导航：品牌区、页面链接、主题切换与登录状态
import { Link, NavLink, useNavigate } from "react-router-dom";
import { GraduationCap, Loader2, LogOut, Moon, Settings, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

/** 导航项定义：to 路径 + 文案；needAuth 为 true 时仅登录后可见 */
const NAV_ITEMS = [
  { to: "/", label: "公开课", needAuth: false },
  { to: "/my", label: "我的课程", needAuth: true },
  { to: "/generate", label: "生成课程", needAuth: true },
  { to: "/settings", label: "系统配置", needAuth: true },
];

export function AppNavbar() {
  const { isAuthenticated, user, signOut, loading } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();

  const theme = resolvedTheme ?? "light";
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("已退出登录");
      navigate("/");
    } catch {
      toast.error("退出失败，请重试");
    }
  };

  const email = user?.email ?? "";
  const initial = (user?.user_metadata?.display_name || email || "?").slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        {/* 品牌 */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="size-5" />
          </span>
          <span className="font-serif text-xl font-bold tracking-tight">
            课程生成器
            <span className="ml-1.5 hidden text-xs font-sans font-normal text-muted-foreground sm:inline">
              CourseGen
            </span>
          </span>
        </Link>

        {/* 桌面导航 */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.filter((item) => !item.needAuth || isAuthenticated).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* 右侧操作区 */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="切换主题">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>

          {loading ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full outline-none ring-ring focus-visible:ring-2" aria-label="账户菜单">
                  <Avatar className="size-9">
                    <AvatarFallback className="bg-primary/10 font-medium text-primary">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate font-normal">
                  <span className="block text-sm">{user?.user_metadata?.display_name || "学习者"}</span>
                  <span className="block truncate text-xs text-muted-foreground">{email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate("/settings")}>
                  <Settings className="mr-2 size-4" /> 系统配置
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 size-4" /> 退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="sm" onClick={() => navigate("/login")}>
              登录 / 注册
            </Button>
          )}
        </div>
      </div>

      {/* 移动端导航（小屏横滑） */}
      <nav className="flex gap-1 overflow-x-auto border-t px-4 py-2 md:hidden">
        {NAV_ITEMS.filter((item) => !item.needAuth || isAuthenticated).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium",
                isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
