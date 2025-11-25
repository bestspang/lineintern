import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  MessageSquare, 
  FileText, 
  ListChecks, 
  BarChart3, 
  HelpCircle,
  Sparkles,
  Clock,
  Users,
  Shield
} from "lucide-react";

const Index = () => {
  const features = [
    {
      icon: MessageSquare,
      title: "Instant Q&A",
      description: "Get quick answers from your team's knowledge base and ongoing conversations.",
    },
    {
      icon: FileText,
      title: "Smart Summaries",
      description: "Automatically digest long conversations into clear, actionable summaries.",
    },
    {
      icon: ListChecks,
      title: "Task Management",
      description: "Create todos and set reminders directly from your chat conversations.",
    },
    {
      icon: BarChart3,
      title: "Group Analytics",
      description: "Track activity, engagement, and health metrics for your group.",
    },
  ];

  const commands = [
    { cmd: "/summary", desc: "Get a quick summary of recent messages" },
    { cmd: "/faq", desc: "Search team knowledge base and FAQs" },
    { cmd: "/todo", desc: "Create tasks and set reminders" },
    { cmd: "/report", desc: "View group activity and engagement report" },
    { cmd: "/checkin", desc: "Request check-in link for attendance" },
    { cmd: "/checkout", desc: "Request check-out link for attendance" },
    { cmd: "/help", desc: "See all available commands" },
  ];

  const mockMessages = [
    { user: "Alice", text: "Can someone remind us about the client meeting?", time: "2:34 PM" },
    { user: "You", text: "@intern /todo remind everyone tomorrow 10am about client meeting", time: "2:35 PM" },
    { user: "LINE Intern", text: "✓ Got it! I'll remind everyone tomorrow at 10:00 AM about the client meeting.", time: "2:35 PM", isBot: true },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-accent/5">
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
        <div className="container relative mx-auto px-4 py-12 sm:py-20 md:py-32">
          <div className="mx-auto max-w-4xl text-center">
            <Badge className="mb-4 sm:mb-6 bg-primary/10 text-primary hover:bg-primary/20 border-primary/20 text-xs sm:text-sm">
              <Sparkles className="mr-1 sm:mr-2 h-3 w-3" />
              AI-Powered Productivity
            </Badge>
            <h1 className="mb-4 sm:mb-6 text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground">
              Meet Your Team's
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"> AI Intern</span>
            </h1>
            <p className="mb-6 sm:mb-8 text-base sm:text-lg md:text-xl text-muted-foreground px-2">
              LINE Intern lives in your group chat, helping your team stay organized, informed, and productive with smart summaries, instant answers, and automated task management.
            </p>
            <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:justify-center px-4">
              <Button size="lg" className="gap-2 shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-hover)] transition-shadow text-sm sm:text-base h-10 sm:h-11">
                <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" />
                Add to LINE
              </Button>
              <Button size="lg" variant="outline" className="gap-2 text-sm sm:text-base h-10 sm:h-11">
                <HelpCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 sm:py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="mb-8 sm:mb-16 text-center">
            <h2 className="mb-3 sm:mb-4 text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">
              Everything Your Team Needs
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground px-2">
              Powerful features that make group collaboration effortless
            </p>
          </div>
          <div className="grid gap-4 sm:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Card 
                  key={idx} 
                  className="group border-border/50 transition-all hover:border-primary/50 hover:shadow-[var(--shadow-soft)]"
                >
                  <CardContent className="p-4 sm:p-6">
                    <div className="mb-3 sm:mb-4 inline-flex rounded-lg bg-primary/10 p-2 sm:p-3 text-primary transition-transform group-hover:scale-110">
                      <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                    <h3 className="mb-2 text-lg sm:text-xl font-semibold text-foreground">
                      {feature.title}
                    </h3>
                    <p className="text-sm sm:text-base text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Commands Section */}
      <section className="bg-muted/30 py-12 sm:py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="mb-8 sm:mb-16 text-center">
            <h2 className="mb-3 sm:mb-4 text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">
              Simple Commands
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground px-2">
              Just mention @intern or use these quick commands
            </p>
          </div>
          <div className="mx-auto max-w-2xl space-y-3 sm:space-y-4">
            {commands.map((command, idx) => (
              <Card 
                key={idx} 
                className="border-border/50 transition-all hover:border-primary/50 hover:shadow-[var(--shadow-soft)]"
              >
                <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 p-4 sm:p-6">
                  <code className="rounded bg-primary/10 px-2 sm:px-3 py-1 sm:py-1.5 font-mono text-xs sm:text-sm font-semibold text-primary shrink-0">
                    {command.cmd}
                  </code>
                  <p className="text-sm sm:text-base text-muted-foreground">{command.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section className="py-12 sm:py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="mb-8 sm:mb-16 text-center">
            <h2 className="mb-3 sm:mb-4 text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">
              See It In Action
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground px-2">
              Watch LINE Intern help your team stay on track
            </p>
          </div>
          <div className="mx-auto max-w-2xl">
            <Card className="overflow-hidden border-border/50 shadow-[var(--shadow-soft)]">
              <div className="bg-primary/5 p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex gap-1 sm:gap-1.5">
                    <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-destructive/60" />
                    <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-accent/60" />
                    <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-primary/60" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                    Project Team Chat
                  </span>
                </div>
              </div>
              <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6">
                {mockMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col gap-1 ${
                      msg.isBot ? "items-start" : "items-start"
                    }`}
                  >
                    <div className="flex items-center gap-1 sm:gap-2">
                      <span className={`text-xs sm:text-sm font-semibold ${msg.isBot ? "text-primary" : "text-foreground"}`}>
                        {msg.user}
                      </span>
                      <span className="text-[10px] sm:text-xs text-muted-foreground">{msg.time}</span>
                    </div>
                    <div
                      className={`rounded-lg px-3 py-2 sm:px-4 ${
                        msg.isBot
                          ? "bg-primary/10 text-foreground border border-primary/20"
                          : msg.user === "You"
                          ? "bg-muted text-foreground"
                          : "bg-card text-foreground border border-border"
                      }`}
                    >
                      <p className="text-xs sm:text-sm">{msg.text}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="bg-gradient-to-br from-primary/5 via-background to-accent/5 py-12 sm:py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="mb-8 sm:mb-16 text-center">
            <h2 className="mb-3 sm:mb-4 text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">
              Why Teams Love LINE Intern
            </h2>
          </div>
          <div className="grid gap-4 sm:gap-8 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
            <Card className="border-border/50">
              <CardContent className="p-4 sm:p-6 text-center">
                <div className="mb-3 sm:mb-4 inline-flex rounded-full bg-primary/10 p-3 sm:p-4">
                  <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                </div>
                <h3 className="mb-2 text-lg sm:text-xl font-semibold text-foreground">Save Time</h3>
                <p className="text-sm sm:text-base text-muted-foreground">
                  Automate routine tasks and get instant answers without searching through message history
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="p-4 sm:p-6 text-center">
                <div className="mb-3 sm:mb-4 inline-flex rounded-full bg-primary/10 p-3 sm:p-4">
                  <Users className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                </div>
                <h3 className="mb-2 text-lg sm:text-xl font-semibold text-foreground">Stay Organized</h3>
                <p className="text-sm sm:text-base text-muted-foreground">
                  Keep everyone aligned with summaries, reminders, and structured information
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="p-4 sm:p-6 text-center">
                <div className="mb-3 sm:mb-4 inline-flex rounded-full bg-primary/10 p-3 sm:p-4">
                  <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                </div>
                <h3 className="mb-2 text-lg sm:text-xl font-semibold text-foreground">Safe & Private</h3>
                <p className="text-sm sm:text-base text-muted-foreground">
                  Your data stays in your LINE group with enterprise-grade security
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 sm:py-20 md:py-32">
        <div className="container mx-auto px-4">
          <Card className="overflow-hidden border-border/50 bg-gradient-to-br from-primary/10 via-background to-accent/10 shadow-[var(--shadow-soft)]">
            <CardContent className="p-6 sm:p-8 md:p-12 text-center">
              <h2 className="mb-3 sm:mb-4 text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">
                Ready to Boost Your Team's Productivity?
              </h2>
              <p className="mb-6 sm:mb-8 text-sm sm:text-base md:text-lg text-muted-foreground px-2">
                Add LINE Intern to your group chat in seconds and start working smarter
              </p>
              <Button size="lg" className="gap-2 shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-hover)] transition-shadow text-sm sm:text-base h-10 sm:h-11">
                <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" />
                Add to LINE Now
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-muted/30 py-6 sm:py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-between gap-3 sm:gap-4 md:flex-row">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              <span className="text-sm sm:text-base font-semibold text-foreground">LINE Intern</span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground text-center">
              © 2025 LINE Intern. Your AI teammate for LINE groups.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
