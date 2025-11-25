import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { setMapboxToken } from "@/lib/api-config";

interface MapboxTokenDialogProps {
  open: boolean;
  onTokenSet: (token: string) => void;
}

export function MapboxTokenDialog({ open, onTokenSet }: MapboxTokenDialogProps) {
  const [tokenInput, setTokenInput] = useState('');

  const handleSubmit = () => {
    if (tokenInput.trim()) {
      setMapboxToken(tokenInput.trim());
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
              <p className="text-xs text-muted-foreground mt-2">
                (กรอกครั้งเดียว ใช้ได้ทุก feature)
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
                className="text-primary hover:underline"
              >
                account.mapbox.com/access-tokens
              </a>
            </p>
          </div>

          <Button onClick={handleSubmit} disabled={!tokenInput.trim()} className="w-full">
            Save Token
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
