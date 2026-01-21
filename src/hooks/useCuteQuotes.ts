/**
 * Cute Quotes Hook
 * 
 * Provides random motivational/funny quotes for liveness camera
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFeatureFlag } from './useFeatureFlags';
import { useCallback, useMemo } from 'react';

export interface CuteQuote {
  id: string;
  text: string;
  text_en: string | null;
  category: string;
  emoji: string;
  is_active: boolean;
  display_order: number;
  show_time: 'check_in' | 'check_out' | 'both';
  bg_color: string;
  special_day_type: 'birthday' | 'holiday' | 'custom' | null;
  special_day_date: string | null;
  holiday_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteContext {
  employeeBirthDate?: string;  // 'MM-DD' format
  todayHolidayIds?: string[];
}

export interface CuteQuoteSettings {
  check_in_chance: number;
  check_out_chance: number;
}

/**
 * Hook to fetch and manage cute quotes
 */
export function useCuteQuotes() {
  const { isEnabled, isLoading: isFlagLoading, flag } = useFeatureFlag('cute_quotes_liveness');
  
  const { data: quotes, isLoading: isQuotesLoading, refetch } = useQuery({
    queryKey: ['cute-quotes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cute_quotes')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      
      if (error) {
        console.warn('[useCuteQuotes] Failed to fetch quotes:', error.message);
        return [];
      }
      return data as CuteQuote[];
    },
    staleTime: 60000, // Cache for 1 minute
    enabled: isEnabled,
  });

  // Parse settings from feature flag
  const settings = useMemo<CuteQuoteSettings>(() => {
    const s = flag?.settings as unknown as CuteQuoteSettings | null | undefined;
    return {
      check_in_chance: s?.check_in_chance ?? 100,
      check_out_chance: s?.check_out_chance ?? 100,
    };
  }, [flag?.settings]);

  /**
   * Check if quote should be shown based on event type and configured chance
   */
  const shouldShowQuote = useCallback((eventType: 'check_in' | 'check_out' = 'check_in') => {
    if (!isEnabled) return false;
    const chance = eventType === 'check_in' 
      ? settings.check_in_chance 
      : settings.check_out_chance;
    return Math.random() * 100 < chance;
  }, [isEnabled, settings]);

  // Get a random quote filtered by event type and special day context
  const getRandomQuote = useCallback((
    eventType: 'check_in' | 'check_out' = 'check_in',
    context?: QuoteContext
  ) => {
    if (!isEnabled || !quotes || quotes.length === 0) return null;
    
    const today = new Date();
    const todayMMDD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const todayISO = today.toISOString().split('T')[0];
    
    // Filter by show_time first
    const timeFiltered = quotes.filter(q => 
      q.show_time === 'both' || q.show_time === eventType
    );
    
    // Priority 1: Birthday quotes (if employee has birthday today)
    if (context?.employeeBirthDate && context.employeeBirthDate === todayMMDD) {
      const birthdayQuotes = timeFiltered.filter(q => q.special_day_type === 'birthday');
      if (birthdayQuotes.length > 0) {
        return birthdayQuotes[Math.floor(Math.random() * birthdayQuotes.length)];
      }
    }
    
    // Priority 2: Holiday quotes (if today is a holiday)
    if (context?.todayHolidayIds && context.todayHolidayIds.length > 0) {
      const holidayQuotes = timeFiltered.filter(q => 
        q.special_day_type === 'holiday' && 
        q.holiday_id && 
        context.todayHolidayIds!.includes(q.holiday_id)
      );
      if (holidayQuotes.length > 0) {
        return holidayQuotes[Math.floor(Math.random() * holidayQuotes.length)];
      }
    }
    
    // Priority 3: Custom date quotes (if today matches specific date)
    const customDayQuotes = timeFiltered.filter(q => 
      q.special_day_type === 'custom' && q.special_day_date === todayISO
    );
    if (customDayQuotes.length > 0) {
      return customDayQuotes[Math.floor(Math.random() * customDayQuotes.length)];
    }
    
    // Priority 4: Regular quotes (no special day)
    const regularQuotes = timeFiltered.filter(q => q.special_day_type === null);
    if (regularQuotes.length === 0) return null;
    
    return regularQuotes[Math.floor(Math.random() * regularQuotes.length)];
  }, [isEnabled, quotes]);

  // Check if feature is ready
  const isReady = useMemo(() => {
    return !isFlagLoading && !isQuotesLoading && isEnabled && quotes && quotes.length > 0;
  }, [isFlagLoading, isQuotesLoading, isEnabled, quotes]);

  return {
    quotes: quotes || [],
    getRandomQuote,
    shouldShowQuote,
    settings,
    isEnabled,
    isLoading: isFlagLoading || isQuotesLoading,
    isReady,
    refetch,
  };
}

/**
 * Hook for admin to manage cute quotes
 */
export function useCuteQuotesAdmin() {
  const { data: allQuotes, isLoading, refetch } = useQuery({
    queryKey: ['cute-quotes-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cute_quotes')
        .select('*')
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as CuteQuote[];
    },
  });

  const createQuote = async (quote: Partial<CuteQuote>) => {
    const { error } = await supabase
      .from('cute_quotes')
      .insert([{
        text: quote.text!,
        text_en: quote.text_en,
        emoji: quote.emoji || '😊',
        category: quote.category || 'general',
        is_active: quote.is_active ?? true,
        display_order: quote.display_order ?? 0,
        show_time: quote.show_time || 'both',
        bg_color: quote.bg_color || 'pink-purple',
        special_day_type: quote.special_day_type || null,
        special_day_date: quote.special_day_date || null,
        holiday_id: quote.holiday_id || null,
      }]);
    
    if (error) throw error;
    await refetch();
  };

  const updateQuote = async (id: string, updates: Partial<CuteQuote>) => {
    const { error } = await supabase
      .from('cute_quotes')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    
    if (error) throw error;
    await refetch();
  };

  const deleteQuote = async (id: string) => {
    const { error } = await supabase
      .from('cute_quotes')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    await refetch();
  };

  const toggleQuote = async (id: string, isActive: boolean) => {
    await updateQuote(id, { is_active: isActive });
  };

  return {
    quotes: allQuotes || [],
    isLoading,
    refetch,
    createQuote,
    updateQuote,
    deleteQuote,
    toggleQuote,
  };
}
