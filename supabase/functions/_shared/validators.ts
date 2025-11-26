// =============================
// INPUT VALIDATION WITH ZOD
// =============================

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Attendance submission validation
export const attendanceSubmitSchema = z.object({
  token: z.string().uuid("Invalid token format"),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  deviceTime: z.string().datetime().optional(),
  timezone: z.string().max(50).optional(),
  deviceInfo: z.string().max(1000).optional(),
  check_only: z.boolean().optional(),
});

// OT request validation
export const otRequestSchema = z.object({
  employee_id: z.string().uuid("Invalid employee ID"),
  reason: z.string()
    .min(10, "Reason must be at least 10 characters")
    .max(500, "Reason too long (max 500 characters)"),
  estimated_hours: z.number()
    .positive("Hours must be positive")
    .max(12, "Maximum 12 hours allowed"),
  request_method: z.enum(["webapp", "line"]).optional(),
});

// Early leave request validation
export const earlyLeaveSchema = z.object({
  employee_id: z.string().uuid("Invalid employee ID"),
  leave_type: z.enum(["personal", "sick", "vacation", "emergency", "other"]),
  leave_reason: z.string()
    .min(10, "Reason must be at least 10 characters")
    .max(500, "Reason too long (max 500 characters)"),
});

// Work progress validation
export const workProgressSchema = z.object({
  task_id: z.string().uuid("Invalid task ID"),
  progress_text: z.string()
    .min(5, "Progress text too short")
    .max(1000, "Progress text too long"),
  progress_percentage: z.number().int().min(0).max(100).optional(),
});

// Sanitize user input (remove potentially dangerous characters)
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();
}

// Sanitize object (recursively sanitize all string values)
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizeInput(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

// Validate and parse schema safely
export function validateSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const parsed = schema.parse(data);
    return { success: true, data: parsed };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      return {
        success: false,
        error: `${firstError.path.join('.')}: ${firstError.message}`,
      };
    }
    return {
      success: false,
      error: 'Validation failed',
    };
  }
}
