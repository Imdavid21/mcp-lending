'use client';

import { useConnect, useDisconnect, useConnection } from 'wagmi';
import { Wallet, LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function WalletButton() {
  const { address, status } = useConnection();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting' || status === 'reconnecting';
  const injectedConnector = connectors[0];

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="gap-2 px-3 py-1.5 font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          {address.slice(0, 6)}...{address.slice(-4)}
        </Badge>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => disconnect()}
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          <span className="sr-only">Disconnect wallet</span>
        </Button>
      </div>
    );
  }

  return (
    <Button 
      size="sm"
      onClick={() => injectedConnector && connect({ connector: injectedConnector })} 
      disabled={isConnecting || !injectedConnector}
      className="gap-2"
    >
      {isConnecting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting...
        </>
      ) : (
        <>
          <Wallet className="h-4 w-4" />
          Connect Wallet
        </>
      )}
    </Button>
  );
}
