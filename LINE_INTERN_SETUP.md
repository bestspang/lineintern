# LINE Intern Backend Service - Setup Guide

This document provides instructions for deploying and configuring the LINE Intern bot backend.

<!-- SYNC STATUS: Last verified 2025-12-02 -->
<!-- AI MODEL: google/gemini-2.5-flash -->
<!-- API KEY: LOVABLE_API_KEY (auto-provisioned) -->

## Architecture Overview

The LINE Intern backend consists of multiple Supabase Edge Functions:

1. **line-webhook** - Main webhook endpoint for receiving LINE events
2. **health** - Health check endpoint for monitoring
3. **attendance-validate-token** - Validates attendance submission tokens
4. **attendance-submit** - Processes photo and location submissions
5. **attendance-daily-summary** - Sends daily attendance summaries (cron job)
6. **work-reminder** - Sends work assignment reminders
7. **work-summary** - Generates work summary reports

## Prerequisites

1. LINE Messaging API Channel (from LINE Developers Console)
2. Lovable Cloud enabled (provides AI Gateway - no external API key needed)
3. Supabase Project (already configured in this project)

## Environment Variables / Secrets

The following secrets are required and have been configured:

- `LINE_CHANNEL_SECRET` - Your LINE channel secret
- `LINE_CHANNEL_ACCESS_TOKEN` - Your LINE channel access token
- `LOVABLE_API_KEY` - Auto-provisioned by Lovable Cloud
- `APP_ENV` (optional) - "sandbox" or "production"

> **Note:** AI capabilities are provided through Lovable AI Gateway, which supports multiple models without requiring external API keys.

## Deployment

The edge functions are automatically deployed when you push changes to your Supabase project.

### Webhook URL

After deployment, your webhook URL will be:

```
https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/line-webhook
```

### Health Check URL

```
https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/health
```

## LINE Messaging API Configuration

