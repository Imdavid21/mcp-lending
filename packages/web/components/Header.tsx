'use client';

import { Zap, Moon, Sun, MessageSquare, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { WalletButton } from './WalletButton';

interface HeaderProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  activeView: 'chat' | 'dashboard';
  onViewChange: (view: 'chat' | 'dashboard') => void;
}

export function Header({ darkMode, onToggleDarkMode, activeView, onViewChange }: HeaderProps) {
  return (
    <header className="h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-none">Lending Agent</span>
            <span className="text-[10px] text-muted-foreground leading-none mt-0.5">by 1delta</span>
          </div>
        </div>
        
        <Separator orientation="vertical" className="h-6" />
        
        <nav className="flex items-center gap-1">
          <Button 
            variant={activeView === 'chat' ? 'secondary' : 'ghost'} 
            size="sm"
            onClick={() => onViewChange('chat')}
            className="gap-2"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Chat</span>
          </Button>
          <Button 
            variant={activeView === 'dashboard' ? 'secondary' : 'ghost'} 
            size="sm"
            onClick={() => onViewChange('dashboard')}
            className="gap-2"
          >
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>
        </nav>
      </div>
      
      <div className="flex items-center gap-2">
        <WalletButton />
        <Separator orientation="vertical" className="h-6" />
        <Button variant="ghost" size="icon" onClick={onToggleDarkMode} className="h-8 w-8">
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span className="sr-only">Toggle dark mode</span>
        </Button>
      </div>
    </header>
  );
}
