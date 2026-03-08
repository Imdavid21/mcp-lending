'use client';

import React from 'react';
import { ArrowUpRight, ArrowDownRight, Wallet, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { useConnection } from 'wagmi';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface LendingFormProps {
  type: 'supply' | 'borrow';
  isOpen: boolean;
  onClose: () => void;
  initialAsset?: string;
}

const ASSETS = [
  { symbol: 'USDC', name: 'USD Coin', balance: '12,450.00', price: 1.0, supplyApy: 4.32, borrowApy: 5.67 },
  { symbol: 'ETH', name: 'Ethereum', balance: '3.245', price: 2500, supplyApy: 2.15, borrowApy: 3.42 },
  { symbol: 'WBTC', name: 'Wrapped Bitcoin', balance: '0.125', price: 65000, supplyApy: 0.45, borrowApy: 2.89 },
  { symbol: 'ARB', name: 'Arbitrum', balance: '5,200.00', price: 1.20, supplyApy: 8.92, borrowApy: 12.45 },
  { symbol: 'cbETH', name: 'Coinbase ETH', balance: '1.85', price: 2600, supplyApy: 3.21, borrowApy: 4.56 },
];

const PROTOCOLS = [
  { id: 'aave-v3-arb', name: 'Aave V3', chain: 'Arbitrum' },
  { id: 'aave-v3-opt', name: 'Aave V3', chain: 'Optimism' },
  { id: 'compound-v3-base', name: 'Compound V3', chain: 'Base' },
  { id: 'silo-arb', name: 'Silo Finance', chain: 'Arbitrum' },
  { id: 'moonwell-base', name: 'Moonwell', chain: 'Base' },
];

export function LendingForm({ type, isOpen, onClose, initialAsset }: LendingFormProps) {
  const { address } = useConnection();
  const [selectedAsset, setSelectedAsset] = React.useState(initialAsset || 'USDC');
  const [selectedProtocol, setSelectedProtocol] = React.useState('aave-v3-arb');
  const [amount, setAmount] = React.useState('');
  const [percentage, setPercentage] = React.useState([0]);
  const [isLoading, setIsLoading] = React.useState(false);
  
  const asset = ASSETS.find(a => a.symbol === selectedAsset) || ASSETS[0];
  const protocol = PROTOCOLS.find(p => p.id === selectedProtocol) || PROTOCOLS[0];
  const isSupply = type === 'supply';
  
  const maxAmount = parseFloat(asset.balance.replace(/,/g, ''));
  const currentAmount = parseFloat(amount) || 0;
  const usdValue = currentAmount * asset.price;
  const apy = isSupply ? asset.supplyApy : asset.borrowApy;
  
  // Mock health factor calculation
  const currentHealthFactor = 2.45;
  const newHealthFactor = isSupply 
    ? currentHealthFactor + (currentAmount * 0.1) 
    : Math.max(1.0, currentHealthFactor - (currentAmount * 0.15));
  const healthFactorChange = newHealthFactor - currentHealthFactor;
  const isHealthy = newHealthFactor >= 1.5;
  
  const handlePercentageChange = (value: number[]) => {
    setPercentage(value);
    const newAmount = (maxAmount * value[0] / 100).toFixed(asset.symbol === 'USDC' || asset.symbol === 'ARB' ? 2 : 6);
    setAmount(newAmount);
  };
  
  const handleAmountChange = (value: string) => {
    setAmount(value);
    const numValue = parseFloat(value) || 0;
    const pct = Math.min(100, (numValue / maxAmount) * 100);
    setPercentage([pct]);
  };
  
  const handleSubmit = async () => {
    setIsLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsLoading(false);
    onClose();
  };
  
  React.useEffect(() => {
    if (initialAsset) {
      setSelectedAsset(initialAsset);
    }
  }, [initialAsset]);
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isSupply ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
                <ArrowUpRight className="h-4 w-4 text-emerald-500" />
              </div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10">
                <ArrowDownRight className="h-4 w-4 text-amber-500" />
              </div>
            )}
            {isSupply ? 'Supply Asset' : 'Borrow Asset'}
          </DialogTitle>
          <DialogDescription>
            {isSupply 
              ? 'Supply assets to earn interest on your deposits'
              : 'Borrow assets against your collateral'
            }
          </DialogDescription>
        </DialogHeader>
        
        {!address ? (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Wallet className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Connect your wallet to {isSupply ? 'supply' : 'borrow'} assets
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Protocol Selection */}
            <div className="space-y-2">
              <Label>Protocol</Label>
              <Select value={selectedProtocol} onValueChange={setSelectedProtocol}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROTOCOLS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        {p.name}
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{p.chain}</Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Asset Selection */}
            <div className="space-y-2">
              <Label>Asset</Label>
              <Select value={selectedAsset} onValueChange={setSelectedAsset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSETS.map((a) => (
                    <SelectItem key={a.symbol} value={a.symbol}>
                      <span className="flex items-center justify-between w-full gap-4">
                        <span className="font-medium">{a.symbol}</span>
                        <span className="text-muted-foreground text-xs">{a.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Amount Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Amount</Label>
                <span className="text-xs text-muted-foreground">
                  Balance: {asset.balance} {asset.symbol}
                </span>
              </div>
              <div className="relative">
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className="pr-20"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-xs"
                    onClick={() => handleAmountChange(maxAmount.toString())}
                  >
                    MAX
                  </Button>
                  <span className="text-sm font-medium text-muted-foreground">{asset.symbol}</span>
                </div>
              </div>
              {currentAmount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {'≈'} ${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </p>
              )}
            </div>
            
            {/* Percentage Slider */}
            <div className="space-y-3">
              <Slider
                value={percentage}
                onValueChange={handlePercentageChange}
                max={100}
                step={1}
              />
              <div className="flex justify-between">
                {[0, 25, 50, 75, 100].map((pct) => (
                  <Button
                    key={pct}
                    variant="outline"
                    size="sm"
                    className="h-7 px-3 text-xs"
                    onClick={() => handlePercentageChange([pct])}
                  >
                    {pct}%
                  </Button>
                ))}
              </div>
            </div>
            
            <Separator />
            
            {/* Transaction Summary */}
            <div className="space-y-2 rounded-lg bg-muted/50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{isSupply ? 'Supply' : 'Borrow'} APY</span>
                <span className={cn(
                  "font-medium",
                  isSupply ? 'text-emerald-500' : 'text-amber-500'
                )}>
                  {apy.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Health Factor</span>
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground">{currentHealthFactor.toFixed(2)}</span>
                  <span className="text-muted-foreground">{'→'}</span>
                  <span className={cn(
                    "font-medium",
                    isHealthy ? 'text-emerald-500' : 'text-red-500'
                  )}>
                    {newHealthFactor.toFixed(2)}
                  </span>
                  {!isHealthy && <AlertTriangle className="h-4 w-4 text-red-500" />}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Network Fee</span>
                <span className="font-medium">~$0.15</span>
              </div>
            </div>
            
            {!isHealthy && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>Health factor below safe threshold. Consider reducing the amount.</span>
              </div>
            )}
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={handleSubmit}
            disabled={!address || !currentAmount || currentAmount > maxAmount || isLoading}
            className={cn(
              isSupply ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                {isSupply ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                {isSupply ? 'Supply' : 'Borrow'} {asset.symbol}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
