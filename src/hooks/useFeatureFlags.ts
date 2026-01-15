/**
 * Feature Flags Hook
 * 
 * Provides utilities for checking and managing feature flags.
 * Feature flags allow enabling/disabling features without redeployment.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface FeatureFlag {
  id: string;
  flag_key: string;
  display_name: string;
  description: string | null;
  is_enabled: boolean;
  rollout_percentage: number;
  enabled_for_roles: string[] | null;
  enabled_for_employees: string[] | null;
  category: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * Simple hash function for consistent rollout
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Hook to check if a specific feature flag is enabled
 */
export function useFeatureFlag(flagKey: string): { 
  isEnabled: boolean; 
  isLoading: boolean;
  flag: FeatureFlag | null;
} {
  const { user } = useAuth();
  
  const { data: flag, isLoading } = useQuery({
    queryKey: ['feature-flag', flagKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .eq('flag_key', flagKey)
        .single();
      
      if (error) {
        console.warn(`[useFeatureFlag] Flag "${flagKey}" not found:`, error.message);
        return null;
      }
      return data as FeatureFlag;
    },
    staleTime: 60000, // Cache for 1 minute
  });

  // Determine if flag is enabled for current user
  const isEnabled = (() => {
    if (!flag) return false;
    if (!flag.is_enabled) return false;
    
    // Check rollout percentage (consistent per user)
    if (flag.rollout_percentage < 100) {
      const userId = user?.id || 'anonymous';
      const hash = simpleHash(userId + flagKey);
      if ((hash % 100) >= flag.rollout_percentage) {
        return false;
      }
    }
    
    return true;
  })();

  return { isEnabled, isLoading, flag };
}

/**
 * Hook to get all feature flags
 */
export function useFeatureFlags() {
  return useQuery({
    queryKey: ['feature-flags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .order('category', { ascending: true })
        .order('display_name', { ascending: true });
      
      if (error) throw error;
      return data as FeatureFlag[];
    },
    staleTime: 60000,
  });
}

/**
 * Hook for admin to manage feature flags
 */
export function useFeatureFlagsAdmin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const toggleFlag = useMutation({
    mutationFn: async ({ flagKey, isEnabled }: { flagKey: string; isEnabled: boolean }) => {
      const { error } = await supabase
        .from('feature_flags')
        .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
        .eq('flag_key', flagKey);
      
      if (error) throw error;
    },
    onSuccess: (_, { flagKey, isEnabled }) => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
      queryClient.invalidateQueries({ queryKey: ['feature-flag', flagKey] });
      toast({
        title: isEnabled ? 'เปิดใช้งานฟีเจอร์แล้ว' : 'ปิดใช้งานฟีเจอร์แล้ว',
        description: `Flag "${flagKey}" ถูก${isEnabled ? 'เปิด' : 'ปิด'}แล้ว`,
      });
    },
    onError: (error) => {
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: String(error),
        variant: 'destructive',
      });
    },
  });

  const updateRollout = useMutation({
    mutationFn: async ({ flagKey, percentage }: { flagKey: string; percentage: number }) => {
      const { error } = await supabase
        .from('feature_flags')
        .update({ 
          rollout_percentage: percentage, 
          updated_at: new Date().toISOString() 
        })
        .eq('flag_key', flagKey);
      
      if (error) throw error;
    },
    onSuccess: (_, { flagKey, percentage }) => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
      queryClient.invalidateQueries({ queryKey: ['feature-flag', flagKey] });
      toast({
        title: 'อัปเดต Rollout แล้ว',
        description: `Flag "${flagKey}" rollout = ${percentage}%`,
      });
    },
    onError: (error) => {
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: String(error),
        variant: 'destructive',
      });
    },
  });

  const createFlag = useMutation({
    mutationFn: async (newFlag: Partial<FeatureFlag>) => {
      const { error } = await supabase
        .from('feature_flags')
        .insert([{
          flag_key: newFlag.flag_key!,
          display_name: newFlag.display_name!,
          description: newFlag.description,
          category: newFlag.category,
          is_enabled: newFlag.is_enabled,
          rollout_percentage: newFlag.rollout_percentage,
        }]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
      toast({
        title: 'สร้าง Feature Flag แล้ว',
        description: 'Feature flag ใหม่ถูกสร้างเรียบร้อย',
      });
    },
    onError: (error) => {
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: String(error),
        variant: 'destructive',
      });
    },
  });

  const deleteFlag = useMutation({
    mutationFn: async (flagKey: string) => {
      const { error } = await supabase
        .from('feature_flags')
        .delete()
        .eq('flag_key', flagKey);
      
      if (error) throw error;
    },
    onSuccess: (_, flagKey) => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
      toast({
        title: 'ลบ Feature Flag แล้ว',
        description: `Flag "${flagKey}" ถูกลบเรียบร้อย`,
      });
    },
    onError: (error) => {
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: String(error),
        variant: 'destructive',
      });
    },
  });

  return {
    toggleFlag: toggleFlag.mutate,
    updateRollout: updateRollout.mutate,
    createFlag: createFlag.mutate,
    deleteFlag: deleteFlag.mutate,
    isToggling: toggleFlag.isPending,
    isUpdating: updateRollout.isPending,
    isCreating: createFlag.isPending,
    isDeleting: deleteFlag.isPending,
  };
}
