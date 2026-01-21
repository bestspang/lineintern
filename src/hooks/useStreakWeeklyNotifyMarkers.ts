import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a Set of point_transaction ids that already have a successful streak_weekly notification sent.
 * Used to disable/hide the manual "ส่งประกาศ" button to avoid re-sending.
 */
export function useStreakWeeklyNotifyMarkers(transactionIds: string[] | undefined) {
  return useQuery({
    queryKey: ["streak-weekly-notify-markers", transactionIds?.join(",") ?? ""],
    enabled: Boolean(transactionIds?.length),
    queryFn: async () => {
      const ids = transactionIds ?? [];
      if (!ids.length) return new Set<string>();

      const { data, error } = await supabase
        .from("bot_message_logs")
        .select("trigger_message_id")
        .in("trigger_message_id", ids)
        .eq("command_type", "streak_weekly")
        .eq("message_type", "notification")
        .eq("delivery_status", "sent")
        .limit(1000);

      if (error) throw error;
      return new Set<string>((data ?? []).map((r) => r.trigger_message_id).filter(Boolean));
    },
  });
}
