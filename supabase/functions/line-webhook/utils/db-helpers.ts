// =============================
// DATABASE HELPER FUNCTIONS
// =============================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from "../../_shared/logger.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Ensure group exists and is active
export async function ensureGroup(
  lineGroupId: string,
  displayName: string = "Unknown Group"
): Promise<any> {
  const { data: existing, error: fetchError } = await supabase
    .from("groups")
    .select("*")
    .eq("line_group_id", lineGroupId)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    logger.error("Error fetching group", { error: fetchError });
    throw fetchError;
  }

  if (existing) {
    return existing;
  }

  // Create new group
  const { data: newGroup, error: insertError } = await supabase
    .from("groups")
    .insert({
      line_group_id: lineGroupId,
      display_name: displayName,
      status: "active",
      mode: "helper",
      language: "auto",
      joined_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    logger.error("Error creating group", { error: insertError });
    throw insertError;
  }

  logger.info("Created new group", { groupId: newGroup.id });
  return newGroup;
}

// Ensure user exists
export async function ensureUser(
  lineUserId: string,
  displayName: string = "Unknown User"
): Promise<any> {
  const { data: existing, error: fetchError } = await supabase
    .from("users")
    .select("*")
    .eq("line_user_id", lineUserId)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    logger.error("Error fetching user", { error: fetchError });
    throw fetchError;
  }

  if (existing) {
    // Update last_seen_at
    await supabase
      .from("users")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", existing.id);

    return existing;
  }

  // Create new user
  const { data: newUser, error: insertError } = await supabase
    .from("users")
    .insert({
      line_user_id: lineUserId,
      display_name: displayName,
      last_seen_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    logger.error("Error creating user", { error: insertError });
    throw insertError;
  }

  logger.info("Created new user", { userId: newUser.id });
  return newUser;
}

// Insert message
export async function insertMessage(
  groupId: string,
  userId: string | null,
  direction: string,
  text: string,
  commandType: string | null = null
): Promise<any> {
  const hasUrl = /https?:\/\//.test(text);

  const { data, error } = await supabase
    .from("messages")
    .insert({
      group_id: groupId,
      user_id: userId,
      direction,
      text,
      command_type: commandType,
      has_url: hasUrl,
      sent_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    logger.error("Error inserting message", { error });
    throw error;
  }

  return data;
}

// Insert alert
export async function insertAlert(
  groupId: string,
  type: string,
  severity: string,
  summary: string,
  details: any = {}
): Promise<void> {
  const { error } = await supabase.from("alerts").insert({
    group_id: groupId,
    type,
    severity,
    summary,
    details,
    created_at: new Date().toISOString(),
  });

  if (error) {
    logger.error("Error inserting alert", { error });
  }
}

// Update group activity
export async function updateGroupActivity(groupId: string): Promise<void> {
  await supabase
    .from("groups")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", groupId);
}
