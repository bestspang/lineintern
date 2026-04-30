/**
 * Portal performance instrumentation.
 *
 * Lightweight, additive helpers used by LiffProvider, PortalProvider,
 * PortalLayout, PortalHome and the legacy /attendance check-in page.
 *
 * Rules:
 *  - NEVER log or send: token values, full LINE user IDs, GPS coordinates,
 *    photo URLs, raw error stacks, or any secret.
 *  - All work must be fire-and-forget — never block UI.
 *  - Browser performance.mark() is the source of truth; DB insert is best-effort.
 */
import { supabase } from "@/integrations/supabase/client";

export type PortalPerfEvent =
  | "portal_opened"
  | "liff_init_start"
  | "liff_init_end"
  | "liff_init_done"
  | "portal_provider_start"
  | "portal_provider_ready"
  | "portal_ready"
  | "portal_home_first_render"
  | "portal_first_action_available"
  | "checkin_token_validate_start"
  | "checkin_token_validate_end"
  | "token_validate_success"
  | "token_validate_failed"
  | "checkin_submit_success"
  | "checkin_submit_failed"
  | "checkout_submit_success"
  | "checkout_submit_failed";

const startTimes = new Map<string, number>();

export function perfMark(name: PortalPerfEvent | string): void {
  try {
    performance.mark(`portal:${name}`);
    startTimes.set(name, performance.now());
  } catch {
    // ignore
  }
  if (import.meta.env.DEV) {
    // Keep dev console quiet but useful — no PII.
    // eslint-disable-next-line no-console
    console.debug(`[portal-perf] ${name}`, performance.now().toFixed(0) + "ms");
  }
}

/**
 * Measure duration since a previous perfMark. Returns ms or null.
 */
export function perfMeasure(startName: string): number | null {
  const t0 = startTimes.get(startName);
  if (typeof t0 !== "number") return null;
  return Math.round(performance.now() - t0);
}

interface PerfPayload {
  event_name: PortalPerfEvent | string;
  duration_ms?: number | null;
  route?: string | null;
  employee_id?: string | null;
  branch_id?: string | null;
  error_code?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Best-effort insert into portal_performance_events. Silently no-ops on failure.
 * Caller MUST NOT pass tokens / GPS / photo URLs / raw stacks.
 */
export function logPortalEvent(payload: PerfPayload): void {
  // Always emit a perf mark so devs see timing even if DB call drops.
  perfMark(payload.event_name);

  // Defer to idle to avoid blocking critical path.
  const send = () => {
    try {
      // Use `any` cast because the table type is generated and may not be present
      // in older type bundles; runtime is what matters.
      void (supabase.from as any)("portal_performance_events").insert({
        event_name: payload.event_name,
        duration_ms: payload.duration_ms ?? null,
        route: payload.route ?? (typeof window !== "undefined" ? window.location.pathname : null),
        employee_id: payload.employee_id ?? null,
        branch_id: payload.branch_id ?? null,
        error_code: payload.error_code ?? null,
        metadata: payload.metadata ?? null,
      });
    } catch {
      // swallow
    }
  };

  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    // @ts-ignore – non-standard but widely supported on portal target browsers
    window.requestIdleCallback(send, { timeout: 2000 });
  } else {
    setTimeout(send, 0);
  }
}
