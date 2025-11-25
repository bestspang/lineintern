// =============================
// LINE API UTILITIES
// =============================

import type { QuickReply } from "../types.ts";

const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
const LINE_CHANNEL_SECRET = Deno.env.get("LINE_CHANNEL_SECRET");

export async function verifySignature(body: string, signature: string): Promise<boolean> {
  if (!LINE_CHANNEL_SECRET) {
    console.error('[verifySignature] LINE_CHANNEL_SECRET not configured');
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(LINE_CHANNEL_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(body)
    );
    
    const calculatedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
    const isValid = calculatedSignature === signature;
    
    if (!isValid) {
      console.error('[verifySignature] Signature mismatch');
      console.error(`[verifySignature] Expected: ${calculatedSignature}`);
      console.error(`[verifySignature] Received: ${signature}`);
    }
    
    return isValid;
  } catch (error) {
    console.error('[verifySignature] Error:', error);
    return false;
  }
}

export async function replyToLine(
  replyToken: string,
  text: string,
  quickReply?: QuickReply
): Promise<void> {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN not configured');
  }

  const message: any = {
    type: "text",
    text: text,
  };

  if (quickReply) {
    message.quickReply = quickReply;
  }

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [message],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE API error: ${response.status} ${errorText}`);
  }
}

export async function pushToLine(to: string, text: string): Promise<void> {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN not configured');
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE API error: ${response.status} ${errorText}`);
  }
}

export async function getUserProfile(userId: string): Promise<any> {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN not configured');
  }

  const response = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
    headers: {
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function getGroupSummary(groupId: string): Promise<any> {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN not configured');
  }

  const response = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
    headers: {
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

export function getSimpleQuickReply(locale: 'th' | 'en'): QuickReply {
  return {
    items: [
      {
        type: "action",
        action: {
          type: "message",
          label: locale === 'th' ? "สรุปแชท" : "Summary",
          text: "/summary"
        }
      },
      {
        type: "action",
        action: {
          type: "message",
          label: locale === 'th' ? "งานของฉัน" : "My tasks",
          text: "/tasks"
        }
      },
      {
        type: "action",
        action: {
          type: "message",
          label: locale === 'th' ? "ความช่วยเหลือ" : "Help",
          text: "/help"
        }
      }
    ]
  };
}
