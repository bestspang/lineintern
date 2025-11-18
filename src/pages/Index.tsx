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
        <div className="container relative mx-auto px-4 py-20 md:py-32">
          <div className="mx-auto max-w-4xl text-center">
            <Badge className="mb-6 bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">
              <Sparkles className="mr-2 h-3 w-3" />
              AI-Powered Productivity
            </Badge>
            <h1 className="mb-6 text-4xl font-bold tracking-tight text-foreground md:text-6xl">
              Meet Your Team's
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"> AI Intern</span>
            </h1>
            <p className="mb-8 text-lg text-muted-foreground md:text-xl">
              LINE Intern lives in your group chat, helping your team stay organized, informed, and productive with smart summaries, instant answers, and automated task management.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Button size="lg" className="gap-2 shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-hover)] transition-shadow">
                <MessageSquare className="h-5 w-5" />
                Add to LINE
              </Button>
              <Button size="lg" variant="outline" className="gap-2">
                <HelpCircle className="h-5 w-5" />
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
              Everything Your Team Needs
            </h2>
            <p className="text-lg text-muted-foreground">
              Powerful features that make group collaboration effortless
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Card 
                  key={idx} 
                  className="group border-border/50 transition-all hover:border-primary/50 hover:shadow-[var(--shadow-soft)]"
                >
                  <CardContent className="p-6">
                    <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-3 text-primary transition-transform group-hover:scale-110">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="mb-2 text-xl font-semibold text-foreground">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Commands Section */}
      <section className="bg-muted/30 py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
              Simple Commands
            </h2>
            <p className="text-lg text-muted-foreground">
              Just mention @intern or use these quick commands
            </p>
          </div>
          <div className="mx-auto max-w-2xl space-y-4">
            {commands.map((command, idx) => (
              <Card 
                key={idx} 
                className="border-border/50 transition-all hover:border-primary/50 hover:shadow-[var(--shadow-soft)]"
              >
                <CardContent className="flex items-center gap-4 p-6">
                  <code className="rounded bg-primary/10 px-3 py-1.5 font-mono text-sm font-semibold text-primary">
                    {command.cmd}
                  </code>
                  <p className="text-muted-foreground">{command.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section className="py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
              See It In Action
            </h2>
            <p className="text-lg text-muted-foreground">
              Watch LINE Intern help your team stay on track
            </p>
          </div>
          <div className="mx-auto max-w-2xl">
            <Card className="overflow-hidden border-border/50 shadow-[var(--shadow-soft)]">
              <div className="bg-primary/5 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-destructive/60" />
                    <div className="h-3 w-3 rounded-full bg-accent/60" />
                    <div className="h-3 w-3 rounded-full bg-primary/60" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    Project Team Chat
                  </span>
                </div>
              </div>
              <CardContent className="space-y-4 p-6">
                {mockMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col gap-1 ${
                      msg.isBot ? "items-start" : "items-start"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${msg.isBot ? "text-primary" : "text-foreground"}`}>
                        {msg.user}
                      </span>
                      <span className="text-xs text-muted-foreground">{msg.time}</span>
                    </div>
                    <div
                      className={`rounded-lg px-4 py-2 ${
                        msg.isBot
                          ? "bg-primary/10 text-foreground border border-primary/20"
                          : msg.user === "You"
                          ? "bg-muted text-foreground"
                          : "bg-card text-foreground border border-border"
                      }`}
                    >
                      <p className="text-sm">{msg.text}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="bg-gradient-to-br from-primary/5 via-background to-accent/5 py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
              Why Teams Love LINE Intern
            </h2>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            <Card className="border-border/50">
              <CardContent className="p-6 text-center">
                <div className="mb-4 inline-flex rounded-full bg-primary/10 p-4">
                  <Clock className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-foreground">Save Time</h3>
                <p className="text-muted-foreground">
                  Automate routine tasks and get instant answers without searching through message history
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="p-6 text-center">
                <div className="mb-4 inline-flex rounded-full bg-primary/10 p-4">
                  <Users className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-foreground">Stay Organized</h3>
                <p className="text-muted-foreground">
                  Keep everyone aligned with summaries, reminders, and structured information
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="p-6 text-center">
                <div className="mb-4 inline-flex rounded-full bg-primary/10 p-4">
                  <Shield className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-foreground">Safe & Private</h3>
                <p className="text-muted-foreground">
                  Your data stays in your LINE group with enterprise-grade security
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-32">
        <div className="container mx-auto px-4">
          <Card className="overflow-hidden border-border/50 bg-gradient-to-br from-primary/10 via-background to-accent/10 shadow-[var(--shadow-soft)]">
            <CardContent className="p-12 text-center">
              <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
                Ready to Boost Your Team's Productivity?
              </h2>
              <p className="mb-8 text-lg text-muted-foreground">
                Add LINE Intern to your group chat in seconds and start working smarter
              </p>
              <Button size="lg" className="gap-2 shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-hover)] transition-shadow">
                <MessageSquare className="h-5 w-5" />
                Add to LINE Now
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-muted/30 py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">LINE Intern</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2025 LINE Intern. Your AI teammate for LINE groups.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
