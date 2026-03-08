'use client';

import React from 'react';
import { useAccount, useSendTransaction, useSwitchChain } from 'wagmi';
import { Check, X, Loader2, ChevronDown, AlertTriangle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface TxStep {
  description: string;
  to: string;
  data: string;
  value: string;
  chainId?: number;
}

type StepStatus = 'idle' | 'pending' | 'success' | 'error';

function parseValue(v: string): bigint {
  try {
    if (!v || v === '0' || v === '0x0') return 0n;
    return BigInt(v);
  } catch { return 0n; }
}

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === 'pending') {
    return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  }
  if (status === 'success') {
    return (
      <div className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center">
        <Check className="h-3 w-3 text-white" />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="h-5 w-5 rounded-full bg-destructive flex items-center justify-center">
        <X className="h-3 w-3 text-white" />
      </div>
    );
  }
  return <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />;
}

interface SimPre { healthFactor?: number; borrowCapacity?: number; }
interface SimBalanceData { collateral?: number; debt?: number; nav?: number; }
interface SimAprData { borrowApr?: number; depositApr?: number; apr?: number; }
interface SimPost { healthFactor?: number; borrowCapacity?: number; balanceData?: SimBalanceData; aprData?: SimAprData; }
interface SimulationData { pre: SimPre; post: SimPost; }

const fHF = (v?: number) => v === undefined ? '—' : v > 100_000 ? '∞' : v < 1 ? v.toFixed(4) : v.toFixed(2);
const fUsd = (v?: number) => v !== undefined ? `$${v.toFixed(2)}` : '—';
const fPct = (v?: number) => v !== undefined ? `${v.toFixed(2)}%` : '—';

function SimulationPanel({ sim }: { sim: SimulationData }) {
  const { pre, post } = sim;
  const lowHF = post.healthFactor !== undefined && post.healthFactor < 1.5;
  const rows = [
    { label: 'Health factor', before: fHF(pre.healthFactor), after: fHF(post.healthFactor), danger: lowHF },
    { label: 'Borrow capacity', before: fUsd(pre.borrowCapacity), after: fUsd(post.borrowCapacity) },
    { label: 'Collateral', before: '—', after: fUsd(post.balanceData?.collateral) },
    { label: 'Total debt', before: '—', after: fUsd(post.balanceData?.debt) },
    { label: 'Borrow APR', before: '—', after: fPct(post.aprData?.borrowApr) },
    { label: 'Deposit APR', before: '—', after: fPct(post.aprData?.depositApr) },
  ];
  
  return (
    <div className="border-b">
      {lowHF && (
        <div className="px-3 py-2 bg-destructive/10 text-destructive text-xs font-medium flex items-center gap-2">
          <AlertTriangle className="h-3 w-3" />
          Warning: health factor below 1.5 after this action
        </div>
      )}
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50">
            <th className="px-3 py-2 text-left font-semibold">Simulation</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Before</th>
            <th className="px-3 py-2 text-right font-semibold">After</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(row => (
            <tr key={row.label}>
              <td className="px-3 py-1.5 text-muted-foreground">{row.label}</td>
              <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{row.before}</td>
              <td className={cn(
                "px-3 py-1.5 text-right font-mono font-medium",
                row.danger ? 'text-destructive' : ''
              )}>
                {row.after}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuotePanel({ quote }: { quote: Record<string, unknown> }) {
  const sim = quote.simulation as SimulationData | undefined;
  if (sim?.pre && sim?.post) return <SimulationPanel sim={sim} />;
  return null;
}

export function TxExecutor({ steps, quote }: { steps: TxStep[]; quote?: Record<string, unknown> }) {
  const [statuses, setStatuses] = React.useState<StepStatus[]>(steps.map(() => 'idle'));
  const [hashes, setHashes] = React.useState<(string | undefined)[]>(steps.map(() => undefined));
  const [errors, setErrors] = React.useState<(string | undefined)[]>(steps.map(() => undefined));
  const [expanded, setExpanded] = React.useState<boolean[]>(steps.map(() => false));
  const [running, setRunning] = React.useState(false);
  const { sendTransactionAsync } = useSendTransaction();
  const { chainId: currentChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const allDone = statuses.every(s => s === 'success');
  const hasFailed = statuses.some(s => s === 'error');

  async function executeAll() {
    setRunning(true);
    for (let i = 0; i < steps.length; i++) {
      if (statuses[i] === 'success') continue;
      setStatuses(prev => prev.map((s, idx) => idx === i ? 'pending' : s));
      try {
        const step = steps[i];
        if (step.chainId && step.chainId !== currentChainId) {
          await switchChainAsync({ chainId: step.chainId });
        }
        const hash = await sendTransactionAsync({ 
          to: step.to as `0x${string}`, 
          data: step.data as `0x${string}`, 
          value: parseValue(step.value) 
        });
        setStatuses(prev => prev.map((s, idx) => idx === i ? 'success' : s));
        setHashes(prev => prev.map((h, idx) => idx === i ? hash : h));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Transaction failed';
        setStatuses(prev => prev.map((s, idx) => idx === i ? 'error' : s));
        setErrors(prev => prev.map((e, idx) => idx === i ? msg : e));
        setRunning(false);
        return;
      }
    }
    setRunning(false);
  }

  return (
    <Card className="mt-3 overflow-hidden">
      <CardHeader className="py-3 px-4 bg-muted/50">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Badge variant="secondary">{steps.length}</Badge>
          transaction{steps.length !== 1 ? 's' : ''} to execute
        </CardTitle>
      </CardHeader>
      
      {quote && <QuotePanel quote={quote} />}
      
      <CardContent className="p-0 divide-y">
        {steps.map((step, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <StatusIcon status={statuses[i]} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium capitalize">{step.description}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setExpanded(prev => prev.map((v, idx) => idx === i ? !v : v))}
                  >
                    <ChevronDown className={cn(
                      "h-4 w-4 transition-transform",
                      expanded[i] && "rotate-180"
                    )} />
                  </Button>
                </div>
                
                {expanded[i] && (
                  <div className="mt-2 space-y-1 text-xs font-mono text-muted-foreground">
                    <p className="truncate">To: {step.to}</p>
                    <p className="truncate">Data: {step.data}</p>
                  </div>
                )}
                
                {hashes[i] && (
                  <a 
                    href={`https://arbiscan.io/tx/${hashes[i]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 text-xs text-emerald-500 flex items-center gap-1 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View transaction
                  </a>
                )}
                
                {errors[i] && (
                  <p className="mt-2 text-xs text-destructive break-words">{errors[i]}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
      
      <CardFooter className="px-4 py-3 bg-muted/30">
        {allDone ? (
          <p className="text-sm font-medium text-emerald-500 flex items-center gap-2 mx-auto">
            <Check className="h-4 w-4" />
            All transactions completed
          </p>
        ) : (
          <Button 
            onClick={executeAll} 
            disabled={running}
            className="w-full"
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Executing...
              </>
            ) : hasFailed ? (
              'Retry'
            ) : (
              'Execute Transactions'
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
