// Supabase 客户端单例封装
// 环境变量未配置时不抛异常，而是提供 isSupabaseConfigured 供 UI 层做友好提示
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Vite 环境变量：Supabase 项目 URL 与匿名公钥（可在 Supabase 控制台获取）
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** 是否已配置 Supabase 环境变量 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClient | null = null;

/**
 * 获取 Supabase 客户端实例。
 * 未配置环境变量时会抛出错误，调用方应先检查 isSupabaseConfigured。
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 环境变量未配置（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）");
  }
  if (!client) {
    // 使用 PKCE 流程以支持邮箱确认 / 密码找回链接中的授权码交换
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return client;
}

/** 供 Edge Function 名称引用，集中管理避免拼写不一致 */
export const GENERATE_FUNCTION_NAME = "generate-course-content";
