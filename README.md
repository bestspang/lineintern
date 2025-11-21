# LINE Intern - AI-Powered LINE Bot with Full-Stack Control Panel

An intelligent LINE bot with advanced features including conversation management, work tracking, knowledge base, employee attendance system, and social intelligence.

## 🚀 Features

### 💬 Conversation Management
- AI-powered responses using Lovable AI Gateway (Gemini 2.5 Flash)
- Context-aware conversations with memory
- Multi-language support (Thai/English)
- Chat summaries and intelligent message search
- Thread detection and conversation tracking

### ✅ Work Management
- Smart work assignment detection from natural language
- Task creation and tracking with due dates
- Progress reporting with AI feedback and quality assessment
- Automated reminders for pending and overdue work
- Work approval workflows with smart prioritization
- Comprehensive work analytics

### 📚 Knowledge Base
- FAQ system with semantic search
- Training from documents and URLs
- Multi-language knowledge items
- Usage tracking and analytics
- Dynamic command system

### 🕐 Attendance System
- **Check-in/Check-out** via LINE DM with secure one-time links
- **Photo capture** with mobile camera integration
- **GPS validation** with geofence checking
- **Automated daily summaries** sent to LINE groups
- **Analytics dashboard** with trends, peak hours, late patterns
- **Admin portal** for employees, branches, logs, and settings
- See [ATTENDANCE_SYSTEM.md](ATTENDANCE_SYSTEM.md) for full documentation

### 🧠 Social Intelligence
- **Personality analysis** - Infers traits from communication patterns
- **Relationship mapping** - Detects and visualizes user relationships
- **Behavioral pattern detection** - Learns user preferences and habits
- **Memory consolidation** - Long-term memory with importance scoring
- **Mood tracking** - Monitors group energy and sentiment

### 🛡️ Safety & Monitoring
- URL risk detection with suspicious pattern matching
- Spam prevention and rate limiting
- Comprehensive alert system
- Safety rules engine
- Detailed logging and audit trails

### 📊 Analytics & Reports
- Group activity metrics
- User engagement statistics
- Work progress tracking
- Attendance analytics
- Custom date range reports

## 🏗️ Architecture

- **Frontend**: React + TypeScript + Vite + shadcn/ui + Tailwind CSS
- **Backend**: Supabase Edge Functions (Deno)
- **Database**: PostgreSQL (Supabase)
- **AI**: Lovable AI Gateway (Gemini 2.5 Flash)
- **Storage**: Supabase Storage for photos and assets
- **LINE Integration**: LINE Messaging API with webhook

## 📋 Prerequisites

- LINE Messaging API Channel
- Lovable Cloud account (for AI and backend)
- Node.js 18+ (for local development)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
npm install
```

### 2. Configure LINE Webhook

1. Get your webhook URL: `https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/line-webhook`
2. Go to [LINE Developers Console](https://developers.line.biz/)
3. Set webhook URL and enable
4. Configure bot settings (allow groups, disable auto-reply)

See [LINE_INTERN_SETUP.md](LINE_INTERN_SETUP.md) for detailed setup instructions.

### 3. Run the Dashboard

```bash
npm run dev
```

The dashboard will be available at `http://localhost:5173`

### 4. Test the Bot

1. Add the bot to a LINE group or send a DM
2. Send: `@intern hello` (in group) or just `hello` (in DM)
3. Bot should respond

## 📚 Documentation

- **[LINE_INTERN_SETUP.md](LINE_INTERN_SETUP.md)** - Setup and configuration guide
- **[LINE_INTERN_DEPLOYMENT_GUIDE.md](LINE_INTERN_DEPLOYMENT_GUIDE.md)** - Deployment and testing
- **[ATTENDANCE_SYSTEM.md](ATTENDANCE_SYSTEM.md)** - Attendance system documentation
- **[WORK_REMINDER_SYSTEM.md](WORK_REMINDER_SYSTEM.md)** - Work tracking documentation
- **[LINE_WEBHOOK_VERIFICATION_GUIDE.md](LINE_WEBHOOK_VERIFICATION_GUIDE.md)** - Webhook verification

## 💬 Bot Commands

### General
- `@intern [question]` - Ask any question
- `/help` - Show help guide with all commands

### Conversations
- `/summary [period]` - Summarize chat
- `/find [keyword]` - Search messages
- `/mentions [@user]` - Find user mentions

### Tasks & Work
- `/todo [task]` - Create a task
- `/remind [task] [time]` - Set a reminder
- `/tasks @user` - List pending work
- `/confirm @user` - Approve work
- `/progress [text]` - Report work progress
- `/reminders` - List all pending work

### Attendance (DM only)
- `checkin` or `เช็คอิน` - Check in to work
- `checkout` or `เช็คเอาต์` - Check out from work

### Knowledge
- `/faq [question]` - Search knowledge base
- `/train [content]` - Add knowledge

### Analytics
- `/report [period]` - Generate activity report

### Creative
- `/imagine [description]` - Generate AI image

