// Common UI labels used across pages
// Pattern: use Thai where it's clearer for Thai users, English for technical terms
export const translations = {
  // Actions
  save: { th: 'บันทึก', en: 'Save' },
  cancel: { th: 'ยกเลิก', en: 'Cancel' },
  edit: { th: 'แก้ไข', en: 'Edit' },
  delete: { th: 'ลบ', en: 'Delete' },
  add: { th: 'เพิ่ม', en: 'Add' },
  search: { th: 'ค้นหา', en: 'Search' },
  filter: { th: 'Filter', en: 'Filter' },
  export: { th: 'Export', en: 'Export' },
  import: { th: 'Import', en: 'Import' },
  refresh: { th: 'Refresh', en: 'Refresh' },
  close: { th: 'ปิด', en: 'Close' },
  confirm: { th: 'ยืนยัน', en: 'Confirm' },
  back: { th: 'กลับ', en: 'Back' },
  next: { th: 'ถัดไป', en: 'Next' },
  previous: { th: 'ก่อนหน้า', en: 'Previous' },
  view: { th: 'ดู', en: 'View' },
  create: { th: 'สร้าง', en: 'Create' },
  update: { th: 'อัปเดต', en: 'Update' },
  submit: { th: 'ส่ง', en: 'Submit' },
  reset: { th: 'รีเซ็ต', en: 'Reset' },
  
  // Status
  active: { th: 'ใช้งาน', en: 'Active' },
  inactive: { th: 'ไม่ใช้งาน', en: 'Inactive' },
  pending: { th: 'รอดำเนินการ', en: 'Pending' },
  approved: { th: 'อนุมัติแล้ว', en: 'Approved' },
  rejected: { th: 'ไม่อนุมัติ', en: 'Rejected' },
  completed: { th: 'เสร็จสิ้น', en: 'Completed' },
  processing: { th: 'กำลังดำเนินการ', en: 'Processing' },
  
  // Common
  loading: { th: 'กำลังโหลด...', en: 'Loading...' },
  noData: { th: 'ไม่มีข้อมูล', en: 'No data' },
  success: { th: 'สำเร็จ', en: 'Success' },
  error: { th: 'เกิดข้อผิดพลาด', en: 'Error' },
  warning: { th: 'คำเตือน', en: 'Warning' },
  info: { th: 'ข้อมูล', en: 'Info' },
  
  // Table headers
  name: { th: 'ชื่อ', en: 'Name' },
  status: { th: 'สถานะ', en: 'Status' },
  date: { th: 'วันที่', en: 'Date' },
  time: { th: 'เวลา', en: 'Time' },
  actions: { th: 'Actions', en: 'Actions' },
  branch: { th: 'สาขา', en: 'Branch' },
  role: { th: 'ตำแหน่ง', en: 'Role' },
  employee: { th: 'พนักงาน', en: 'Employee' },
  code: { th: 'รหัส', en: 'Code' },
  description: { th: 'รายละเอียด', en: 'Description' },
  amount: { th: 'จำนวนเงิน', en: 'Amount' },
  total: { th: 'รวม', en: 'Total' },
  
  // Attendance specific (EN สำหรับคำ technical)
  employees: { th: 'พนักงาน', en: 'Employees' },
  payroll: { th: 'Payroll', en: 'Payroll' },
  overtime: { th: 'OT', en: 'OT' },
  checkIn: { th: 'Check-in', en: 'Check-in' },
  checkOut: { th: 'Check-out', en: 'Check-out' },
  dashboard: { th: 'Dashboard', en: 'Dashboard' },
  analytics: { th: 'Analytics', en: 'Analytics' },
  attendance: { th: 'การลงเวลา', en: 'Attendance' },
  attendanceLogs: { th: 'ประวัติการลงเวลา', en: 'Attendance Logs' },
  workHours: { th: 'ชั่วโมงทำงาน', en: 'Work Hours' },
  lateCount: { th: 'มาสาย', en: 'Late' },
  absentDays: { th: 'ขาดงาน', en: 'Absent' },
  leaveDays: { th: 'วันลา', en: 'Leave' },
  working: { th: 'กำลังทำงาน', en: 'Working' },
  checkedOut: { th: 'ออกงานแล้ว', en: 'Checked Out' },
  notArrived: { th: 'ยังไม่มา', en: 'Not Arrived' },
  onTime: { th: 'ตรงเวลา', en: 'On Time' },
  late: { th: 'สาย', en: 'Late' },
  absent: { th: 'ขาด', en: 'Absent' },
  
  // Leave types
  vacation: { th: 'พักร้อน', en: 'Vacation' },
  sick: { th: 'ลาป่วย', en: 'Sick Leave' },
  personal: { th: 'ลากิจ', en: 'Personal Leave' },
  
  // Points
  points: { th: 'แต้ม', en: 'Points' },
  happyPoints: { th: 'Happy Points', en: 'Happy Points' },
  rewards: { th: 'รางวัล', en: 'Rewards' },
  
  // Misc
  settings: { th: 'ตั้งค่า', en: 'Settings' },
  profile: { th: 'โปรไฟล์', en: 'Profile' },
  history: { th: 'ประวัติ', en: 'History' },
  schedule: { th: 'ตารางงาน', en: 'Schedule' },
  deposit: { th: 'ฝากเงิน', en: 'Deposit' },
  approve: { th: 'อนุมัติ', en: 'Approve' },
  reject: { th: 'ไม่อนุมัติ', en: 'Reject' },
  all: { th: 'ทั้งหมด', en: 'All' },
  today: { th: 'วันนี้', en: 'Today' },
  thisMonth: { th: 'เดือนนี้', en: 'This Month' },
  selectBranch: { th: 'เลือกสาขา', en: 'Select Branch' },
  selectEmployee: { th: 'เลือกพนักงาน', en: 'Select Employee' },
  selectDate: { th: 'เลือกวันที่', en: 'Select Date' },
  
  // Page titles
  manageEmployees: { th: 'จัดการข้อมูลพนักงาน', en: 'Manage employee records' },
  managePayroll: { th: 'จัดการเงินเดือน', en: 'Manage payroll' },
  viewAttendance: { th: 'ดูประวัติการลงเวลา', en: 'View attendance history' },
  
  // Descriptions
  employeesDesc: { th: 'จัดการข้อมูลพนักงานและเชื่อมต่อ LINE', en: 'Manage employee records and LINE account linking' },
  payrollDesc: { th: 'คำนวณเงินเดือนและจัดการรอบบิล', en: 'Calculate salaries and manage billing cycles' },
  attendanceLogsDesc: { th: 'ประวัติการเข้า-ออกงานทั้งหมด', en: 'Complete check-in/out history' },
  dashboardDesc: { th: 'ภาพรวมการลงเวลาวันนี้', en: 'Today\'s attendance overview' },
  
  // Messages
  noEmployeesFound: { th: 'ไม่พบพนักงาน', en: 'No employees found' },
  noLogsFound: { th: 'ไม่พบประวัติการลงเวลา', en: 'No attendance logs found' },
  loadingData: { th: 'กำลังโหลดข้อมูล...', en: 'Loading data...' },
  errorLoadingData: { th: 'ไม่สามารถโหลดข้อมูลได้', en: 'Failed to load data' },
  
  // Showing results
  showingResults: { th: 'แสดง', en: 'Showing' },
  of: { th: 'จาก', en: 'of' },
  items: { th: 'รายการ', en: 'items' },
  page: { th: 'หน้า', en: 'Page' },
} as const;

// Helper type
export type TranslationKey = keyof typeof translations;

// Helper function to get translation
export function getTranslation(key: TranslationKey, locale: 'th' | 'en'): string {
  return translations[key][locale];
}
