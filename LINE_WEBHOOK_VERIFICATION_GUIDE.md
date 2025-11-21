# LINE Webhook Verification Guide

## 🔍 Checking Why Your Bot Isn't Receiving Messages

This guide will help you verify that your LINE bot is properly configured to receive webhook events.

---

## Step 1: Test Webhook Health Check

**Test if the webhook endpoint is accessible:**

```bash
curl https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/line-webhook/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-21T...",
  "service": "line-webhook",
  "version": "2.0.0",
  "secrets_configured": {
    "LINE_CHANNEL_SECRET": true,
    "LINE_CHANNEL_ACCESS_TOKEN": true,
    "SUPABASE_URL": true
  }
}
```

✅ **If you see this response:** The webhook is running and secrets are configured.

❌ **If you get an error:** The edge function may not be deployed properly.

---

## Step 2: Verify LINE Developers Console Configuration

### 2.1 Go to LINE Developers Console

1. Visit: https://developers.line.biz/console/
2. Select your Provider
3. Select your Messaging API Channel

### 2.2 Check Webhook URL

Navigate to **Messaging API** tab and scroll to **Webhook settings**:

**Required Webhook URL:**
```
https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/line-webhook
```

✅ **Verify:**
- [ ] Webhook URL is set exactly as above (no trailing slash, no `/health`)
- [ ] "Use webhook" is **ENABLED** (toggle should be ON)
- [ ] SSL certificate status shows **VALID**

### 2.3 Verify Webhook

Click the **"Verify"** button next to the webhook URL.

✅ **Expected:** You should see "Success" message

❌ **If verification fails:**
- Check that the URL is exactly correct
- Check that LINE_CHANNEL_SECRET matches
- Check edge function logs for errors

---

## Step 3: Enable Required Features

In LINE Developers Console → **Messaging API** tab:

### Bot Settings
- [ ] **Allow bot to join group chats:** ENABLED
- [ ] **Auto-reply messages:** DISABLED (we handle replies via webhook)
- [ ] **Greeting messages:** DISABLED (optional)

### Webhook Settings
- [ ] **Use webhook:** ENABLED
- [ ] **Webhook URL:** Set correctly
- [ ] **Webhook redelivery:** ENABLED (optional, helps with reliability)

---

## Step 4: Test in LINE App

### 4.1 Add Bot to Test Group

1. Open LINE app
2. Create a new group or use existing group
3. Go to group settings → Invite → Invite by Search
4. Search for your bot by bot ID or QR code
5. Add the bot to the group

**Expected:** Bot should join the group

### 4.2 Send Test Message

In the group, send a message:
```
@intern hello
```

**Expected:** Bot should respond

---

## Step 5: Check Edge Function Logs

### View logs in Lovable Dashboard:

1. Go to your Lovable project
2. Click **Backend** (left sidebar)
3. Select **Edge Functions**
4. Click on **`line-webhook`**
5. View the **Logs** tab

### What to look for:

#### ✅ **Good logs (bot is receiving messages):**
```
===============================================================================
[2025-11-21T...] NEW WEBHOOK REQUEST
===============================================================================
[webhook] Method: POST
[webhook] X-Line-Signature header: ✓ Present
[webhook] Signature verification: ✓ VALID
[webhook] ✓ Parsed 1 event(s)
[webhook] Event 1/1:
  - Type: message
  - Source: group (C831b995b55f6f75ae3b7fef832a4f30f)
  - Message type: text
  - Text: "@intern hello"
```

#### ❌ **Bad logs (no webhook calls at all):**
```
(No logs appear when you send messages)
```

**This means:**
- LINE is not calling your webhook
- Check Step 2 again
- Verify webhook URL is correct
- Verify "Use webhook" is enabled

#### ❌ **Bad logs (signature verification fails):**
```
[webhook] Signature verification: ✗ INVALID
[webhook] ✗ REJECTED: Invalid signature
```

**This means:**
- `LINE_CHANNEL_SECRET` in Lovable secrets doesn't match the one in LINE Developers Console
- Go to Lovable → Settings → Secrets
- Update `LINE_CHANNEL_SECRET` with the correct value from LINE Developers Console

---

## Step 6: Verify Secrets Match

### Get secrets from LINE Developers Console:

