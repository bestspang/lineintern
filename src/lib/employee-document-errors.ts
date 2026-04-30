/**
 * แปลง error จาก Supabase / network ให้เป็นข้อความภาษาไทยที่ HR เข้าใจง่าย
 * ใช้ร่วมกันได้ระหว่างหน้าเอกสารพนักงานและคอมโพเนนต์ที่เกี่ยวข้อง
 */
export interface FriendlyError {
  title: string;
  hint: string;
  canRetry: boolean;
  technical: string;
  variant: "offline" | "permission" | "timeout" | "server" | "unknown";
}

function getStatus(err: any): number | undefined {
  if (!err) return undefined;
  if (typeof err.status === "number") return err.status;
  if (typeof err.statusCode === "number") return err.statusCode;
  if (typeof err.code === "string") {
    // Postgrest codes
    if (err.code === "PGRST301" || err.code === "42501") return 403;
    if (err.code === "PGRST116") return 404;
  }
  return undefined;
}

function getMessage(err: any): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  return err.message || err.error_description || err.hint || String(err);
}

export function describeDocError(err: unknown): FriendlyError {
  const technical = getMessage(err) || "ไม่ทราบสาเหตุ";
  const isOffline =
    typeof navigator !== "undefined" && navigator.onLine === false;

  if (isOffline) {
    return {
      title: "ขาดการเชื่อมต่ออินเทอร์เน็ต",
      hint: "กรุณาตรวจสอบ Wi-Fi หรือสัญญาณมือถือ แล้วกดลองใหม่อีกครั้ง",
      canRetry: true,
      technical,
      variant: "offline",
    };
  }

  const status = getStatus(err);
  const lower = technical.toLowerCase();

  if (status === 401 || status === 403 || lower.includes("permission") || lower.includes("rls") || lower.includes("not authorized")) {
    return {
      title: "ไม่มีสิทธิ์เข้าถึงข้อมูลเอกสาร",
      hint: "บัญชีของคุณอาจถูกจำกัดสิทธิ์ กรุณาติดต่อแอดมินเพื่อขอสิทธิ์การเข้าถึง",
      canRetry: false,
      technical,
      variant: "permission",
    };
  }

  if (status === 408 || status === 504 || lower.includes("timeout") || lower.includes("timed out")) {
    return {
      title: "เซิร์ฟเวอร์ตอบกลับช้าเกินไป",
      hint: "เครือข่ายหรือเซิร์ฟเวอร์อาจมีภาระงานสูง กรุณาลองใหม่อีกครั้ง",
      canRetry: true,
      technical,
      variant: "timeout",
    };
  }

  if ((status && status >= 500 && status < 600) || lower.includes("internal") || lower.includes("server error")) {
    return {
      title: "ระบบขัดข้องชั่วคราว",
      hint: "กรุณารอสักครู่แล้วลองใหม่อีกครั้ง หากยังไม่หายให้แจ้งทีมไอที",
      canRetry: true,
      technical,
      variant: "server",
    };
  }

  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("network request")) {
    return {
      title: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ",
      hint: "ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตของคุณ แล้วลองใหม่อีกครั้ง",
      canRetry: true,
      technical,
      variant: "offline",
    };
  }

  return {
    title: "โหลดข้อมูลไม่สำเร็จ",
    hint: "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง",
    canRetry: true,
    technical,
    variant: "unknown",
  };
}
