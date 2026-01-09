import { supabase } from "@/integrations/supabase/client";

interface PortalApiParams {
  endpoint: string;
  employee_id: string;
  params?: Record<string, any>;
}

export async function portalApi<T = any>({ endpoint, employee_id, params }: PortalApiParams): Promise<{ data: T | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('portal-data', {
      body: { endpoint, employee_id, params }
    });

    if (error) {
      console.error(`[portal-api] Error for ${endpoint}:`, error);
      return { data: null, error };
    }

    if (data?.error) {
      console.error(`[portal-api] API error for ${endpoint}:`, data.error);
      return { data: null, error: new Error(data.error) };
    }

    return { data: data?.data ?? null, error: null };
  } catch (err) {
    console.error(`[portal-api] Unexpected error for ${endpoint}:`, err);
    return { data: null, error: err as Error };
  }
}
