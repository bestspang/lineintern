// =============================
// SAFE LOGGING UTILITY
// Prevents sensitive data from being logged
// =============================

const SENSITIVE_KEYS = [
  'password',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'secret',
  'line_user_id',
  'line_group_id',
  'authorization',
  'photo_hash',
  'device_info',
  'email',
  'phone',
  'phone_number',
  'bank_account',
];

/**
 * Mask sensitive values in objects
 */
function maskSensitiveData(data: any, depth = 0): any {
  // Prevent infinite recursion
  if (depth > 5) return '[max depth]';

  if (typeof data === 'string') {
    return data.length > 100 ? `${data.substring(0, 100)}... [${data.length} chars]` : data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveData(item, depth + 1));
  }

  if (data && typeof data === 'object') {
    const masked: any = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = SENSITIVE_KEYS.some((k) => lowerKey.includes(k));

      if (isSensitive) {
        if (typeof value === 'string') {
          masked[key] = value.length > 0 ? '***' : '';
        } else {
          masked[key] = '[REDACTED]';
        }
      } else {
        masked[key] = maskSensitiveData(value, depth + 1);
      }
    }
    return masked;
  }

  return data;
}

export const logger = {
  info: (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    if (data) {
      console.log(`[${timestamp}] INFO: ${message}`, maskSensitiveData(data));
    } else {
      console.log(`[${timestamp}] INFO: ${message}`);
    }
  },

  error: (message: string, error?: any) => {
    const timestamp = new Date().toISOString();
    if (error) {
      const errorInfo = error instanceof Error
        ? { message: error.message, stack: error.stack }
        : error;
      console.error(`[${timestamp}] ERROR: ${message}`, maskSensitiveData(errorInfo));
    } else {
      console.error(`[${timestamp}] ERROR: ${message}`);
    }
  },

  warn: (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    if (data) {
      console.warn(`[${timestamp}] WARN: ${message}`, maskSensitiveData(data));
    } else {
      console.warn(`[${timestamp}] WARN: ${message}`);
    }
  },

  debug: (message: string, data?: any) => {
    if (Deno.env.get('APP_ENV') !== 'production') {
      const timestamp = new Date().toISOString();
      if (data) {
        console.log(`[${timestamp}] DEBUG: ${message}`, maskSensitiveData(data));
      } else {
        console.log(`[${timestamp}] DEBUG: ${message}`);
      }
    }
  },
};
