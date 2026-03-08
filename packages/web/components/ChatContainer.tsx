'use client';

import React from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { useConnection } from 'wagmi';
import { WalletButton } from './WalletButton';
import { TxExecutor, type TxStep } from './TxExecutor';
import { Sidebar } from './Sidebar';
import { EntityChip } from './EntityChip';
import { t } from '@/lib/theme';

const markdownComponents: Components = {
  a({ href, children }) {
    const text = React.Children.toArray(children).map(c => (typeof c === 'string' ? c : '')).join('') || String(href);
    if (href && (href.startsWith('token:') || href.startsWith('chain:') || href.startsWith('market:'))) {
      return <EntityChip href={href}>{text}</EntityChip>;
    }
    return <a href={href} target="_blank" rel="noopener noreferrer" className="underline text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">{children}</a>;
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
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

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

  return (
    <div className={`flex flex-row h-screen ${t.pageBg}`}>
      <Sidebar chats={chats} activeChatId={activeChatId} onSelect={setActiveChatId} onNew={handleNewChat} />

      <div className="flex flex-col flex-1 min-w-0">
        <div className={`${t.panelBg} border-b ${t.border} px-6 py-4 shadow-sm flex items-center justify-between`}>
          <div>
            <h1 className={`text-2xl font-bold ${t.textPrimary}`}>Lending Agent</h1>
            <p className={`text-sm ${t.textSecondary} mt-1`}>AI-powered lending platform assistant</p>
            <p className={`text-xs ${t.textMuted} mt-0.5`}>by 1delta</p>
          </div>
          <div className="flex items-center gap-2">
            <WalletButton />
            <div className={`w-px h-5 ${t.mutedBg} opacity-40`} />
            <button onClick={() => setDarkMode(d => !d)} className={`p-1.5 rounded-full ${t.textSecondary} ${t.hover} transition`} aria-label="Toggle dark mode">
              {darkMode
                ? <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m8.66-9h-1M4.34 12h-1m15.07-6.07-.71.71M6.34 17.66l-.71.71m12.73 0-.71-.71M6.34 6.34l-.71-.71M12 5a7 7 0 100 14A7 7 0 0012 5z" /></svg>
                : <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" /></svg>
              }
            </button>
          </div>
        </div>

        <div className={`flex-1 overflow-y-auto themed-scrollbar ${t.pageBg} ${messages.length === 0 ? 'flex items-center justify-center' : 'p-6 space-y-4'}`}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-6 px-4 max-w-lg w-full">
              <div className="text-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-4 mx-auto shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <h2 className={`text-xl font-semibold ${t.textPrimary}`}>How can I help you today?</h2>
                <p className={`text-sm mt-1.5 ${t.textSecondary}`}>Ask me about lending markets, rates, positions, or execute DeFi actions.</p>
                {!address && <p className="text-xs mt-2 text-blue-600 dark:text-blue-400">Connect your wallet to query your positions automatically.</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                {[
                  { icon: '📈', text: 'Show me the market with the best yield on Arbitrum' },
                  { icon: '💼', text: 'Show me my positions' },
                  { icon: '💰', text: 'What are the best USDC lending rates right now?' },
                  { icon: '🔍', text: 'Compare borrowing rates across all chains' },
                  { icon: '⚡', text: 'What is the highest APY for ETH collateral?' },
                  { icon: '📊', text: 'Show me the top 5 markets by total supply' },
                ].map(({ icon, text }) => (
                  <button key={text} onClick={() => setInput(text)} className={`flex items-start gap-2.5 text-left px-3.5 py-2.5 rounded-xl border ${t.borderSm} ${t.cardBg} ${t.textSecondary} ${t.hoverCard} transition text-sm`}>
                    <span className="text-base leading-snug flex-shrink-0">{icon}</span>
                    <span className="leading-snug">{text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map(message => (
              <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`px-4 py-3 rounded-lg ${message.type === 'user' ? 'max-w-xs lg:max-w-md bg-blue-600 text-white rounded-br-none' : `max-w-xl lg:max-w-2xl ${t.cardBg} ${t.textPrimary} rounded-bl-none`}`}>
                  {message.type === 'user' ? (
                    <p className="text-sm">{message.content}</p>
                  ) : (
                    <div className="text-sm prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 [overflow-wrap:anywhere]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}
                        urlTransform={url => url.startsWith('token:') || url.startsWith('chain:') || url.startsWith('market:') ? url : defaultUrlTransform(url)}>
                        {message.content}
                      </ReactMarkdown>
                      {message.transactions && message.transactions.length > 0 && <TxExecutor steps={message.transactions} quote={message.quote} />}
                    </div>
                  )}
                  <span className={`text-xs mt-2 block ${message.type === 'user' ? 'text-blue-100' : t.textMuted}`}>{message.timestamp.toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className={`${t.cardBg} ${t.textPrimary} px-4 py-3 rounded-lg rounded-bl-none`}>
                <div className="flex space-x-2">
                  {[0, 0.1, 0.2].map(d => <div key={d} className={`w-2 h-2 ${t.mutedBg} rounded-full animate-bounce`} style={{ animationDelay: `${d}s` }} />)}
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className={`${t.panelBg} border-t ${t.border} px-6 py-4`}>
          <form onSubmit={handleSendMessage} className="flex gap-3">
            <input type="text" value={input} onChange={e => setInput(e.target.value)}
              placeholder="Ask about lending markets, positions, or actions..."
              disabled={isLoading}
              className={`flex-1 px-4 py-2 border ${t.borderSm} rounded-lg ${t.cardBg} ${t.textPrimary} placeholder-stone-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60`} />
            <button type="submit" disabled={isLoading || !input.trim()} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition">Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}
