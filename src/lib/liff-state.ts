// Global LIFF state to prevent double initialization
// This singleton pattern ensures LIFF is only initialized once across the app

export interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}

interface GlobalLiffState {
  isInitialized: boolean;
  isReady: boolean;
  isLoggedIn: boolean;
  isInClient: boolean;
  liffId: string | null;
  profile: LiffProfile | null;
  error: string | null;
}

// Global state object
const globalLiffState: GlobalLiffState = {
  isInitialized: false,
  isReady: false,
  isLoggedIn: false,
  isInClient: false,
  liffId: null,
  profile: null,
  error: null,
};

// Cached LIFF ID key
const LIFF_ID_CACHE_KEY = 'cached_liff_id';

export function getGlobalLiffState(): GlobalLiffState {
  return { ...globalLiffState };
}

export function setGlobalLiffState(state: Partial<GlobalLiffState>): void {
  Object.assign(globalLiffState, state);
}

export function isLiffInitialized(): boolean {
  return globalLiffState.isInitialized;
}

export function getCachedLiffId(): string | null {
  try {
    return localStorage.getItem(LIFF_ID_CACHE_KEY);
  } catch {
    return null;
  }
}

export function setCachedLiffId(liffId: string): void {
  try {
    localStorage.setItem(LIFF_ID_CACHE_KEY, liffId);
  } catch {
    // localStorage not available
  }
}

export function clearLiffCache(): void {
  try {
    localStorage.removeItem(LIFF_ID_CACHE_KEY);
  } catch {
    // localStorage not available
  }
}
