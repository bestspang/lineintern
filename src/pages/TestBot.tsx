import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Send, Bot, User, Loader2 } from "lucide-react";

interface Message {
  id: string;
  text: string;
  direction: "human" | "bot";
  timestamp: Date;
}

export default function TestBot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("test-group");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      text: inputText,
      direction: "human",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("test-bot", {
        body: {
          message: inputText,
          groupId: selectedGroup,
          userId: "test-user-" + Date.now(),
        },
      });

      if (error) throw error;

      const botMessage: Message = {
        id: crypto.randomUUID(),
        text: data.reply || "No response received",
        direction: "bot",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error("Error testing bot:", error);
      toast({
        title: "Error",
        description: "Failed to get bot response. Check console for details.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Bot Testing Interface</h1>
        <p className="text-muted-foreground">
          Test LINE Intern bot responses without using the actual LINE app
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Panel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Test Settings</CardTitle>
            <CardDescription>Configure test parameters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="group-select">Test Group</Label>
              <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                <SelectTrigger id="group-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test-group">Test Group</SelectItem>
                  <SelectItem value="dev-group">Dev Group</SelectItem>
                  <SelectItem value="demo-group">Demo Group</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Quick Commands</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInputText("@intern hello")}
                >
                  @intern
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInputText("/summary")}
                >
                  /summary
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInputText("/faq")}
                >
                  /faq
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInputText("/report")}
                >
                  /report
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInputText("/help")}
                >
                  /help
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInputText("/todo remind me tomorrow")}
                >
                  /todo
                </Button>
              </div>
            </div>

            <Separator />

            <Button variant="outline" className="w-full" onClick={clearChat}>
              Clear Chat
            </Button>
          </CardContent>
        </Card>

        {/* Chat Panel */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Conversation
            </CardTitle>
            <CardDescription>
              Messages: {messages.length} | Bot responses: {messages.filter((m) => m.direction === "bot").length}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Messages */}
            <ScrollArea className="h-[400px] w-full rounded-md border p-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Bot className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-center">No messages yet. Start testing!</p>
                  <p className="text-sm text-center mt-2">
                    Try commands like @intern, /summary, /faq, /report, /help
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.direction === "bot" ? "flex-row" : "flex-row-reverse"
                      }`}
                    >
                      <div
                        className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                          message.direction === "bot"
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {message.direction === "bot" ? (
                          <Bot className="h-4 w-4" />
                        ) : (
                          <User className="h-4 w-4" />
                        )}
                      </div>
                      <div
                        className={`flex flex-col gap-1 max-w-[80%] ${
                          message.direction === "human" ? "items-end" : "items-start"
                        }`}
                      >
                        <div
                          className={`rounded-lg px-4 py-2 ${
                            message.direction === "bot"
                              ? "bg-muted text-foreground"
                              : "bg-primary text-primary-foreground"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {message.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Input */}
            <div className="flex gap-2">
              <Input
                placeholder="Type a message to test the bot..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading}
              />
              <Button onClick={handleSendMessage} disabled={isLoading || !inputText.trim()}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
