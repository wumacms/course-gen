import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import vesaErrorReporter from "./.vesa/vite-error-plugin.js";
import vesaDesignMode from "./.vesa/vite-design-mode-plugin.js";
import path from "path";
import fs from "fs";

const hasEsaConfig = fs.existsSync(path.resolve(__dirname, "esa.jsonc"));

/**
 * dev 模式模块交付防护（自建通道版）。
 *
 * 已实测定位的故障链：
 * 1. 预览代理层会把 pathname 含 `.tsx` / `.ts` / `.css` 等源扩展名片段的
 *    请求「按磁盘原始文件」直接应答（浏览器里实测拿到未编译的原始 TSX，
 *    且响应无 charset 头），完全绕过 Vite 编译 → V8 解析 `getElementById(…)!`
 *    的非空断言即抛 `SyntaxError: missing ) after argument list` → 白屏。
 *    因此页面模块 URL 必须连 `.tsx` 字样都不出现：统一编码为
 *    /__vesa-mod__/<path><-ext>.js（点全部换成连字符）。
 * 2. deps 走 /node_modules/… 绝对路径同样有按路径留存中毒副本的风险，
 *    改为 /__vesa-deps__/ 前缀由本中间件直接读盘交付。
 * 3. 任何模块响应若为 HTML（SPA fallback / 代理错误页），熔断改写为
 *    抛错 JS + no-store，缓存层永远不可能再存到 HTML。
 *
 * 所有通道均：剥离条件请求头禁 304、Cache-Control: no-store、
 * URL 追加「启动标识+页面加载代次」nonce，主文档附带 Clear-Site-Data 尽力驱逐历史副本。
 */
