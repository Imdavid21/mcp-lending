'use client';

import { useConnect, useDisconnect, useConnection } from 'wagmi';
import { t } from '@/lib/theme';

export function WalletButton() {
  const { address, status } = useConnection();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting' || status === 'reconnecting';
  const injectedConnector = connectors[0];

  if (isConnected && address) {
    return (
      <div className={`flex items-center rounded-full border ${t.borderSm} ${t.cardBg} overflow-hidden text-xs`}>
        <span className="flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 text-green-700 dark:text-green-400 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <div className={`w-px h-4 ${t.mutedBg} opacity-40`} />
        <button onClick={() => disconnect()} className={`px-2.5 py-1.5 ${t.textSecondary} hover:text-red-500 dark:hover:text-red-400 transition-colors`} aria-label="Disconnect wallet">✕</button>
      </div>
    );
  }

  return (
    <button onClick={() => injectedConnector && connect({ connector: injectedConnector })} disabled={isConnecting || !injectedConnector} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors">
      {isConnecting ? 'Connecting…' : 'Connect Wallet'}
    </button>
  );
}
