'use client';

import React from 'react';
import { useConnection } from 'wagmi';
import { TrendingUp, TrendingDown, Wallet, Shield, ArrowUpRight, ArrowDownRight, Coins, Percent, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface MarketData {
  id: string;
  protocol: string;
  chain: string;
  asset: string;
  supplyApy: number;
  borrowApy: number;
  totalSupply: string;
  totalBorrow: string;
  utilization: number;
}

interface PositionData {
  id: string;
  protocol: string;
  chain: string;
  asset: string;
  type: 'supply' | 'borrow';
  amount: string;
  value: string;
  apy: number;
}

const MOCK_MARKETS: MarketData[] = [
  { id: '1', protocol: 'Aave V3', chain: 'Arbitrum', asset: 'USDC', supplyApy: 4.32, borrowApy: 5.67, totalSupply: '$1.2B', totalBorrow: '$890M', utilization: 74 },
  { id: '2', protocol: 'Aave V3', chain: 'Arbitrum', asset: 'ETH', supplyApy: 2.15, borrowApy: 3.42, totalSupply: '$2.4B', totalBorrow: '$1.1B', utilization: 46 },
  { id: '3', protocol: 'Compound V3', chain: 'Base', asset: 'USDC', supplyApy: 3.89, borrowApy: 5.12, totalSupply: '$680M', totalBorrow: '$420M', utilization: 62 },
  { id: '4', protocol: 'Aave V3', chain: 'Optimism', asset: 'WBTC', supplyApy: 0.45, borrowApy: 2.89, totalSupply: '$890M', totalBorrow: '$156M', utilization: 18 },
  { id: '5', protocol: 'Silo', chain: 'Arbitrum', asset: 'ARB', supplyApy: 8.92, borrowApy: 12.45, totalSupply: '$45M', totalBorrow: '$28M', utilization: 62 },
  { id: '6', protocol: 'Moonwell', chain: 'Base', asset: 'cbETH', supplyApy: 3.21, borrowApy: 4.56, totalSupply: '$120M', totalBorrow: '$67M', utilization: 56 },
];

const MOCK_POSITIONS: PositionData[] = [
  { id: '1', protocol: 'Aave V3', chain: 'Arbitrum', asset: 'USDC', type: 'supply', amount: '10,000', value: '$10,000', apy: 4.32 },
  { id: '2', protocol: 'Aave V3', chain: 'Arbitrum', asset: 'ETH', type: 'supply', amount: '2.5', value: '$6,250', apy: 2.15 },
  { id: '3', protocol: 'Aave V3', chain: 'Arbitrum', asset: 'USDC', type: 'borrow', amount: '5,000', value: '$5,000', apy: 5.67 },
];

function StatCard({ title, value, change, trend, icon: Icon }: { 
  title: string; 
  value: string; 
  change?: string; 
  trend?: 'up' | 'down';
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change && (
          <p className={cn(
            "text-xs mt-1 flex items-center gap-1",
            trend === 'up' ? 'text-emerald-500' : 'text-red-500'
          )}>
            {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {change}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MarketRow({ market, onSupply, onBorrow }: { market: MarketData; onSupply: () => void; onBorrow: () => void }) {
  return (
    <div className="flex items-center justify-between py-3 px-4 hover:bg-muted/50 transition-colors rounded-lg">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold">
          {market.asset.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{market.asset}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{market.chain}</Badge>
          </div>
          <span className="text-xs text-muted-foreground">{market.protocol}</span>
        </div>
      </div>
      
      <div className="hidden md:flex items-center gap-8">
        <div className="text-right w-20">
          <div className="text-sm font-medium text-emerald-500">{market.supplyApy.toFixed(2)}%</div>
          <div className="text-xs text-muted-foreground">Supply APY</div>
        </div>
        <div className="text-right w-20">
          <div className="text-sm font-medium text-amber-500">{market.borrowApy.toFixed(2)}%</div>
          <div className="text-xs text-muted-foreground">Borrow APY</div>
        </div>
        <div className="text-right w-24">
          <div className="text-sm font-medium">{market.totalSupply}</div>
          <div className="text-xs text-muted-foreground">Total Supply</div>
        </div>
        <div className="w-16">
          <div className="flex items-center gap-1">
            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full",
                  market.utilization > 80 ? 'bg-red-500' : market.utilization > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                )}
                style={{ width: `${market.utilization}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-8">{market.utilization}%</span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onSupply} className="gap-1">
          <ArrowUpRight className="h-3 w-3" />
          <span className="hidden sm:inline">Supply</span>
        </Button>
        <Button size="sm" variant="outline" onClick={onBorrow} className="gap-1">
          <ArrowDownRight className="h-3 w-3" />
          <span className="hidden sm:inline">Borrow</span>
        </Button>
      </div>
    </div>
  );
}

function PositionRow({ position }: { position: PositionData }) {
  const isSupply = position.type === 'supply';
  return (
    <div className="flex items-center justify-between py-3 px-4 hover:bg-muted/50 transition-colors rounded-lg">
      <div className="flex items-center gap-4">
        <div className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold",
          isSupply ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
        )}>
          {isSupply ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{position.asset}</span>
            <Badge variant={isSupply ? 'success' : 'warning'} className="text-[10px] px-1.5 py-0">
              {isSupply ? 'Supplied' : 'Borrowed'}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">{position.protocol} on {position.chain}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-8">
        <div className="text-right">
          <div className="text-sm font-medium">{position.amount} {position.asset}</div>
          <div className="text-xs text-muted-foreground">{position.value}</div>
        </div>
        <div className="text-right w-16">
          <div className={cn(
            "text-sm font-medium",
            isSupply ? 'text-emerald-500' : 'text-amber-500'
          )}>
            {isSupply ? '+' : '-'}{position.apy.toFixed(2)}%
          </div>
          <div className="text-xs text-muted-foreground">APY</div>
        </div>
      </div>
    </div>
  );
}

interface DashboardProps {
  onOpenSupplyForm: (asset?: string) => void;
  onOpenBorrowForm: (asset?: string) => void;
}

export function Dashboard({ onOpenSupplyForm, onOpenBorrowForm }: DashboardProps) {
  const { address } = useConnection();
  
  const totalSupplied = '$16,250';
  const totalBorrowed = '$5,000';
  const netApy = '+2.84%';
  const healthFactor = '2.45';
  
  return (
    <div className="flex-1 overflow-hidden">
      <ScrollArea className="h-full">
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
          {/* Stats Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard 
              title="Total Supplied" 
              value={address ? totalSupplied : '--'} 
              change={address ? '+$420 (24h)' : undefined}
              trend="up"
              icon={Wallet}
            />
            <StatCard 
              title="Total Borrowed" 
              value={address ? totalBorrowed : '--'}
              change={address ? '-$12 (24h)' : undefined}
              trend="down"
              icon={Coins}
            />
            <StatCard 
              title="Net APY" 
              value={address ? netApy : '--'}
              icon={Percent}
            />
            <StatCard 
              title="Health Factor" 
              value={address ? healthFactor : '--'}
              icon={Shield}
            />
          </div>
          
          {/* Main Content */}
          <Tabs defaultValue="markets" className="space-y-4">
            <TabsList>
              <TabsTrigger value="markets" className="gap-2">
                <Activity className="h-4 w-4" />
                Markets
              </TabsTrigger>
              <TabsTrigger value="positions" className="gap-2">
                <Wallet className="h-4 w-4" />
                My Positions
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="markets" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Lending Markets</CardTitle>
                  <CardDescription>
                    Supply assets to earn interest or borrow against your collateral
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {MOCK_MARKETS.map((market) => (
                      <MarketRow 
                        key={market.id} 
                        market={market} 
                        onSupply={() => onOpenSupplyForm(market.asset)}
                        onBorrow={() => onOpenBorrowForm(market.asset)}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="positions" className="space-y-4">
              {!address ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Connect Your Wallet</h3>
                    <p className="text-sm text-muted-foreground text-center max-w-sm">
                      Connect your wallet to view your lending positions and manage your portfolio
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <ArrowUpRight className="h-5 w-5 text-emerald-500" />
                          Supplied
                        </CardTitle>
                        <span className="text-lg font-bold text-emerald-500">{totalSupplied}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {MOCK_POSITIONS.filter(p => p.type === 'supply').map((position) => (
                          <PositionRow key={position.id} position={position} />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <ArrowDownRight className="h-5 w-5 text-amber-500" />
                          Borrowed
                        </CardTitle>
                        <span className="text-lg font-bold text-amber-500">{totalBorrowed}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {MOCK_POSITIONS.filter(p => p.type === 'borrow').map((position) => (
                          <PositionRow key={position.id} position={position} />
                        ))}
                      </div>
                      {MOCK_POSITIONS.filter(p => p.type === 'borrow').length === 0 && (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                          No active borrows
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
