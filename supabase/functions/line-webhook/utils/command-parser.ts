/**
 * ⚠️ CRITICAL COMMAND PARSING - DO NOT MODIFY WITHOUT REVIEW
 * 
 * This file defines how user commands are parsed and mapped to actions.
 * Changes here affect ALL bot command handling across the entire system.
 * 
 * INVARIANTS:
 * 1. commandMap keys must match bot_commands table entries
 * 2. ParsedCommand['commandType'] must include all command types
 * 3. Command aliases (Thai/English) must be kept in sync
 * 4. Non-slash natural language triggers should be minimal and specific
 * 
 * COMMON BUGS TO AVOID:
 * - Adding a command type without handling it in line-webhook/index.ts = silent failure
 * - Removing a command alias = users' muscle memory broken
 * - Case sensitivity issues (use toLowerCase consistently)
 * - Overlapping prefixes (e.g., '/task' vs '/tasks') - longer prefix first!
 * 
 * VALIDATION CHECKLIST FOR AI MODIFICATIONS:
 * □ New command type added to ParsedCommand interface?
 * □ Handler exists in line-webhook/index.ts?
 * □ Entry exists in bot_commands table for /help display?
 * □ Both Thai and English aliases provided?
 */

// =============================
// COMMAND PARSING UTILITIES
// =============================

export interface ParsedCommand {
  commandType: 'ask' | 'summary' | 'faq' | 'todo' | 'report' | 'help' | 'tasks' 
    | 'checkin' | 'checkout' | 'history' | 'work' | 'remind' | 'list_reminders' 
    | 'mentions' | 'imagine' | 'mode' | 'status' | 'progress_report' 
    | 'confirm_with_feedback' | 'find' | 'train' | 'ot' | 'menu' | 'dayoff' | 'cancel_dayoff' 
    | 'cancel_ot' | 'memory_summary' | null;
  userQuestion: string;
  rawText: string;
  isMentioned: boolean;
  isCommand: boolean;
}

