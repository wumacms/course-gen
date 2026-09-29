// 诊断脚本：模拟预览代理请求头，验证模块图完整性 + 单例不变式：
// 同一共享 chunk（react/react-dom）在 App 与懒加载页面模块中必须引用完全
// 相同的 URL（含 nonce），否则浏览器会加载双实例导致 useState of null。
// 不属于应用运行时代码，可随时删除。
import http from "node:http";
import { transformSync } from "esbuild";

const HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Sec-Fetch-Dest": "script",
  "Sec-Fetch-Mode": "cors",
};

const get = (path, extraHeaders) =>
  new Promise((resolve, reject) => {
    http
      .get(
        { host: "localhost", port: 5173, path, headers: { ...HEADERS, ...extraHeaders } },
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () =>
            resolve({ code: res.statusCode, body, ct: res.headers["content-type"] || "" }),
          );
        },
      )
      .on("error", reject);
  });

function extractModuleUrls(src) {
  const urls = [];
  for (const part of src.split('"')) {
    if (part.startsWith("/__vesa-mod__/") || part.startsWith("/__vesa-deps__/")) {
      urls.push(part);
    }
  }
  return urls;
}

// 1) 入口：取当前代 nonce（文档请求必须用 document 身份，否则命中 Vite 安全拦截）
const entry = await get("/", {
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
});
const m = /[?&]_=([\w-]+)/.exec(entry.body);
if (!m) {
  console.log("FAIL: entry html has no nonce");
  process.exit(1);
}
const n = m[1];
console.log("entry nonce =", n);

// 2) 同代加载 App 与 CoursesPage，比对各自引用的 react chunk URL
const app = await get(`/__vesa-mod__/App-tsx.js?_=${n}`);
const courses = await get(`/__vesa-mod__/pages/CoursesPage-tsx.js?_=${n}`);

function reactChunksOf(body) {
  return new Set(
    extractModuleUrls(body)
      .filter((u) => u.startsWith("/__vesa-deps__/"))
      .map((u) => u.split("?")[0]),
  );
}
const a = reactChunksOf(app.body);
const c = reactChunksOf(courses.body);
console.log("App deps-chunks:", [...a].join(", "));
console.log("CoursesPage deps-chunks:", [...c].join(", "));

// 3) 关键不变式：CoursesPage 引用的共享 chunk，其完整 URL（含 query）必须
//    与 App 传递链路里出现的 URL 一致。检查响应体中的 import 语句 URL 全等。
function fullUrls(body) {
  return new Set(extractModuleUrls(body));
}
const appUrls = fullUrls(app.body);
const coursesUrls = fullUrls(courses.body);
let mismatch = 0;
for (const u of coursesUrls) {
  if (!u.startsWith("/__vesa-deps__/")) continue;
  const base = u.split("?")[0];
  for (const au of appUrls) {
    if (au.split("?")[0] === base && au !== u) {
      console.log("NONCE-MISMATCH", base, "|App:", au, "|Courses:", u);
      mismatch++;
    }
  }
}

// 4) CoursesPage 里的裸 /src/ import 必须为零（否则会命中直出分支）
if (/(?:from|import)\s*"[^"\s]*\/src\/[^"\s]*"/.test(courses.body)) {
  console.log("RAW-SRC-IMPORT-LEAK in CoursesPage");
  mismatch++;
}

// 5) 语法校验两个模块
for (const [name, r] of [["App", app], ["CoursesPage", courses]]) {
  if (r.code !== 200 || !r.ct.includes("javascript")) {
    console.log("BAD-STATUS", name, r.code, r.ct);
    mismatch++;
    continue;
  }
  try {
    transformSync(r.body, { loader: "js", format: "esm" });
  } catch (e) {
    console.log("SYNTAX-ERR", name, String(e.message).slice(0, 120));
    mismatch++;
  }
}

console.log(mismatch === 0 ? "PASS: singleton invariant holds" : `FAIL: ${mismatch} issue(s)`);
process.exit(mismatch === 0 ? 0 : 1);
