import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import vesaErrorReporter from "./.vesa/vite-error-plugin.js";
import vesaDesignMode from "./.vesa/vite-design-mode-plugin.js";
import path from "path";
import fs from "fs";

const hasEsaConfig = fs.existsSync(path.resolve(__dirname, "esa.jsonc"));

/**
 * dev 模式 deps 缓存污染防护。
 *
 * 历史故障链：optimizeDeps.include 缺项 → 页面加载时运行期发现新依赖触发
 * re-optimize → 换代窗口内旧 URL 的模块请求落到 SPA fallback / 代理错误页，
 * 返回 index.html；Vite 对 deps 默认下发 immutable 强缓存，HTML 副本被浏览器
 * 永久缓存，此后每次加载都在 JS 模块位置解析到 '<'，抛 SyntaxError。
 *
 * 本插件在 dev 中间件最前段拦截 deps 请求：
 * 1. 文件不存在 → 立即 404 空 JS（no-store）。绝不等待、绝不穿透到 fallback，
 *    避免慢响应触发代理层 HTML 错误页（那本身就是新的污染源）；
 * 2. 文件存在   → 拦截 writeHead，把响应头降级为 no-cache，
 *    让缓存副本每次回源校验，中毒副本无法长期复用；
 * 3. 主文档响应附带 Clear-Site-Data: "cache"，尽力驱逐浏览器本源的历史
 *    中毒缓存（Chromium 在可信源生效）。
 */
function depsCacheGuard() {
  const DEPS_RE = /^\/node_modules\/\.vite[^/]*\/(?:.*\/)?deps\//;
  return {
    name: "deps-cache-guard",
    enforce: "pre" as const,
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url ?? "";
        const reqUrl = url.split("?")[0];
        if (reqUrl === "/" || reqUrl === "/index.html") {
          try {
            res.setHeader("Clear-Site-Data", '"cache"');
          } catch {
            /* headers already sent */
          }
          next();
          return;
        }
        if (!DEPS_RE.test(url)) {
          next();
          return;
        }
        // 关键：剥离条件请求头，禁止服务器回 304。
        // 浏览器存有 deps 的中毒副本（Vary: Origin 的模块请求变体，
        // 在优化器崩溃窗口期被以 HTML 形式缓存）。若允许 304 再验证，
        // 浏览器会原样复用那份 HTML 体。强制每次回 200 完整 JS 体。
        delete req.headers["if-none-match"];
        delete req.headers["if-modified-since"];
        const rel = decodeURIComponent(reqUrl).replace(/^\//, "");
        if (!fs.existsSync(path.resolve(process.cwd(), rel))) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/javascript");
          res.setHeader("Cache-Control", "no-store");
          res.end("// dep chunk missing; reload to pick up the new bundle");
          return;
        }
        const origWriteHead = res.writeHead.bind(res);
        res.writeHead = function (code: number, ...args: any[]) {
          try {
            res.setHeader("Cache-Control", "no-cache, must-revalidate");
          } catch {
            /* headers already sent */
          }
          return origWriteHead(code as any, ...(args as any[]));
        };
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // 全新固定缓存目录：deps URL 前缀整体换代，浏览器/代理中旧目录名下的
  // 历史中毒副本从此不可能命中。该名称不再变动，配合下方完整的
  // optimizeDeps.include（启动后不再发生运行期 re-optimize），
  // browserHash 保持确定性，不会再出现换代窗口。
  cacheDir: path.resolve(__dirname, "node_modules/.vite-fixed"),
  server: {
    host: "::",
    port: 5173,
    hmr: {
      overlay: false,
    },
    ...(hasEsaConfig
      ? {
          proxy: {
            "/api": {
              target: "http://127.0.0.1:18080",
              changeOrigin: true,
            },
          },
        }
      : {}),
  },
  plugins: [
    ...(mode === "development" ? [depsCacheGuard()] : []),
    vesaErrorReporter(),
    vesaDesignMode(),
    tailwindcss(),
    react(),
  ].filter(Boolean),
  // 预打包 src 中真实 import 的全部运行时依赖（含懒加载页面与 shadcn/ui
  // 组件间接引用），启动时一次完成优化，彻底消除运行期二次 re-optimize
  // 触发换代导致的旧 chunk 失效与缓存污染。
  optimizeDeps: {
    include: [
      "react",
      "react-dom/client",
      "react/jsx-dev-runtime",
      "react-router-dom",
      "@tanstack/react-query",
      "@supabase/supabase-js",
      "class-variance-authority",
      "clsx",
      "tailwind-merge",
      "lucide-react",
      "next-themes",
      "sonner",
      "react-markdown",
      "remark-gfm",
      "cmdk",
      "embla-carousel-react",
      "input-otp",
      "react-day-picker",
      "react-hook-form",
      "react-resizable-panels",
      "recharts",
      "vaul",
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-aspect-ratio",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-context-menu",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-hover-card",
      "@radix-ui/react-label",
      "@radix-ui/react-menubar",
      "@radix-ui/react-navigation-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-progress",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slider",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toast",
      "@radix-ui/react-toggle",
      "@radix-ui/react-toggle-group",
      "@radix-ui/react-tooltip",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
