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

export const ALLOWED_MIME_TYPES = [
  "application/pdf", "image/png", "image/jpeg", "image/jpg",
  "image/webp", "image/heic", "image/heif",
];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

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
  uploaded_by_user_id: string | null;
  uploaded_by_employee_id: string | null;
  replaced_by_document_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_by_user_id: string | null;
}
