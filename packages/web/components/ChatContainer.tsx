'use client';

import React from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { useConnection } from 'wagmi';
import { Send, Zap, TrendingUp, Wallet, Search, BarChart3, Sparkles, Loader2 } from 'lucide-react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { Dashboard } from './Dashboard';
import { LendingForm } from './LendingForm';
import { TxExecutor, type TxStep } from './TxExecutor';
import { EntityChip } from './EntityChip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const markdownComponents: Components = {
  a({ href, children }) {
    const text = React.Children.toArray(children).map(c => (typeof c === 'string' ? c : '')).join('') || String(href);
    if (href && (href.startsWith('token:') || href.startsWith('chain:') || href.startsWith('market:'))) {
      return <EntityChip href={href}>{text}</EntityChip>;
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4 hover:text-primary/80">
        {children}
      </a>
    );
  },
};

interface Message {
  id: string;
  type: 'user' | 'agent';
  content: string;
  timestamp: Date;
  transactions?: TxStep[];
  quote?: Record<string, unknown>;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

const STORAGE_KEY = 'mcp-chats';

function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Chat[];
    return parsed.map(chat => ({ ...chat, messages: chat.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })) }));
  } catch { return []; }
}

function saveChats(chats: Chat[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

function newChatId(): string { return Date.now().toString(); }

const SUGGESTIONS = [
  { icon: TrendingUp, text: 'Show me the market with the best yield on Arbitrum' },
  { icon: Wallet, text: 'Show me my positions' },
  { icon: Search, text: 'What are the best USDC lending rates right now?' },
  { icon: BarChart3, text: 'Compare borrowing rates across all chains' },
  { icon: Sparkles, text: 'What is the highest APY for ETH collateral?' },
  { icon: TrendingUp, text: 'Show me the top 5 markets by total supply' },
];

export default function ChatContainer() {
  const [chats, setChats] = React.useState<Chat[]>(() => {
    if (typeof window === 'undefined') return [{ id: '0', title: '', messages: [], createdAt: Date.now() }];
    const stored = loadChats();
    if (stored.length > 0) return stored;
    const id = newChatId();
    return [{ id, title: '', messages: [], createdAt: Date.now() }];
  });
  const [activeChatId, setActiveChatId] = React.useState<string>(() => {
    if (typeof window === 'undefined') return '0';
    const stored = loadChats();
    return stored.length > 0 ? stored[stored.length - 1].id : chats[0]?.id ?? newChatId();
  });
  const [input, setInput] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [darkMode, setDarkMode] = React.useState(false);
  const [activeView, setActiveView] = React.useState<'chat' | 'dashboard'>('chat');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  
  // Form states
  const [supplyFormOpen, setSupplyFormOpen] = React.useState(false);
  const [borrowFormOpen, setBorrowFormOpen] = React.useState(false);
  const [formAsset, setFormAsset] = React.useState<string | undefined>();

  const { address } = useConnection();
  const activeChat = chats.find(c => c.id === activeChatId);
  const messages = activeChat?.messages ?? [];

  React.useEffect(() => {
    const stored = localStorage.getItem('darkMode');
    const dark = stored !== null ? stored === 'true' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(dark);
  }, []);

  React.useEffect(() => { saveChats(chats); }, [chats]);

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleNewChat = () => {
    const id = newChatId();
    setChats(prev => [...prev, { id, title: '', messages: [], createdAt: Date.now() }]);
    setActiveChatId(id);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { id: Date.now().toString(), type: 'user', content: input, timestamp: new Date() };

    setChats(prev => prev.map(chat => {
      if (chat.id !== activeChatId) return chat;
      return { ...chat, title: chat.messages.length === 0 ? input.slice(0, 40) : chat.title, messages: [...chat.messages, userMessage] };
    }));

    const sentInput = input;
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: sentInput,
          userAddress: address,
          history: messages.map(m => ({ role: m.type === 'user' ? 'user' : 'assistant', content: m.content })),
        }),
      });

      const data = await res.json() as { response: string; transactions?: TxStep[]; quote?: Record<string, unknown> };

      const agentMessage: Message = {
        id: (Date.now() + 1).toString(), type: 'agent', content: data.response,
        timestamp: new Date(), transactions: data.transactions, quote: data.quote,
      };

      setChats(prev => prev.map(chat => chat.id === activeChatId ? { ...chat, messages: [...chat.messages, agentMessage] } : chat));
    } catch {
      const errMessage: Message = { id: (Date.now() + 1).toString(), type: 'agent', content: 'Error: could not reach the agent.', timestamp: new Date() };
      setChats(prev => prev.map(chat => chat.id === activeChatId ? { ...chat, messages: [...chat.messages, errMessage] } : chat));
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleOpenSupplyForm = (asset?: string) => {
    setFormAsset(asset);
    setSupplyFormOpen(true);
  };
  
  const handleOpenBorrowForm = (asset?: string) => {
    setFormAsset(asset);
    setBorrowFormOpen(true);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header 
        darkMode={darkMode} 
        onToggleDarkMode={() => setDarkMode(d => !d)}
        activeView={activeView}
        onViewChange={setActiveView}
      />
      
      <div className="flex flex-1 overflow-hidden">
        {activeView === 'chat' && (
          <Sidebar 
            chats={chats} 
            activeChatId={activeChatId} 
            onSelect={setActiveChatId} 
            onNew={handleNewChat}
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen(!sidebarOpen)}
          />
        )}

        {activeView === 'dashboard' ? (
          <Dashboard 
            onOpenSupplyForm={handleOpenSupplyForm}
            onOpenBorrowForm={handleOpenBorrowForm}
          />
        ) : (
          <div className="flex flex-col flex-1 min-w-0">
            <ScrollArea className="flex-1">
              <div className={cn(
                "h-full",
                messages.length === 0 ? 'flex items-center justify-center' : 'p-4 md:p-6 space-y-4'
              )}>
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center gap-6 px-4 max-w-2xl w-full py-12">
                    <div className="text-center">
                      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4 mx-auto shadow-lg">
                        <Zap className="w-8 h-8 text-primary-foreground" />
                      </div>
                      <h2 className="text-2xl font-semibold text-balance">How can I help you today?</h2>
                      <p className="text-sm mt-2 text-muted-foreground text-pretty max-w-md mx-auto">
                        Ask me about lending markets, rates, positions, or execute DeFi actions across multiple protocols.
                      </p>
                      {!address && (
                        <p className="text-xs mt-3 text-primary font-medium">
                          Connect your wallet to query your positions automatically.
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                      {SUGGESTIONS.map(({ icon: Icon, text }) => (
                        <Card 
                          key={text} 
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => setInput(text)}
                        >
                          <CardContent className="flex items-start gap-3 p-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted flex-shrink-0">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <span className="text-sm text-muted-foreground leading-relaxed">{text}</span>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map(message => (
                      <div key={message.id} className={cn("flex gap-3", message.type === 'user' ? 'justify-end' : 'justify-start')}>
                        {message.type === 'agent' && (
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                              <Zap className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div className={cn(
                          "rounded-lg px-4 py-3 max-w-[85%] lg:max-w-2xl",
                          message.type === 'user' 
                            ? 'bg-primary text-primary-foreground rounded-br-none' 
                            : 'bg-muted rounded-bl-none'
                        )}>
                          {message.type === 'user' ? (
                            <p className="text-sm">{message.content}</p>
                          ) : (
                            <div className="text-sm prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 [overflow-wrap:anywhere]">
                              <ReactMarkdown 
                                remarkPlugins={[remarkGfm]} 
                                components={markdownComponents}
                                urlTransform={url => url.startsWith('token:') || url.startsWith('chain:') || url.startsWith('market:') ? url : defaultUrlTransform(url)}
                              >
                                {message.content}
                              </ReactMarkdown>
                              {message.transactions && message.transactions.length > 0 && (
                                <TxExecutor steps={message.transactions} quote={message.quote} />
                              )}
                            </div>
                          )}
                          <span className={cn(
                            "text-[10px] mt-2 block",
                            message.type === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                          )}>
                            {message.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        {message.type === 'user' && (
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                              {address ? address.slice(2, 4).toUpperCase() : 'U'}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex gap-3 justify-start">
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                            <Zap className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="bg-muted rounded-lg rounded-bl-none px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Thinking...</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="border-t bg-background p-4">
              <form onSubmit={handleSendMessage} className="flex gap-3 max-w-4xl mx-auto">
                <Input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask about lending markets, positions, or actions..."
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button type="submit" disabled={isLoading || !input.trim()}>
                  <Send className="h-4 w-4" />
                  <span className="sr-only">Send</span>
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>
      
      {/* Lending Forms */}
      <LendingForm 
        type="supply"
        isOpen={supplyFormOpen}
        onClose={() => setSupplyFormOpen(false)}
        initialAsset={formAsset}
      />
      <LendingForm 
        type="borrow"
        isOpen={borrowFormOpen}
        onClose={() => setBorrowFormOpen(false)}
        initialAsset={formAsset}
      />
    </div>
  );
}
