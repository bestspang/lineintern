// Phase 1A — Centralized employee document type metadata.

export type EmployeeDocumentType =
  | "employment_contract"
  | "id_card"
  | "house_registration"
  | "bank_book"
  | "work_permit"
  | "certificate"
  | "warning_letter"
  | "probation"
  | "salary_adjustment"
  | "resignation"
  | "other";

export type EmployeeDocumentStatus = "active" | "expired" | "archived" | "replaced";
export type EmployeeDocumentVisibility = "hr_only" | "employee_visible";
export type EmployeeDocumentUploadStatus = "pending" | "uploaded" | "failed";

export const DOCUMENT_TYPE_LABEL_TH: Record<EmployeeDocumentType, string> = {
  employment_contract: "สัญญาจ้าง",
  id_card: "สำเนาบัตรประชาชน",
  house_registration: "สำเนาทะเบียนบ้าน",
  bank_book: "สำเนาสมุดบัญชี",
  work_permit: "ใบอนุญาตทำงาน",
  certificate: "ประกาศนียบัตร",
  warning_letter: "หนังสือเตือน",
  probation: "เอกสารทดลองงาน",
  salary_adjustment: "หนังสือปรับเงินเดือน",
  resignation: "ใบลาออก",
  other: "อื่นๆ",
};

export const DOCUMENT_TYPE_LABEL_EN: Record<EmployeeDocumentType, string> = {
  employment_contract: "Employment Contract",
  id_card: "ID Card Copy",
  house_registration: "House Registration",
  bank_book: "Bank Book",
  work_permit: "Work Permit",
  certificate: "Certificate",
  warning_letter: "Warning Letter",
  probation: "Probation Document",
  salary_adjustment: "Salary Adjustment",
  resignation: "Resignation Letter",
  other: "Other",
};

export const DOCUMENT_TYPES: EmployeeDocumentType[] = [
  "employment_contract", "id_card", "house_registration", "bank_book",
  "work_permit", "certificate", "warning_letter", "probation",
  "salary_adjustment", "resignation", "other",
];

export const STATUS_LABEL_TH: Record<EmployeeDocumentStatus, string> = {
  active: "ใช้งานอยู่",
  expired: "หมดอายุ",
  archived: "เก็บถาวร",
  replaced: "ถูกแทนที่",
};

export const VISIBILITY_LABEL_TH: Record<EmployeeDocumentVisibility, string> = {
  hr_only: "เฉพาะ HR",
  employee_visible: "พนักงานเห็นได้",
};

export const UPLOAD_STATUS_LABEL_TH: Record<EmployeeDocumentUploadStatus, string> = {
  pending: "กำลังอัปโหลด",
  uploaded: "อัปโหลดสำเร็จ",
  failed: "อัปโหลดล้มเหลว",
};

/** Map structured signed-url / confirm error codes to Thai user-facing messages. */
export const SIGNED_URL_ERROR_CODE_TH: Record<string, string> = {
  not_found: "ไม่พบเอกสาร",
  forbidden_visibility: "คุณไม่มีสิทธิ์เข้าถึงเอกสารนี้",
  forbidden_scope: "คุณไม่มีสิทธิ์เข้าถึงเอกสารของพนักงานคนนี้",
  not_yet_uploaded: "เอกสารยังอัปโหลดไม่เสร็จ — รอสักครู่หรืออัปโหลดใหม่",
  upload_failed: "เอกสารนี้อัปโหลดล้มเหลว — กรุณาอัปโหลดใหม่",
  file_missing: "ไฟล์หายไปจากที่จัดเก็บ — กรุณาอัปโหลดใหม่",
  storage_error: "เกิดข้อผิดพลาดที่ระบบจัดเก็บไฟล์",
  document_id_required: "ระบบต้องการรหัสเอกสาร",
  invalid_json: "คำขอไม่ถูกต้อง",
};

export const ALLOWED_MIME_TYPES = [
  "application/pdf", "image/png", "image/jpeg", "image/jpg",
  "image/webp", "image/heic", "image/heif",
];
export const ALLOWED_EXTENSIONS = [
  ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif",
];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_LABEL_TH = "10MB";
export const ALLOWED_TYPES_LABEL_TH = "PDF, JPG, PNG, WebP, HEIC";

/**
 * Phase 1A.3 — Client-side validation gate.
 * Validates BOTH MIME type AND extension (HEIC on Safari often arrives with empty MIME),
 * and enforces the 10MB cap. Returns Thai-first reason strings.
 */
export type FileValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateDocumentFile(file: File): FileValidationResult {
  if (!file) return { ok: false, reason: "ไม่พบไฟล์" };
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, reason: `ไฟล์ใหญ่เกิน ${MAX_FILE_LABEL_TH}` };
  }
  const mimeOk = !!file.type && ALLOWED_MIME_TYPES.includes(file.type);
  const lower = (file.name || "").toLowerCase();
  const extOk = ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  if (!mimeOk && !extOk) {
    return {
      ok: false,
      reason: `ประเภทไฟล์ไม่รองรับ — รองรับเฉพาะ ${ALLOWED_TYPES_LABEL_TH}`,
    };
  }
  return { ok: true };
}

/** Outcomes recorded in employee_documents.metadata.confirm_history. */
export type ConfirmHistoryOutcome = "uploaded" | "failed" | "file_missing";

export interface ConfirmHistoryEntry {
  at: string;
  outcome: ConfirmHistoryOutcome;
  reason?: string | null;
  by_user_id?: string | null;
}

export const CONFIRM_OUTCOME_LABEL_TH: Record<ConfirmHistoryOutcome, string> = {
  uploaded: "อัปโหลดสำเร็จ",
  failed: "ล้มเหลว",
  file_missing: "ไฟล์หาย (รอลองใหม่)",
};

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  document_type: EmployeeDocumentType;
  title: string;
  description: string | null;
  file_path: string;
  file_name: string;
  file_mime_type: string | null;
  file_size_bytes: number | null;
  issue_date: string | null;
  expiry_date: string | null;
  status: EmployeeDocumentStatus;
  visibility: EmployeeDocumentVisibility;
  upload_status: EmployeeDocumentUploadStatus;
  uploaded_by_user_id: string | null;
  uploaded_by_employee_id: string | null;
  replaced_by_document_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_by_user_id: string | null;
}
