import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Webhook, CheckCircle } from 'lucide-react';

export default function Integrations() {
  return (
    <div className="space-y-4 sm:space-y-6">

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Webhook className="h-4 h-4 sm:h-5 sm:w-5" />
            LINE Messaging API
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Connection to LINE platform</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 border-b gap-2">
            <span className="text-xs sm:text-sm font-medium">Status</span>
            <Badge variant="default" className="gap-1 text-xs">
              <CheckCircle className="h-3 w-3" />
              Connected
            </Badge>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 border-b gap-2">
            <span className="text-xs sm:text-sm font-medium">Webhook URL</span>
            <code className="text-[10px] sm:text-xs bg-muted px-2 py-1 rounded break-all">
              https://api.example.com/webhook/line
            </code>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 border-b gap-2">
            <span className="text-xs sm:text-sm font-medium">Last Ping</span>
            <span className="text-xs sm:text-sm text-muted-foreground">2 minutes ago</span>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 gap-2">
            <span className="text-xs sm:text-sm font-medium">Last Error</span>
            <span className="text-xs sm:text-sm text-muted-foreground">None</span>
          </div>
          <Button variant="outline" className="w-full text-sm">
            Test Webhook Connection
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">OpenAI Integration</CardTitle>
          <CardDescription className="text-xs sm:text-sm">AI model configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 border-b gap-2">
            <span className="text-xs sm:text-sm font-medium">Model</span>
            <code className="text-xs">gpt-4</code>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 border-b gap-2">
            <span className="text-xs sm:text-sm font-medium">Status</span>
            <Badge variant="default" className="text-xs">Active</Badge>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 gap-2">
            <span className="text-xs sm:text-sm font-medium">Last Request</span>
            <span className="text-xs sm:text-sm text-muted-foreground">5 minutes ago</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Database Connection</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Backend database status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 border-b gap-2">
            <span className="text-xs sm:text-sm font-medium">Status</span>
            <Badge variant="default" className="gap-1 text-xs">
              <CheckCircle className="h-3 w-3" />
              Connected
            </Badge>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 border-b gap-2">
            <span className="text-xs sm:text-sm font-medium">Type</span>
            <span className="text-xs sm:text-sm">PostgreSQL</span>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 gap-2">
            <span className="text-xs sm:text-sm font-medium">Tables</span>
            <span className="text-xs sm:text-sm">10 active</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