function depsCacheGuard() {
  const DEPS_PREFIX = "/__vesa-deps__/";
  const MOD_PREFIX = "/__vesa-mod__/";
  const DEPS_DIR = path.resolve(process.cwd(), "node_modules/.vite-fixed/deps");

  // 页面模块虚拟 URL：/src/a/b.tsx → /__vesa-mod__/a/b-tsx.js
  // （pathname 不含任何源扩展名片段，跳出代理「按源扩展名直出原始文件」规则）
  const encodeRel = (rel: string) => `${rel.replace(/\./g, "-")}.js`;
  const decodeRel = (enc: string) => {
    const noJs = enc.endsWith(".js") ? enc.slice(0, -3) : enc;
    const idx = noJs.lastIndexOf("-");
    if (idx < 0) return null;
    return `${noJs.slice(0, idx)}.${noJs.slice(idx + 1)}`;
  };

  // 未迁移 URL 的兜底拦截（历史 HTML 中毒副本等）
  const MODULE_RE = /\.(?:js|mjs|cjs|ts|tsx|jsx|css)(?:\?|$)/;

  // 磁盘/Vite 生成的绝对 deps URL：/node_modules/.vite-fixed/deps/<file>[?query]
  const DEPS_ABS_RE = /\/node_modules\/\.vite-fixed\/deps\/([^"'()\s?#]+)(\?[^"'()\s]*)?/g;
  // deps 文件内部的相对 chunk 互引："./chunk-X.js[?query]"
  const DEPS_REL_RE = /"(\.\/[^"'\s()?]+\.js(?:\.map)?)(?:\?([^"'()\s]*))?"/g;

  // nonce = 启动标识 + 页面加载代次。每次主文档请求 bump 代次，刷新即得
  // 全新入口 URL。
  // 关键约束：模块响应体内嵌的 import URL 必须沿用「发起该请求的 URL 上已有的
  // nonce」，绝不能用响应时刻的全局当前代——否则懒加载模块（如 lazy 页面的
  // 共享 react chunk）会被盖上新一代 nonce，浏览器视其为不同模块，react 与
  // react-dom 分裂成双实例，触发 "Cannot read properties of null
  // (reading 'useState')"。stampModuleUrls 因此显式接收 nonce 参数。
  const bootId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  let gen = 0;
  const nonce = () => `${bootId}g${gen}`;
  // 从请求 URL query 中提取已携带的 nonce（?_=xxx 或 &_=xxx）
  const nonceFromUrl = (rawUrl: string): string | null => {
    const m = /[?&]_=([\w-]+)/.exec(rawUrl);
    return m ? m[1] : null;
  };

  // 响应体中出现的本地模块 URL 字面量："(/…|./…).js|ts|tsx|jsx|mjs|css[?query]"
  // 同时覆盖 JS 的 from "…" 与 index.html 的 src="…" / href="…"。
  const MODULE_STR_RE =
    /(["'])((?:\/|\.\/)[^"'\\\s]+\.(?:js|mjs|cjs|ts|tsx|jsx|css))(\?[^"'\\]*)?\1/g;

  /** deps URL 迁到自建前缀（绕开 Vite 流水线与 hash 比对） */
  function migrateDepsPrefix(text: string): string {
    const out = text.replace(DEPS_ABS_RE, (_w, file: string, query?: string) => {
      const raw = query ? query.slice(1) : "";
      return `${DEPS_PREFIX}${file}${raw ? `?${raw}` : ""}`;
    });
    return out.replace(DEPS_REL_RE, (_w, rel: string, query?: string) => {
      const file = rel.replace(/^\.\//, "");
      return `"${DEPS_PREFIX}${file}${query ? `?${query}` : ""}"`;
    });
  }

  /** /src/** 页面模块 URL 迁到编码通道（pathname 不出现 .tsx 等源扩展名） */
  function migrateSrcPrefix(text: string): string {
    return text.replace(
      /(["'])(\/src\/[^"'\\\s?#]+?)(\?[^"'\\\s]*)?\1/g,
      (_w, quote: string, p: string, query?: string) => {
        const raw = query ? query.slice(1) : "";
        const rel = p.slice("/src/".length);
        return `${quote}${MOD_PREFIX}${encodeRel(rel)}${raw ? `?${raw}` : ""}${quote}`;
      },
    );
  }

  /** 给响应体中所有本地模块 URL 追加指定 nonce（幂等，保留原 query）。
   *  nonce 来自「发起本次响应的请求 URL」而非全局当前代，保证同一页面
   *  会话内共享依赖（react/react-dom chunk）URL 恒定、模块单例成立。 */
  function stampModuleUrls(text: string, n: string): string {
    return text.replace(MODULE_STR_RE, (_w, quote: string, p: string, query?: string) => {
      const raw = query ? query.slice(1) : "";
      if (raw.includes("_=")) return `${quote}${p}${query ?? ""}${quote}`;
      const suffix = raw ? `?${raw}&_=${n}` : `?_=${n}`;
      return `${quote}${p}${suffix}${quote}`;
    });
  }

  /** 完整迁移链：deps 前缀 → 页面模块前缀 → nonce（显式传入） */
  function migrateAll(text: string, n: string): string {
    return stampModuleUrls(migrateSrcPrefix(migrateDepsPrefix(text)), n);
  }

  const looksLikeHtml = (body: Buffer, contentType: string) => {
    if (contentType.includes("html")) return true;
    if (body.length === 0) return false;
    const head = body.subarray(0, 256).toString("utf8").trimStart().toLowerCase();
    return head.startsWith("<!doctype") || head.startsWith("<html");
  };

  /** HTML 熔断：把任何伪装成模块的 HTML 响应改写为抛错 JS */
  const poisonBody = (url: string) =>
    `/* vesa module guard: ${JSON.stringify(url)} returned non-JS content */\nthrow new Error("Vesa module guard: poisoned response for ${url.replace(/[^\w./-]/g, "")}");\n`;

  return {
    name: "deps-cache-guard",
    enforce: "pre" as const,
    // 入口 HTML：/src/main.tsx 迁到自建通道并加 nonce，
    // 否则首屏仍会被代理按 .tsx 扩展名直出原始 TSX
    transformIndexHtml(html: string) {
      return migrateAll(html, nonce());
    },
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url = req.url ?? "";
        const reqUrl = url.split("?")[0];

        // 主文档：换代 + 驱逐历史中毒缓存 + 禁止任何层缓存 HTML。
        // 换代安全：下游模块响应继承请求 URL 上的 nonce，同一会话内
        // 所有共享 chunk URL 恒定，不会分裂出双实例。
        if (reqUrl === "/" || reqUrl === "/index.html") {
          gen += 1;
          try {
            res.setHeader("Clear-Site-Data", '"cache"');
            res.setHeader("Cache-Control", "no-store");
          } catch {
            /* headers already sent */
          }
          next();
          return;
        }

        // ── 自建 deps 通道：直接读盘，永不返回 HTML，也不做 hash 比对。
        //    内嵌 URL 的 nonce 继承自本次请求 URL（保持共享 chunk 单例）。
        //    若文件尚未生成（Vite 预打包未完成），则透传给 Vite 原生处理。 ──
        if (reqUrl.startsWith(DEPS_PREFIX)) {
          const rel = decodeURIComponent(reqUrl.slice(DEPS_PREFIX.length));
          const abs = path.resolve(DEPS_DIR, rel);
          const isJs = !abs.endsWith(".map");
          const reqNonce = nonceFromUrl(url) ?? nonce();
          let body: Buffer | null = null;
          try {
            if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
              body = fs.readFileSync(abs);
            } else {
              // 兼容 Vite 生成的带 ?v= 后缀名形态（极少见，兜底再试一次）
              const alt = abs.replace(/\?.*$/, "");
              if (fs.existsSync(alt) && fs.statSync(alt).isFile()) {
                body = fs.readFileSync(alt);
              }
            }
          } catch {
            body = null;
          }
          if (body === null) {
            // deps 文件不存在 → 透传给 Vite 原生处理（触发预打包或返回原生错误）
            next();
            return;
          }
          if (isJs) body = Buffer.from(migrateAll(body.toString("utf8"), reqNonce), "utf8");
          res.statusCode = 200;
          res.setHeader(
            "Content-Type",
            abs.endsWith(".map") ? "application/json; charset=utf-8" : "text/javascript; charset=utf-8",
          );
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Content-Length", String(body.length));
          res.end(body);
          return;
        }

        // ── 自建页面模块通道：/__vesa-mod__/<enc>.js → 直接调用 Vite
        //    transformRequest 拿编译产物下发。绝不把请求交给 Vite 的 HTTP
        //    中间件链——实测证明：只要请求头 Accept 含 text/html（预览代理
        //    转发浏览器脚本请求时会带上），Vite 的 htmlFallback/静态兜底
        //    就会绕过编译流水线、从磁盘直出未编译的原始 TSX，导致浏览器
        //    报 SyntaxError: missing ) after argument list。transformRequest
        //    是编译管线的函数级入口，与请求头完全无关，产物必定是合法 JS。 ──
        if (reqUrl.startsWith(MOD_PREFIX)) {
          const rel = decodeURIComponent(reqUrl.slice(MOD_PREFIX.length));
          const decoded = decodeRel(rel);
          const reply = (code: number, bodyText: string) => {
            const buf = Buffer.from(bodyText, "utf8");
            res.statusCode = code;
            try {
              res.setHeader("Content-Type", "text/javascript; charset=utf-8");
              res.setHeader("Cache-Control", "no-store");
              res.setHeader("Content-Length", String(buf.length));
            } catch {
              /* headers already sent */
            }
            res.end(buf);
          };
          if (decoded === null) {
            reply(404, "// malformed module url\n");
            return;
          }
          const modUrl = `/src/${decoded}`;
          try {
            const result = await server.transformRequest(modUrl, { ssr: false });
            if (!result || typeof result.code !== "string" || result.code.length === 0) {
              reply(500, `/* vesa module guard: no transform result for ${modUrl} */\nthrow new Error("Vesa module guard: transform returned nothing for ${modUrl}");\n`);
              return;
            }
            reply(200, migrateAll(result.code, nonceFromUrl(url) ?? nonce()));
          } catch (err: any) {
            const msg = String(err?.message ?? err).replace(/\*\//g, "*\\/");
            reply(500, `/* vesa module guard: transform failed for ${modUrl} */\nthrow new Error("Vesa module guard: ${msg}");\n`);
          }
          return;
        }

        if (!MODULE_RE.test(req.url ?? "")) {
          next();
          return;
        }

        // 剥离条件请求头：禁止 304 让浏览器/代理复用可能中毒的副本
        delete req.headers["if-none-match"];
        delete req.headers["if-modified-since"];

        // 拦截响应体：缓冲 → URL 迁移 → HTML 熔断 → no-store 下发。
        // 注意：Vite 的静态文件走 createReadStream，可能在 writeHead 之后才
        // end()；此时头部已冲刷、Content-Length 已定，改写响应体会导致长度
        // 不一致且 setHeader 抛 ERR_HTTP_HEADERS_SENT。因此一旦检测到
        // headersSent 即切换为透传模式，不再缓冲/改写。
        const chunks: Buffer[] = [];
        let passthrough = false;
        const origEnd = res.end.bind(res);
        const origWrite = res.write.bind(res);
        const origWriteHead = res.writeHead.bind(res);

        const safeSetHeader = (k: string, v: string) => {
          if (res.headersSent) return;
          try {
            res.setHeader(k, v);
          } catch {
            /* ignore */
          }
        };

        res.writeHead = function (code: number, ...args: any[]) {
          // 若调用方显式带了头对象，先合并进 res（保持语义），再统一降级缓存头
          try {
            const hdrArg = args.find((a: any) => a && typeof a === "object" && !Array.isArray(a));
            if (hdrArg) for (const [k, v] of Object.entries(hdrArg)) res.setHeader(k, v as any);
            res.setHeader("Cache-Control", "no-store");
          } catch {
            /* headers already sent */
          }
          return origWriteHead(code as any, ...(args as any[]));
        };

        res.write = function (chunk: any, ...args: any[]) {
          if (res.headersSent) {
            passthrough = true;
            return (origWrite as any)(chunk, ...args);
          }
          if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
          return true;
        };

        res.end = function (chunk?: any, ...args: any[]) {
          if (passthrough || res.headersSent) {
            return (origEnd as any)(chunk, ...args);
          }
          if (chunk && chunk !== res.encoding) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
          }
          const body = Buffer.concat(chunks);
          const ct = String(res.getHeader("Content-Type") ?? "");
          const finalUrl = req.url ?? "";

          if (looksLikeHtml(body, ct)) {
            // HTML 熔断：模块位置绝不能交付 HTML
            const js = Buffer.from(poisonBody(finalUrl), "utf8");
            res.statusCode = 500;
            try {
              res.setHeader("Content-Type", "text/javascript; charset=utf-8");
              res.setHeader("Cache-Control", "no-store");
              res.setHeader("Content-Length", String(js.length));
            } catch {
              /* ignore */
            }
            return (origEnd as any)(js);
          }

          let out = body;
          const isJsBody = ct.includes("javascript") || ct.includes("ecmascript");
          if (isJsBody) {
            const migrated = migrateAll(
              body.toString("utf8"),
              nonceFromUrl(finalUrl) ?? nonce(),
            );
            out = Buffer.from(migrated, "utf8");
          }
          try {
            res.setHeader("Content-Type", ct || "text/javascript; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Content-Length", String(out.length));
          } catch {
            /* ignore */
          }
          if (res.statusCode === 304) res.statusCode = 200;
          return (origEnd as any)(out);
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
