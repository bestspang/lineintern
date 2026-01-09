import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useFavorites(employeeId: string | undefined) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFavorites = useCallback(async () => {
    if (!employeeId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('portal_favorites')
        .select('menu_path')
        .eq('employee_id', employeeId);

      if (error) throw error;
      setFavorites(data?.map(f => f.menu_path) || []);
    } catch (err) {
      console.error('Error fetching favorites:', err);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const toggleFavorite = useCallback(async (menuPath: string) => {
    if (!employeeId) return;

    const isFav = favorites.includes(menuPath);

    try {
      if (isFav) {
        await supabase
          .from('portal_favorites')
          .delete()
          .eq('employee_id', employeeId)
          .eq('menu_path', menuPath);
        setFavorites(prev => prev.filter(p => p !== menuPath));
      } else {
        await supabase
          .from('portal_favorites')
          .insert({ employee_id: employeeId, menu_path: menuPath });
        setFavorites(prev => [...prev, menuPath]);
      }
    } catch (err) {
      console.error('Error toggling favorite:', err);
    }
  }, [employeeId, favorites]);

  const isFavorite = useCallback((menuPath: string) => {
    return favorites.includes(menuPath);
  }, [favorites]);

  return { favorites, loading, toggleFavorite, isFavorite };
}
