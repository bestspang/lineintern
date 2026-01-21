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
  created_at: string;
  updated_at: string;
}

/**
 * Hook to fetch and manage cute quotes
 */
export function useCuteQuotes() {
  const { isEnabled, isLoading: isFlagLoading } = useFeatureFlag('cute_quotes_liveness');
  
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

  // Get a random quote
  const getRandomQuote = useCallback(() => {
    if (!isEnabled || !quotes || quotes.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * quotes.length);
    return quotes[randomIndex];
  }, [isEnabled, quotes]);

  // Check if feature is ready
  const isReady = useMemo(() => {
    return !isFlagLoading && !isQuotesLoading && isEnabled && quotes && quotes.length > 0;
  }, [isFlagLoading, isQuotesLoading, isEnabled, quotes]);

  return {
    quotes: quotes || [],
    getRandomQuote,
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