export function parseCommand(text: string, isDM: boolean = false): ParsedCommand {
  const trimmedText = text.trim();
  const lowerText = trimmedText.toLowerCase();
  
  // Check for bot mention
  const mentionPatterns = [
    /@intern\b/i,
    /@บอท/i,
    /@bot\b/i,
  ];
  
  const isMentioned = mentionPatterns.some(pattern => pattern.test(text));
  
  // Check for explicit commands
  const commandMap: Record<string, ParsedCommand['commandType']> = {
    // Core commands
    '/help': 'help',
    '/ช่วยเหลือ': 'help',
    '/mode': 'mode',
    '/m': 'mode',
    '/setmode': 'mode',
    '/โหมด': 'mode',
    '/status': 'status',
    '/สถานะ': 'status',
    
    // Chat & Knowledge
    '/ask': 'ask',
    '/ถาม': 'ask',
    '/faq': 'faq',
    '/ถามตอบ': 'faq',
    '/คำถาม': 'faq',
    '/find': 'find',
    '/search': 'find',
    '/ค้นหา': 'find',
    'ค้นหา': 'find',  // non-slash natural language
    '/train': 'train',
    '/ฝึก': 'train',
    '/เทรน': 'train',
    
    // Summaries & Reports
    '/summary': 'summary',
    '/recap': 'summary',
    '/summarize': 'summary',
    '/สรุป': 'summary',
    'สรุป': 'summary',
    'สรุปหน่อย': 'summary',  // non-slash natural language
    '/report': 'report',
    '/รายงาน': 'report',
    
    // Tasks & Reminders
    '/todo': 'todo',
    '/task': 'todo',
    '/tasks': 'tasks',
    '/งาน': 'tasks',
    '/remind': 'remind',
    '/ตั้งเตือน': 'remind',
    '/reminders': 'list_reminders',
    '/reminder': 'list_reminders',
    '/เตือน': 'list_reminders',
    'reminders': 'list_reminders',  // non-slash natural language
    'เตือน': 'list_reminders',  // non-slash natural language
    
    // Work Management
    '/work': 'work',
    '/checkin': 'checkin',
    '/เข้างาน': 'checkin',
    '/เช็คอิน': 'checkin',
    'checkin': 'checkin',
    '/checkout': 'checkout',
    '/ออกงาน': 'checkout',
    '/เช็คเอาต์': 'checkout',
    'checkout': 'checkout',
    '/ot': 'ot',
    '/ทำล่วงเวลา': 'ot',
    '/โอที': 'ot',
    '/progress': 'progress_report',
    '/update': 'progress_report',
    '/อัพเดท': 'progress_report',
    '/ความคืบหน้า': 'progress_report',
    '/confirm': 'confirm_with_feedback',
    '/ยืนยัน': 'confirm_with_feedback',
    
    // Creative & Social
    '/imagine': 'imagine',
    '/draw': 'imagine',
    '/gen': 'imagine',
    '/image': 'imagine',
    '/วาดรูป': 'imagine',
    '/สร้างภาพ': 'imagine',
    '/mentions': 'mentions',
    '/แท็ก': 'mentions',
    'กล่าวถึง': 'mentions',
    '/menu': 'menu',
    '/เมนู': 'menu',
    'เมนู': 'menu',
    
    // Flexible Day-Off
    '/dayoff': 'dayoff',
    '/วันหยุด': 'dayoff',
    '/ขอหยุด': 'dayoff',
    '/flexdayoff': 'dayoff',
    
    // Cancel Day-Off
    '/cancel-dayoff': 'cancel_dayoff',
    '/ยกเลิกวันหยุด': 'cancel_dayoff',
    '/canceldayoff': 'cancel_dayoff',
    '/ยกเลิกขอหยุด': 'cancel_dayoff',
    
    // Cancel OT
    '/cancel-ot': 'cancel_ot',
    '/cancelot': 'cancel_ot',
    '/ยกเลิกot': 'cancel_ot',
    '/ยกเลิกโอที': 'cancel_ot',
    'ยกเลิก ot': 'cancel_ot',
    'ยกเลิกโอที': 'cancel_ot',
    
    // Memory Summary (Admin/Owner only)
    '/memorysummary': 'memory_summary',
    '/ขอสรุปความจำ': 'memory_summary',
    '/สรุปความจำ': 'memory_summary',
    'ขอสรุปสัปดาห์นี้': 'memory_summary',
    'ขอสรุปเดือนนี้': 'memory_summary',
    'ขอสรุประยะยาว': 'memory_summary',
    'สรุปความจำ': 'memory_summary',
    
    // Receipt Management
    '/receipt': 'receipt',
    '/ใบเสร็จ': 'receipt',
    '/บันทึกใบเสร็จ': 'receipt',
    '/receiptsummary': 'receipt_summary',
    '/สรุปใบเสร็จ': 'receipt_summary',
    '/businesses': 'businesses',
    '/ธุรกิจ': 'businesses',
    
    // Receipt Export & Shortcuts
    '/export': 'export_month',
    '/ส่งออก': 'export_month',
    '/thismonth': 'this_month',
    '/เดือนนี้': 'this_month',
    'เดือนนี้': 'this_month',
    '/setdefault': 'set_default_business',
    '/ตั้งค่าเริ่มต้น': 'set_default_business',
  };
  
  let commandType: ParsedCommand['commandType'] = null;
  let userQuestion = trimmedText;
  
  // Check for explicit command with full commandMap sync
  for (const [cmd, type] of Object.entries(commandMap)) {
    if (lowerText.startsWith(cmd)) {
      commandType = type;
      // Remove command prefix from question
      userQuestion = trimmedText.slice(cmd.length).trim();
      break;
    }
  }
  
  // Add /history mapping if not already present
  if (!commandType) {
    const historyCommands = ['/history', '/ประวัติ'];
    for (const cmd of historyCommands) {
      if (lowerText.startsWith(cmd)) {
        commandType = 'history';
        userQuestion = trimmedText.slice(cmd.length).trim();
        break;
      }
    }
  }
  
  // If mentioned but no command, treat as 'ask'
  if (isMentioned && !commandType) {
    commandType = 'ask';
    // Remove mention prefix
    userQuestion = trimmedText.replace(/@intern\b|@บอท|@bot\b/gi, '').trim();
  }
  
  // In DM, treat any message as 'ask' if no specific command
  if (isDM && !commandType) {
    commandType = 'ask';
  }
  
  const isCommand = commandType !== null;
  
  // Special handling for work-related keywords
  if (!isCommand && (lowerText.includes('work') || lowerText.includes('งาน'))) {
    if (lowerText.includes('assign') || lowerText.includes('มอบหมาย')) {
      commandType = 'work';
    }
  }
  
  return {
    commandType,
    userQuestion,
    rawText: trimmedText,
    isMentioned,
    isCommand,
  };
}

export function shouldTriggerBot(parsed: ParsedCommand, isDM: boolean): boolean {
  // In DM, always trigger
  if (isDM) return true;
  
  // In group, only trigger if mentioned or command
  return parsed.isMentioned || parsed.isCommand;
}