1. Go to LINE Developers Console
2. Select your channel
3. Go to **Basic settings** tab
4. Find:
   - **Channel secret** (this is `LINE_CHANNEL_SECRET`)
5. Go to **Messaging API** tab
6. Find:
   - **Channel access token (long-lived)** - Click "Issue" if not generated yet
   - This is `LINE_CHANNEL_ACCESS_TOKEN`

### Verify in Lovable:

1. Go to Lovable Dashboard
2. Settings → Secrets
3. Check that `LINE_CHANNEL_SECRET` and `LINE_CHANNEL_ACCESS_TOKEN` are set
4. **If values don't match**, update them

---

## Troubleshooting Common Issues

### Issue 1: Bot joins group but doesn't respond to messages

**Symptoms:**
- Bot appears in member list
- No response when you message it
- No logs in edge function

**Solution:**
- Check webhook URL is configured (Step 2.2)
- Check "Use webhook" is ENABLED (Step 2.2)
- Verify webhook with the "Verify" button (Step 2.3)

---

### Issue 2: "Invalid signature" in logs

**Symptoms:**
- Logs show: `[webhook] Signature verification: ✗ INVALID`

**Solution:**
- `LINE_CHANNEL_SECRET` doesn't match
- Go to LINE Developers Console → Basic settings → Copy "Channel secret"
- Go to Lovable → Settings → Secrets → Update `LINE_CHANNEL_SECRET`

---

### Issue 3: New group members not showing in system

**Symptoms:**
- Bot works in group
- New members who join don't appear in Users page

**Solution:**
- LINE only sends `memberJoined` events if bot has permission
- Check: LINE Developers Console → Messaging API → "Allow bot to join group chats" is ENABLED
- When testing, try:
  1. Remove bot from group
  2. Add bot back to group
  3. Add a new test user
  4. Check logs for `memberJoined` event

---

### Issue 4: No memories being formed

**Symptoms:**
- Bot responds to messages
- Memory page shows "No memories yet"

**Solution:**
- Memories are created by background edge functions
- Check that these edge functions exist and have no errors:
  - `memory-writer` - Called after each message
  - `memory-consolidator` - Runs every 6 hours via cron
- View logs:
  - Lovable → Backend → Edge Functions
  - Select `memory-writer`
  - Check for errors
- Test memory writer manually:
  1. Send several messages in the group
  2. Wait ~1 minute
  3. Check Memory page
  4. If still empty, check `memory-writer` logs for errors

---

## Quick Checklist

Use this checklist to verify everything is configured correctly:

- [ ] Webhook endpoint health check passes
- [ ] Webhook URL configured in LINE Developers Console
- [ ] Webhook URL is exactly: `https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/line-webhook`
- [ ] "Use webhook" toggle is ON
- [ ] Webhook verification passes (click "Verify" button)
- [ ] LINE_CHANNEL_SECRET matches between LINE Console and Lovable Secrets
- [ ] LINE_CHANNEL_ACCESS_TOKEN is set in Lovable Secrets
- [ ] "Allow bot to join group chats" is ENABLED
- [ ] "Auto-reply messages" is DISABLED
- [ ] Bot has been added to test group
- [ ] Edge function logs show incoming webhook calls when you send messages
- [ ] No signature verification errors in logs

---

## Getting Help

If you've followed all steps and the bot still doesn't work:

1. **Check edge function logs** for specific error messages
2. **Share the logs** with the development team
3. **Include:**
   - What you're trying to do
   - What actually happens
   - Any error messages from logs
   - Screenshots of LINE Developers Console configuration

---

## Success Indicators

✅ **Your bot is working correctly when:**

1. **Health check passes**
   - `/health` endpoint returns status: "healthy"

2. **Webhook receives calls**
   - Edge function logs show incoming POST requests
   - Signature verification passes

3. **Events are processed**
   - Logs show `[handleEvent]` entries
   - Logs show `[handleMessageEvent]` entries

4. **Database is updated**
   - Groups appear in Groups page
   - Users appear in Users page
   - Messages are stored

5. **Memories form over time**
   - After several messages, Memory page shows items
   - `memory-writer` logs show successful execution

6. **Bot responds**
   - Mentioning `@intern` in group gets a response
   - Direct messages to bot get responses
