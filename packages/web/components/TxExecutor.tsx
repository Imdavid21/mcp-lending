'use client';

import React from 'react';
import { useAccount, useSendTransaction, useSwitchChain } from 'wagmi';

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

function StatusDot({ status }: { status: StepStatus }) {
  if (status === 'pending') return <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin flex-shrink-0" />;
  if (status === 'success') return <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0"><svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></div>;
  if (status === 'error') return <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0"><svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></div>;
  return <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />;
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
    <div className="border-b border-blue-100 dark:border-blue-900">
      {lowHF && <div className="px-3 py-1.5 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 font-medium">Warning: health factor below 1.5 after this action</div>}
      <table className="w-full">
        <thead><tr className="bg-blue-50 dark:bg-blue-950"><th className="px-3 py-1.5 text-left font-semibold text-blue-700 dark:text-blue-300">Simulation</th><th className="px-3 py-1.5 text-right font-medium text-gray-400 dark:text-gray-500">Before</th><th className="px-3 py-1.5 text-right font-semibold text-blue-700 dark:text-blue-300">After</th></tr></thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map(row => (
            <tr key={row.label} className="bg-white dark:bg-gray-800">
              <td className="px-3 py-1 text-gray-500 dark:text-gray-400">{row.label}</td>
              <td className="px-3 py-1 text-right font-mono text-gray-400 dark:text-gray-500">{row.before}</td>
              <td className={`px-3 py-1 text-right font-mono font-medium ${row.danger ? 'text-red-500' : 'text-gray-900 dark:text-gray-100'}`}>{row.after}</td>
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
        if (step.chainId && step.chainId !== currentChainId) await switchChainAsync({ chainId: step.chainId });
        const hash = await sendTransactionAsync({ to: step.to as `0x${string}`, data: step.data as `0x${string}`, value: parseValue(step.value) });
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
    <div className="mt-3 rounded-lg border border-blue-200 dark:border-blue-800 overflow-hidden text-xs">
      <div className="bg-blue-50 dark:bg-blue-950 px-3 py-2 font-semibold text-blue-700 dark:text-blue-300">{steps.length} transaction{steps.length !== 1 ? 's' : ''} to execute</div>
      {quote && <QuotePanel quote={quote} />}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-2 px-3 py-2 bg-white dark:bg-gray-800">
            <div className="mt-0.5"><StatusDot status={statuses[i]} /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="font-medium text-gray-900 dark:text-gray-100 capitalize flex-1">{step.description}</p>
                <button onClick={() => setExpanded(prev => prev.map((v, idx) => idx === i ? !v : v))} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition flex-shrink-0">
                  <svg className={`w-3.5 h-3.5 transition-transform ${expanded[i] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
              </div>
              {expanded[i] && <div className="mt-1 space-y-0.5"><p className="font-mono text-gray-400 truncate">{step.to}</p><p className="font-mono text-gray-300 dark:text-gray-600 truncate">{step.data}</p></div>}
              {hashes[i] && <p className="font-mono text-green-600 dark:text-green-400 truncate">tx: {hashes[i]}</p>}
              {errors[i] && <p className="text-red-500 break-words">{errors[i]}</p>}
            </div>
          </div>
        ))}
      </div>
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900">
        {allDone ? (
          <p className="text-center font-medium text-green-600 dark:text-green-400">All transactions completed</p>
        ) : (
          <button onClick={executeAll} disabled={running} className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800 text-white font-medium rounded transition">
            {running ? 'Executing…' : hasFailed ? 'Retry' : 'Execute Transactions'}
          </button>
        )}
      </div>
    </div>
  );
}
