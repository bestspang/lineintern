# LINE Intern Backend Service - Setup Guide

This document provides instructions for deploying and configuring the LINE Intern bot backend.

## Architecture Overview

The LINE Intern backend consists of multiple Supabase Edge Functions:

1. **line-webhook** - Main webhook endpoint for receiving LINE events
2. **health** - Health check endpoint for monitoring
3. **attendance-validate-token** - Validates attendance submission tokens
4. **attendance-submit** - Processes photo and location submissions
5. **attendance-daily-summary** - Sends daily attendance summaries (cron job)

## Prerequisites

1. LINE Messaging API Channel (from LINE Developers Console)
2. OpenAI API Key
3. Supabase Project (already configured in this project)

## Environment Variables / Secrets

The following secrets are required and have been configured in Supabase:

- `LINE_CHANNEL_SECRET` - Your LINE channel secret
- `LINE_CHANNEL_ACCESS_TOKEN` - Your LINE channel access token
- `OPENAI_API_KEY` - Your OpenAI API key
- `OPENAI_MODEL` (optional) - Defaults to "gpt-4o-mini"
- `APP_ENV` (optional) - "sandbox" or "production"

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
- `/tasks @user` - List pending work for a specific user
- `/confirm @user [keywords]` - Approve work (supports: all, overdue, urgent, feedback)
  - Examples: `/confirm @Alice overdue`, `/confirm @Bob feedback`
- `/progress [text]` or `/update [text]` - Report work progress
  - Example: `/progress ทำไปแล้ว 50%`
- `/reminders` or `/เตือน` - List all pending work reminders with urgency indicators

**🕐 Attendance (DM only):**
- `checkin` or `เช็คอิน` or `เข้างาน` - Check in to work
- `checkout` or `เช็คเอาต์` or `ออกงาน` - Check out from work
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

### OpenAI errors

- Verify `OPENAI_API_KEY` is valid
- Check OpenAI account has credits
- Review model name (should be "gpt-4o-mini" or similar)

### Database errors

- Check Supabase project is active
- Verify database tables exist
- Check RLS policies allow service role access

## Advanced Configuration

### Changing OpenAI Model

Update the `OPENAI_MODEL` secret in Supabase to use a different model:
- `gpt-4o-mini` - Fast and cost-effective (default)
- `gpt-4o` - More powerful
- `gpt-4-turbo` - Latest GPT-4 model

### Customizing Behavior

Edit the prompts in `supabase/functions/line-webhook/index.ts`:
- `SYSTEM_KNOWLEDGE_PROMPT` - The bot's personality and role
- `COMMON_BEHAVIOR_PROMPT` - How the bot interprets commands

### Adding New Commands

1. Update `parseCommand()` function to detect new command
2. Update `handleMessageEvent()` to handle new command type
3. Update context collection if needed
4. Update prompts to explain new command

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
- OpenAI requests timeout after 30 seconds

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
