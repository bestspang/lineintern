// =============================
// TYPE DEFINITIONS
// =============================

export interface LineEvent {
  type: string;
  timestamp?: number;
  source: {
    type: string;
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
  replyToken?: string;
  message?: {
    id: string;
    type: string;
    text: string;
  };
  joined?: {
    members: Array<{ type: string; userId: string }>;
  };
  left?: {
    members: Array<{ type: string; userId: string }>;
  };
}

export interface WorkAssignment {
  assigneeLineUserId: string;
  assigneeDisplayName: string;
  taskDescription: string;
  deadline: Date | null;
  rawDeadlineText: string;
}

export interface ApprovalResult {
  detected: boolean;
  approvedCount: number;
  message: string;
}

export interface ReminderPreferenceResult {
  detected: boolean;
  intervals?: number[];
  message: string;
}

export interface OTRequestResult {
  detected: boolean;
  message: string;
}

export interface AttendanceCommandResult {
  detected: boolean;
  type?: string;
  message: string;
  quickReply?: any;
}

export interface WorkProgressResult {
  detected: boolean;
  message: string;
}

export interface QuickReply {
  items: Array<{
    type: string;
    action: {
      type: string;
      label: string;
      text?: string;
      data?: string;
    };
  }>;
}

export interface MessageContext {
  recent_messages: string;
  thread_context: string;
  working_memory: string;
  memory_context: string;
  knowledge_snippets: string;
  analytics_snapshot: string;
  work_context: string;
  social_context: string;
}

export interface ParsedCommand {
  shouldRespond: boolean;
  commandType: string;
  userMessage: string;
}
