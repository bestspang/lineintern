// =============================
// RATE LIMITER UTILITY
// =============================

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory storage (per edge function instance)
const rateLimitStore = new Map<string, RateLimitEntry>();

export class RateLimiter {
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig = { windowMs: 60000, maxRequests: 60 }) {
    this.config = config;
  }

  /**
   * Check if a request should be rate limited
   * @param key - Unique identifier (e.g., IP, userId, groupId)
   * @returns true if rate limit exceeded, false otherwise
   */
  isRateLimited(key: string): boolean {
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    // ✅ OPTIMIZED: Non-blocking cleanup strategy
    // 1. Hard limit: If map is huge, clear it to prevent OOM
    if (rateLimitStore.size > 20000) {
      console.warn('Rate limit store overflow, clearing cache');
      rateLimitStore.clear();
      return false; // Allow this request after clearing
    }

    // 2. Lazy cleanup: Only clean old entries occasionally (1% chance)
    // This prevents blocking the event loop during high traffic
    if (rateLimitStore.size > 10000 && Math.random() < 0.01) {
      let deleted = 0;
      for (const [k, v] of rateLimitStore.entries()) {
        if (v.resetTime < now - 3600000) {
          rateLimitStore.delete(k);
          deleted++;
          // ✅ Break after 100 deletions to avoid blocking
          if (deleted >= 100) break;
        }
      }
    }

    if (!entry || entry.resetTime < now) {
      // New window
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + this.config.windowMs,
      });
      return false;
    }

    if (entry.count >= this.config.maxRequests) {
      return true;
    }

    // Increment count
    entry.count++;
    rateLimitStore.set(key, entry);
    return false;
  }

  /**
   * Get rate limit info
   */
  getRateLimitInfo(key: string): {
    remaining: number;
    resetTime: number;
    limited: boolean;
  } {
    const entry = rateLimitStore.get(key);
    const now = Date.now();

    if (!entry || entry.resetTime < now) {
      return {
        remaining: this.config.maxRequests,
        resetTime: now + this.config.windowMs,
        limited: false,
      };
    }

    return {
      remaining: Math.max(0, this.config.maxRequests - entry.count),
      resetTime: entry.resetTime,
      limited: entry.count >= this.config.maxRequests,
    };
  }

  /**
   * Create rate limit response headers
   */
  getHeaders(key: string): Record<string, string> {
    const info = this.getRateLimitInfo(key);
    return {
      'X-RateLimit-Limit': this.config.maxRequests.toString(),
      'X-RateLimit-Remaining': info.remaining.toString(),
      'X-RateLimit-Reset': new Date(info.resetTime).toISOString(),
    };
  }
}

// Pre-configured rate limiters
export const rateLimiters = {
  webhook: new RateLimiter({ windowMs: 60000, maxRequests: 100 }), // 100 req/min
  attendance: new RateLimiter({ windowMs: 60000, maxRequests: 30 }), // 30 req/min
  api: new RateLimiter({ windowMs: 60000, maxRequests: 60 }), // 60 req/min
  strict: new RateLimiter({ windowMs: 60000, maxRequests: 10 }), // 10 req/min
};
