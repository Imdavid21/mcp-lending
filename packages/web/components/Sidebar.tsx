'use client';

import { Plus, MessageSquare, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Chat } from './ChatContainer';

interface SidebarProps {
  chats: Chat[];
  activeChatId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

function relativeDate(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function Sidebar({ chats, activeChatId, onSelect, onNew, isOpen, onToggle }: SidebarProps) {
  const sortedChats = chats.slice().sort((a, b) => b.createdAt - a.createdAt);
  
  return (
    <>
      <aside className={cn(
        "flex flex-col border-r bg-muted/30 transition-all duration-300",
        isOpen ? "w-64" : "w-0 overflow-hidden"
      )}>
        <div className="p-3">
          <Button onClick={onNew} variant="outline" className="w-full justify-start gap-2">
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>
        
        <Separator />
        
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {sortedChats.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-4 text-center">No chats yet</p>
            ) : (
              sortedChats.map(chat => (
                <button 
                  key={chat.id} 
                  onClick={() => onSelect(chat.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg transition-colors group flex items-start gap-3",
                    chat.id === activeChatId 
                      ? 'bg-background border shadow-sm' 
                      : 'hover:bg-muted'
                  )}
                >
                  <MessageSquare className={cn(
                    "h-4 w-4 mt-0.5 flex-shrink-0",
                    chat.id === activeChatId ? 'text-primary' : 'text-muted-foreground'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm truncate font-medium",
                      chat.id === activeChatId ? 'text-foreground' : 'text-muted-foreground'
                    )}>
                      {chat.title || 'New chat'}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {relativeDate(chat.createdAt)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </aside>
      
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={onToggle}
            className={cn(
              "absolute left-0 top-1/2 -translate-y-1/2 z-10 h-6 w-6 rounded-l-none rounded-r-lg border border-l-0 bg-background shadow-sm hover:bg-muted transition-all",
              isOpen ? "translate-x-64" : "translate-x-0"
            )}
          >
            {isOpen ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        </TooltipContent>
      </Tooltip>
    </>
  );
}
