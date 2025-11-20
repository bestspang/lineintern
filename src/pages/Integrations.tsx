import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Webhook, CheckCircle } from 'lucide-react';

export default function Integrations() {
  return (
    <div className="space-y-6">

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            LINE Messaging API
          </CardTitle>
          <CardDescription>Connection to LINE platform</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm font-medium">Status</span>
            <Badge variant="default" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              Connected
            </Badge>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm font-medium">Webhook URL</span>
            <code className="text-xs bg-muted px-2 py-1 rounded">
              https://api.example.com/webhook/line
            </code>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm font-medium">Last Ping</span>
            <span className="text-sm text-muted-foreground">2 minutes ago</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium">Last Error</span>
            <span className="text-sm text-muted-foreground">None</span>
          </div>
          <Button variant="outline" className="w-full">
            Test Webhook Connection
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>OpenAI Integration</CardTitle>
          <CardDescription>AI model configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm font-medium">Model</span>
            <code className="text-xs">gpt-4</code>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm font-medium">Status</span>
            <Badge variant="default">Active</Badge>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium">Last Request</span>
            <span className="text-sm text-muted-foreground">5 minutes ago</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Database Connection</CardTitle>
          <CardDescription>Backend database status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm font-medium">Status</span>
            <Badge variant="default" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              Connected
            </Badge>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm font-medium">Type</span>
            <span className="text-sm">PostgreSQL</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium">Tables</span>
            <span className="text-sm">10 active</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
