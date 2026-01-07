import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertCircle, Settings, ExternalLink } from "lucide-react";
import { setMapboxToken } from "@/lib/api-config";
import { Link } from 'react-router-dom';

interface MapboxTokenDialogProps {
  open: boolean;
  onTokenSet: (token: string) => void;
}

export function MapboxTokenDialog({ open, onTokenSet }: MapboxTokenDialogProps) {
  const [tokenInput, setTokenInput] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (tokenInput.trim()) {
      setSaving(true);
      await setMapboxToken(tokenInput.trim());
      setSaving(false);
      onTokenSet(tokenInput.trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mapbox Access Token Required</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-primary/10 p-3 rounded-lg flex gap-2">
            <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium mb-1">Mapbox Public Token</p>
              <p className="text-muted-foreground">
                กรุณากรอก Mapbox Public Token เพื่อใช้งานแผนที่
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mapbox-token">Mapbox Public Token</Label>
            <Input
              id="mapbox-token"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="pk.eyJ1..."
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              ดูได้ที่:{" "}
              <a
                href="https://account.mapbox.com/access-tokens/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                account.mapbox.com/access-tokens
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>

          <Button onClick={handleSubmit} disabled={!tokenInput.trim() || saving} className="w-full">
            {saving ? 'Saving...' : 'Save Token'}
          </Button>

          <div className="text-center">
            <Link 
              to="/settings/api-keys" 
              className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
            >
              <Settings className="h-3 w-3" />
              หรือจัดการ API Keys ทั้งหมดที่ Settings
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