1. Go to [LINE Developers Console](https://developers.line.biz/)
2. Select your channel
3. Go to "Messaging API" tab
4. Set the Webhook URL to: `https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/line-webhook`
5. Enable "Use webhook"
6. Disable "Auto-reply messages" (optional, to prevent conflicts)
7. Enable "Allow bot to join group chats"

## Features

### Supported Commands

**💬 General:**
- `@intern [question]` - Ask any question
- `/help` or `/ช่วยเหลือ` - Show help guide with all available commands

**📝 Conversations:**
- `/summary [period]` - Summarize chat (e.g., /summary today, /summary 100)
- `/find [keyword]` - Search messages
- `/mentions [@user]` - Find mentions of a user

**✅ Tasks & Work Management:**
- `/todo [task]` - Create a task/todo
- `/remind [task] [time]` - Set a reminder
- `/work @user [task]` or `/มอบหมายงาน` - Assign work to someone
- `/tasks @user` - List pending work for a specific user
- `/confirm @user [keywords]` - Approve work (supports: all, overdue, urgent, feedback)
  - Examples: `/confirm @Alice overdue`, `/confirm @Bob feedback`
- `/progress [text]` or `/update [text]` - Report work progress
  - Example: `/progress ทำไปแล้ว 50%`
- `/reminders` or `/เตือน` - List all pending work reminders with urgency indicators

**🕐 Attendance (DM only):**
- `checkin` or `เช็คอิน` or `เข้างาน` - Check in to work
- `checkout` or `เช็คเอาต์` or `ออกงาน` - Check out from work
- `ขอ OT [hours]` or `OT request [hours]` - Request overtime
- `menu` or `เมนู` - Open employee self-service menu
- `history` or `ประวัติ` - View attendance history
  - ⚠️ Must be sent in DM (private message) only
  - Generates a one-time link to take photo and confirm location
  - Posts confirmation to configured announcement LINE group
  - See [ATTENDANCE_SYSTEM.md](ATTENDANCE_SYSTEM.md) for full documentation

**📚 Knowledge:**
- `/faq [question]` - Search knowledge base
- `/train [content]` - Add knowledge to database

**📊 Analytics:**
- `/report [period]` - Generate group activity report

**🎨 Creative:**
- `/imagine [description]` - Generate AI image

**⚙️ Settings:**
- `/mode [mode]` - Change bot mode (helper, faq, report, fun, safety, magic)
- `/status` - View AI personality and memory stats

### Group Chat Support
- Responds to `@intern` mentions or direct commands
- Detects and answers questions naturally
- Maintains conversation context

**In DMs:**
- Any message triggers a response (no need for @intern)
- All commands work without prefixes

### Event Handling

The bot handles:
- **Join events** - When bot is added to a group
- **Leave events** - When bot is removed from a group
- **Message events** - Text messages from users
- **Future support** - Member join/leave events

### Database Integration

The bot automatically:
- Creates/updates group records when added to groups
- Creates/updates user records when users send messages
- Stores all messages (human and bot) in the database
- Creates alerts for potential security issues
- Updates activity timestamps

### Safety Features

Basic safety scanning includes:
- URL detection in messages
- Suspicious shortened URL detection (bit.ly, tinyurl, etc.)
- Error tracking and alerting
- Failed reply tracking

## Testing

### 1. Test Health Endpoint

```bash
curl https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/health
```

Expected response:
```json
{
  "status": "ok",
  "environment": "sandbox",
  "db": "ok",
  "last_webhook_event_at": "2024-...",
  "timestamp": "2024-...",
  "functions": {
    "line_webhook": "deployed",
    "health": "deployed"
  }
}
```

### 2. Test LINE Webhook

From LINE Developers Console:
1. Go to Messaging API tab
2. Click "Verify" button next to webhook URL
3. Should see success message

### 3. Test Bot in LINE App

1. Add the bot to a group or send a DM
2. Send a message: `@intern hello`
3. Bot should respond

### 4. Check Logs

View edge function logs in Supabase Dashboard:
- Go to Edge Functions → line-webhook → Logs
- Check for any errors or warnings

## Monitoring

### Control Panel Integration

The "LINE Intern Control Panel" (the dashboard you're using) automatically monitors:
- Groups and their status
- Messages and activity
- Alerts and errors
- Tasks and reminders
- Knowledge base usage

### Health Endpoint

The `/health` endpoint is called by the dashboard's "Integrations" page to show:
- Webhook status
- Database connection
- Last activity timestamp

## Troubleshooting

### Bot doesn't respond

1. Check webhook is enabled in LINE Console
2. Verify webhook URL is correct
3. Check edge function logs for errors
4. Verify secrets are set correctly
5. Test with `/help` command

### Signature verification fails

- Ensure `LINE_CHANNEL_SECRET` is correct
- Check LINE Console for the correct value

### AI errors

- Verify `LOVABLE_API_KEY` is configured (auto-provisioned by Lovable Cloud)
- Check Lovable Cloud status in project settings
- Review edge function logs for specific error messages
- Try different AI model in prompts.ts if needed

### Database errors

- Check Supabase project is active
- Verify database tables exist
- Check RLS policies allow service role access

## Advanced Configuration

### Changing AI Model

Update the model in `supabase/functions/line-webhook/utils/prompts.ts`:

```typescript
body: JSON.stringify({
  model: "google/gemini-2.5-flash", // Change this
  // ...
})
```

Available models via Lovable AI:
- `google/gemini-2.5-flash` - Fast and efficient (default)
- `google/gemini-2.5-pro` - More powerful reasoning
- `google/gemini-2.5-flash-lite` - Fastest, best for simple tasks
- `openai/gpt-5-mini` - Alternative option
- `openai/gpt-5` - Most powerful (slower)

### Customizing Behavior

Edit the prompts in `supabase/functions/line-webhook/utils/prompts.ts`:
- `SYSTEM_KNOWLEDGE_PROMPT` - The bot's personality and role
- `buildCommonBehaviorPrompt()` - How the bot interprets commands

### Adding New Commands

1. Update `parseCommand()` function in `utils/command-parser.ts` to detect new command
2. Update `handleMessageEvent()` in `index.ts` to handle new command type
3. Update context collection if needed
4. Update prompts to explain new command
5. Add command to `bot_commands` table with aliases in `command_aliases` table

## API Endpoints

### POST /line-webhook

Receives LINE webhook events.

**Headers:**
- `X-Line-Signature` - HMAC-SHA256 signature

**Body:**
```json
{
  "destination": "...",
  "events": [...]
}
```

### GET /health

Returns health status.

**Response:**
```json
{
  "status": "ok",
  "environment": "sandbox",
  "db": "ok",
  "last_webhook_event_at": "2024-...",
  "timestamp": "2024-..."
}
```

## Security

- Webhook signature verification using HMAC-SHA256
- All secrets stored in Supabase (never in code)
- Service role key used for database access
- JWT verification disabled (LINE doesn't send JWTs)
- CORS enabled for health endpoint only

## Performance

- Async event processing
- Parallel event handling
- Message context limited to 50 recent messages
- Knowledge base queries limited to 10 items
- AI requests timeout after 30 seconds

## Future Enhancements

Planned features:
- Push API support for scheduled reminders
- Advanced safety scanning with AI
- Image/sticker/file support
- Member join/leave tracking
- Group member role management
- Multi-language support
- Conversation context persistence
- Analytics and reporting improvements

## Support

For issues or questions:
1. Check edge function logs in Supabase
2. Review LINE Console webhook status
3. Check Control Panel alerts section
4. Review this documentation

## License

Internal use only - LINE Intern Control Panel
