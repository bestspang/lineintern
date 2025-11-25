// =============================
// COMMAND PARSING UTILITIES
// =============================

export interface ParsedCommand {
  commandType: 'ask' | 'summary' | 'faq' | 'todo' | 'report' | 'help' | 'tasks' | 'checkin' | 'checkout' | 'work' | null;
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
    '/summary': 'summary',
    '/สรุป': 'summary',
    '/faq': 'faq',
    '/ถามตอบ': 'faq',
    '/todo': 'todo',
    '/tasks': 'tasks',
    '/งาน': 'tasks',
    '/report': 'report',
    '/รายงาน': 'report',
    '/help': 'help',
    '/ช่วยเหลือ': 'help',
    '/checkin': 'checkin',
    '/เข้างาน': 'checkin',
    '/checkout': 'checkout',
    '/ออกงาน': 'checkout',
    '/work': 'work',
  };
  
  let commandType: ParsedCommand['commandType'] = null;
  let userQuestion = trimmedText;
  
  // Check for explicit command
  for (const [cmd, type] of Object.entries(commandMap)) {
    if (lowerText.startsWith(cmd)) {
      commandType = type;
      // Remove command prefix from question
      userQuestion = trimmedText.slice(cmd.length).trim();
      break;
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
      isCommand;
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
