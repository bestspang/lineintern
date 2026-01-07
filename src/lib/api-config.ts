/**
 * Centralized API configuration service
 * Handles API keys and tokens for external services
 * 
 * Priority: Memory Cache → Database → localStorage (fallback)
 */

import { supabase } from '@/integrations/supabase/client';

// Memory cache for API tokens
const tokenCache: Record<string, string | null> = {};

/**
 * Fetch API configuration from database
 */
async function fetchFromDatabase(keyName: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('api_configurations')
      .select('key_value')
      .eq('key_name', keyName)
      .maybeSingle();
    
    if (error) {
      console.warn(`Failed to fetch ${keyName} from database:`, error.message);
      return null;
    }
    
    return data?.key_value || null;
  } catch (err) {
    console.warn(`Error fetching ${keyName}:`, err);
    return null;
  }
}

/**
 * ดึง Mapbox Public Token แบบ centralized
 * Priority: 
 * 1. Memory cache
 * 2. Database (api_configurations table)
 * 3. localStorage (backward compatible fallback)
 */
export async function getMapboxToken(): Promise<string | null> {
  const KEY_NAME = 'MAPBOX_PUBLIC_TOKEN';
  
  // 1. Check memory cache
  if (tokenCache[KEY_NAME]) {
    return tokenCache[KEY_NAME];
  }
  
  // 2. Check database
  const dbToken = await fetchFromDatabase(KEY_NAME);
  if (dbToken) {
    tokenCache[KEY_NAME] = dbToken;
    return dbToken;
  }
  
  // 3. Fallback to localStorage (backward compatible)
  const localToken = localStorage.getItem('mapbox_public_token');
  if (localToken) {
    tokenCache[KEY_NAME] = localToken;
    // Migrate to database if user is authenticated
    migrateToDatabase(KEY_NAME, localToken);
    return localToken;
  }
  
  return null;
}

/**
 * Migrate localStorage token to database
 */
async function migrateToDatabase(keyName: string, value: string) {
  try {
    const { error } = await supabase
      .from('api_configurations')
      .update({ key_value: value })
      .eq('key_name', keyName);
    
    if (!error) {
      // Successfully migrated, clear localStorage
      localStorage.removeItem('mapbox_public_token');
      console.log(`Migrated ${keyName} to database`);
    }
  } catch (err) {
    // Silently fail - migration is optional
  }
}

/**
 * บันทึก Mapbox token (legacy - now saves to database)
 */
export async function setMapboxToken(token: string): Promise<void> {
  const KEY_NAME = 'MAPBOX_PUBLIC_TOKEN';
  
  // Update cache
  tokenCache[KEY_NAME] = token;
  
  // Save to database
  try {
    const { error } = await supabase
      .from('api_configurations')
      .update({ key_value: token })
      .eq('key_name', KEY_NAME);
    
    if (error) {
      // Fallback to localStorage if database fails
      localStorage.setItem('mapbox_public_token', token);
    }
  } catch {
    localStorage.setItem('mapbox_public_token', token);
  }
}

/**
 * ลบ token ออก
 */
export async function clearMapboxToken(): Promise<void> {
  const KEY_NAME = 'MAPBOX_PUBLIC_TOKEN';
  
  // Clear cache
  tokenCache[KEY_NAME] = null;
  
  // Clear from database
  try {
    await supabase
      .from('api_configurations')
      .update({ key_value: null })
      .eq('key_name', KEY_NAME);
  } catch {
    // Ignore errors
  }
  
  // Clear localStorage fallback
  localStorage.removeItem('mapbox_public_token');
}

/**
 * Clear all cached tokens (useful when logging out)
 */
export function clearTokenCache() {
  Object.keys(tokenCache).forEach(key => {
    tokenCache[key] = null;
  });
}
