// 小节生成状态实时订阅
// 技术方案刻意保持简单：小节状态保存在数据库中，Edge Function 回写状态，
// 前端订阅 coursegen_sections 的 UPDATE 事件并让 react-query 重新拉取目录数据。
// 并行生成数量 = 当前状态为 generating 的小节数，跨标签页/跨设备自动一致。
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * 订阅某课程下所有小节的状态变化。
 * @param courseId 课程 ID；为空时不订阅
 * @param enabled 是否启用（未登录或无需实时时关闭）
 */
export function useSectionRealtime(courseId: string | undefined, enabled = true): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!courseId || !enabled || !isSupabaseConfigured) return;
    const supabase = getSupabase();

    // 收到任意小节变更后防抖合并刷新，避免高频事件导致抖动
    let timer: number | undefined;
    const scheduleRefetch = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["outline", courseId] });
        queryClient.invalidateQueries({ queryKey: ["course", courseId] });
        queryClient.invalidateQueries({ queryKey: ["section"] });
      }, 250);
    };

    const channel = supabase
      .channel(`sections-${courseId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "coursegen_sections",
          filter: `course_id=eq.${courseId}`,
        },
        scheduleRefetch
      )
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      channel.unsubscribe();
    };
  }, [courseId, enabled, queryClient]);
}
