#!/usr/bin/env node
/**
 * 平台文件刷新脚本 — 在沙箱恢复后执行。
 *
 * 职责：
 * 1. 用 /home/user/.vesa-platform/ 中的最新版本覆盖 workspace/.vesa/
 * 2. 扫描 .vesa/ 中所有 vite-*-plugin.js，幂等注入到 vite.config.ts
 *
 * 命名规则（自动推导）：
 *   vite-design-mode-plugin.js → 去前缀/后缀 → design-mode → vesaDesignMode
 *   vite-error-plugin.js       → error         → vesaError
 *
 * 设计原则：
 * - 幂等：以文件路径字符串作为幂等 key，import 路径已存在则跳过
 * - 非破坏性：只在确认缺失时才修改文件
 * - 容错：任何步骤失败均只打印警告，不抛出异常（不影响沙箱启动流程）
 */

const fs = require("fs");
const path = require("path");

const WORKSPACE = "/home/user/workspace";
const PLATFORM_DIR = "/home/user/.vesa-platform";
const VITE_CONFIG = path.join(WORKSPACE, "vite.config.ts");

// ── 工具函数 ──────────────────────────────────────────────────────────────

/**
 * 将 kebab-case 转为 camelCase，首字母小写。
 * 例：design-mode → designMode，error → error
 */
function kebabToCamel(str) {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * 从插件文件名派生 import 标识符。
 * 例：vite-design-mode-plugin.js → vesaDesignMode
 *     vite-error-plugin.js       → vesaError
 */
function pluginFileToIdentifier(filename) {
  // 去掉 vite- 前缀和 -plugin.js 后缀
  const inner = filename.replace(/^vite-/, "").replace(/-plugin\.js$/, "");
  const camel = kebabToCamel(inner);
  return "vesa" + camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * 收集 .vesa/ 目录中所有需要注入的插件文件信息。
 * 只处理 vite-*-plugin.js 格式，跳过自身（patch-vite-config.js）。
 */
function collectPlugins(vesaDir) {
  if (!fs.existsSync(vesaDir)) return [];
  return fs
    .readdirSync(vesaDir)
    .filter((f) => /^vite-.+-plugin\.js$/.test(f))
    .map((filename) => ({
      filename,
      identifier: pluginFileToIdentifier(filename),
      importPath: `./.vesa/${filename}`,
    }));
}

// ── 步骤 1：同步 .vesa/ 平台文件 ─────────────────────────────────────────

function syncPlatformFiles() {
  if (!fs.existsSync(PLATFORM_DIR)) {
    console.warn("[platform-patch] .vesa-platform dir not found, skip file sync");
    return;
  }

  const targetDir = path.join(WORKSPACE, ".vesa");
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  let synced = 0;
  for (const file of fs.readdirSync(PLATFORM_DIR)) {
    const src = path.join(PLATFORM_DIR, file);
    const dst = path.join(targetDir, file);
    try {
      fs.copyFileSync(src, dst);
      synced++;
    } catch (e) {
      console.warn(`[platform-patch] failed to copy ${file}: ${e.message}`);
    }
  }
  if (synced > 0) {
    console.log(`[platform-patch] synced ${synced} file(s) to .vesa/`);
  }
}

// ── 步骤 2：patch vite.config.ts ─────────────────────────────────────────

function patchViteConfig() {
  if (!fs.existsSync(VITE_CONFIG)) {
    console.warn("[platform-patch] vite.config.ts not found, skip patch");
    return;
  }

  const plugins = collectPlugins(path.join(WORKSPACE, ".vesa"));
  if (plugins.length === 0) {
    console.log("[platform-patch] no vite-*-plugin.js found in .vesa/, skip patch");
    return;
  }

  let content = fs.readFileSync(VITE_CONFIG, "utf-8");
  let dirty = false;

  for (const { filename, identifier, importPath } of plugins) {
    // 幂等检查：以 import 路径字符串判断是否已注入
    if (content.includes(filename)) {
      console.log(`[platform-patch] ${filename} already in vite.config.ts, skip`);
      continue;
    }

    // 插入 import 语句：放在第一个 import 行之前
    const importLine = `import ${identifier} from '${importPath}';`;
    const withImport = content.replace(/^(import\s)/m, `${importLine}\n$1`);
    if (withImport === content) {
      console.warn(`[platform-patch] could not locate import anchor for ${filename}, skip`);
      continue;
    }

    // 在 plugins 数组头部插入 identifier()
    const withPlugin = withImport.replace(/plugins\s*:\s*\[/, `plugins: [${identifier}(), `);
    if (withPlugin === withImport) {
      console.warn(`[platform-patch] could not locate plugins array for ${filename}, skip`);
      continue;
    }

    content = withPlugin;
    dirty = true;
    console.log(`[platform-patch] injected ${identifier}() from ${filename}`);
  }

  if (dirty) {
    fs.writeFileSync(VITE_CONFIG, content, "utf-8");
    console.log("[platform-patch] vite.config.ts updated");
  }
}

// ── 入口 ──────────────────────────────────────────────────────────────────

try {
  syncPlatformFiles();
} catch (e) {
  console.warn("[platform-patch] syncPlatformFiles error:", e.message);
}

try {
  patchViteConfig();
} catch (e) {
  console.warn("[platform-patch] patchViteConfig error:", e.message);
}