### Settings
- `/mode [mode]` - Change bot mode
- `/status` - View AI personality stats

## 🎨 Dashboard Pages

### Main Features
- **Overview** - System status and quick stats
- **Groups** - Manage LINE groups
- **Users** - User profiles and activity
- **Messages** - Chat history and search
- **Alerts** - Safety alerts and monitoring

### Work Management
- **Tasks** - Task management and tracking
- **Cron Jobs** - Scheduled job monitoring

### Attendance System
- **Employees** - Employee management
- **Branches** - Branch and geofence configuration
- **Attendance Logs** - Real-time attendance monitoring
- **Analytics** - Attendance trends and patterns
- **Summaries** - Daily attendance reports
- **Settings** - Global/branch/employee settings

### Intelligence
- **Memory** - Long-term memory management
- **Memory Analytics** - Memory usage insights
- **Personality** - AI personality state
- **Training** - Knowledge base training

### Configuration
- **Knowledge Base** - FAQ management
- **Commands** - Command configuration
- **Safety Rules** - Safety rule engine
- **Settings** - Global settings
- **Integrations** - Integration status

## 🔧 Technology Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI component library
- **TanStack Query** - Data fetching and caching
- **React Router** - Routing
- **Recharts** - Data visualization

### Backend
- **Supabase** - Backend as a Service
  - PostgreSQL database
  - Edge Functions (Deno)
  - Storage for photos
  - Realtime subscriptions
  - Row Level Security (RLS)
- **Lovable AI Gateway** - AI model access (Gemini 2.5)

### External Services
- **LINE Messaging API** - LINE bot integration
- **Cron Jobs** - Scheduled tasks (pg_cron)

## 🔒 Security

- Webhook signature verification (HMAC-SHA256)
- Row Level Security (RLS) on all database tables
- Secure secret management (Supabase Vault)
- JWT authentication for dashboard
- Photo storage with private access control
- Input validation and sanitization
- Rate limiting and spam prevention

## 📊 Database Schema

Key tables:
- `groups` - LINE groups and DMs
- `users` - LINE users
- `messages` - Chat messages
- `tasks` - Work assignments and todos
- `employees` - Employee records
- `branches` - Office/branch locations
- `attendance_logs` - Check-in/check-out records
- `knowledge_items` - FAQ and documentation
- `memory_items` - Long-term memory
- `personality_state` - AI personality tracking
- `user_profiles` - Social intelligence profiles
- `alerts` - Safety and error alerts

See the database schema in Lovable Cloud for complete details.

## 🚀 Deployment

This project is designed to be deployed on Lovable Cloud:

1. Push changes to your repository
2. Lovable automatically deploys the frontend and edge functions
3. Configure your LINE webhook URL
4. Test the bot

For production deployment:
- Enable production mode in settings
- Configure custom domain (optional)
- Set up monitoring and alerts
- Review security settings

## 🧪 Testing

### Unit Tests
```bash
npm run test
```

### Integration Tests
- Test bot commands in LINE app
- Verify webhook signature verification
- Check database operations
- Test edge functions manually

### Testing Checklist
See [LINE_INTERN_DEPLOYMENT_GUIDE.md](LINE_INTERN_DEPLOYMENT_GUIDE.md) for complete testing checklist.

## 🛠️ Development

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Code Structure

```
src/
├── components/         # React components
│   ├── ui/            # shadcn/ui components
│   └── ...            # Feature components
├── pages/             # Page components
│   ├── attendance/    # Attendance system pages
│   └── ...            # Other pages
├── hooks/             # Custom React hooks
├── lib/               # Utility functions
├── contexts/          # React contexts
└── integrations/      # External integrations
    └── supabase/      # Supabase client and types

supabase/
└── functions/         # Edge Functions
    ├── line-webhook/  # Main webhook handler
    ├── health/        # Health check
    ├── attendance-*/  # Attendance functions
    └── ...            # Other functions
```

## 🤝 Contributing

This is an internal project. For feature requests or bug reports:
1. Check edge function logs
2. Review database for errors
3. Check LINE webhook status
4. Consult documentation

## 📄 License

Internal use only - LINE Intern Control Panel

## 🆘 Support

### Common Issues

**Bot not responding:**
- Check webhook is enabled in LINE Console
- Verify webhook URL is correct
- Check edge function logs
- Test with `/help` command

**Attendance not working:**
- Verify employee has LINE User ID linked
- Check attendance settings are enabled
- Ensure commands are sent in DM (not group)
- Review attendance-specific logs

**AI responses failing:**
- Check Lovable AI credits
- Review rate limits
- Check edge function logs for errors

### Resources
- [LINE Messaging API Docs](https://developers.line.biz/en/docs/messaging-api/)
- [Supabase Documentation](https://supabase.com/docs)
- [Lovable Documentation](https://docs.lovable.dev/)

---

**Project URL**: https://lovable.dev/projects/54769e4d-0064-470c-b327-cf59e438bb54
