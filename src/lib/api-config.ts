/**
 * Centralized API configuration service
 * Handles API keys and tokens for external services
 */

// Cache สำหรับ public tokens
let cachedMapboxToken: string | null = null;

/**
 * ดึง Mapbox Public Token แบบ centralized
 * 1. ลอง cache ใน memory
 * 2. ลอง localStorage
 * 3. ถ้าไม่มี ให้ผู้ใช้กรอก
 */
export async function getMapboxToken(): Promise<string | null> {
  // Check cache
  if (cachedMapboxToken) return cachedMapboxToken;
  
  // Check localStorage
  const localToken = localStorage.getItem('mapbox_public_token');
  if (localToken) {
    cachedMapboxToken = localToken;
    return localToken;
  }
  
  return null;
}

/**
 * บันทึก Mapbox token
 */
export function setMapboxToken(token: string) {
  localStorage.setItem('mapbox_public_token', token);
  cachedMapboxToken = token;
}

/**
 * ลบ token ออก (เผื่อต้องการ reset)
 */
export function clearMapboxToken() {
  localStorage.removeItem('mapbox_public_token');
  cachedMapboxToken = null;
}
