import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Settings, HelpCircle, BookOpen, BarChart3, Sparkles, Shield } from 'lucide-react';

interface ModeSelectorProps {
  currentMode: string;
  onModeChange: (mode: string) => void;
  disabled?: boolean;
}

const modes = [
  {
    value: 'helper',
    label: 'Helper',
    icon: HelpCircle,
    description: 'Versatile assistant for general questions',
    color: 'bg-blue-500',
  },
  {
    value: 'faq',
    label: 'FAQ',
    icon: BookOpen,
    description: 'Knowledge expert using documentation',
    color: 'bg-purple-500',
  },
  {
    value: 'report',
    label: 'Report',
    icon: BarChart3,
    description: 'Data analyst providing insights',
    color: 'bg-green-500',
  },
  {
    value: 'fun',
    label: 'Fun',
    icon: Sparkles,
    description: 'Entertaining and creative responses',
    color: 'bg-pink-500',
  },
  {
    value: 'safety',
    label: 'Safety',
    icon: Shield,
    description: 'Vigilant protector for security',
    color: 'bg-orange-500',
  },
];

export function ModeSelector({ currentMode, onModeChange, disabled }: ModeSelectorProps) {
  const currentModeData = modes.find((m) => m.value === currentMode) || modes[0];
  const Icon = currentModeData.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled} className="gap-2">
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">Mode:</span>
          <Badge variant="secondary" className="gap-1">
            <Icon className="h-3 w-3" />
            {currentModeData.label}
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Select Bot Mode</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {modes.map((mode) => {
          const ModeIcon = mode.icon;
          const isActive = mode.value === currentMode;
          
          return (
            <DropdownMenuItem
              key={mode.value}
              onClick={() => onModeChange(mode.value)}
              className={isActive ? 'bg-accent' : ''}
            >
              <div className="flex items-start gap-3 w-full">
                <div className={`p-2 rounded-md ${mode.color} bg-opacity-10`}>
                  <ModeIcon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="font-medium flex items-center gap-2">
                    {mode.label}
                    {isActive && (
                      <Badge variant="default" className="text-xs">
                        Active
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {mode.description}
                  </div>
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
