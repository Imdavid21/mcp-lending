'use client';

import React from 'react';

const CHAIN_INFO: Record<string, { name: string }> = {
  '1': { name: 'Ethereum' }, '10': { name: 'OP Mainnet' }, '25': { name: 'Cronos' },
  '40': { name: 'Telos' }, '50': { name: 'XDC Network' }, '56': { name: 'BNB Smart Chain' },
  '100': { name: 'Gnosis' }, '130': { name: 'Unichain' }, '137': { name: 'Polygon' },
  '143': { name: 'Monad' }, '146': { name: 'Sonic' }, '169': { name: 'Manta Pacific' },
  '250': { name: 'Fantom' }, '999': { name: 'Zora Goerli Testnet' }, '1088': { name: 'Metis' },
  '1116': { name: 'Core DAO' }, '1284': { name: 'Moonbeam' }, '1329': { name: 'Sei Network' },
  '1868': { name: 'Soneium' }, '2818': { name: 'Morph' }, '5000': { name: 'Mantle' },
  '8217': { name: 'Klaytn' }, '8453': { name: 'Base' }, '9745': { name: 'Plasma' },
  '34443': { name: 'Mode' }, '42161': { name: 'Arbitrum One' }, '43111': { name: 'Hemi' },
  '43114': { name: 'Avalanche' }, '59144': { name: 'Linea' }, '80094': { name: 'Berachain' },
  '81457': { name: 'Blast' }, '167000': { name: 'Taiko' }, '534352': { name: 'Scroll' },
  '747474': { name: 'Katana' },
};

const LENDER_INFO: Record<string, { name: string; defillamaSlug: string }> = {
  AAVE_V2: { name: 'Aave V2', defillamaSlug: 'aave-v2' },
  AAVE_V3: { name: 'Aave V3', defillamaSlug: 'aave-v3' },
  COMPOUND_V2: { name: 'Compound V2', defillamaSlug: 'compound' },
  COMPOUND_V3: { name: 'Compound V3', defillamaSlug: 'compound-v3' },
  LENDLE: { name: 'Lendle', defillamaSlug: 'lendle' },
  AURELIUS: { name: 'Aurelius', defillamaSlug: 'aurelius' },
  MENDI: { name: 'Mendi Finance', defillamaSlug: 'mendi-finance' },
  MOONWELL: { name: 'Moonwell', defillamaSlug: 'moonwell' },
  SILO: { name: 'Silo Finance', defillamaSlug: 'silo-finance' },
  RADIANT_V2: { name: 'Radiant V2', defillamaSlug: 'radiant-v2' },
};

type ParsedEntity =
  | { kind: 'token'; symbol: string }
  | { kind: 'chain'; chainId: string }
  | { kind: 'market'; lenderId: string; chainId: string };

function parseHref(href: string): ParsedEntity | null {
  if (href.startsWith('token:')) return { kind: 'token', symbol: href.slice(6) };
  if (href.startsWith('chain:')) return { kind: 'chain', chainId: href.slice(6) };
  if (href.startsWith('market:')) {
    const [lenderId, chainId] = href.slice(7).split(':');
    if (lenderId && chainId) return { kind: 'market', lenderId, chainId };
  }
  return null;
}

function PopupRow({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 shrink-0">{label}</span>
      <span className="text-xs text-gray-800 dark:text-gray-200 font-mono truncate">{value}</span>
    </span>
  );
}

export function EntityChip({ href, children }: { href: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLSpanElement>(null);
  const entity = parseHref(href);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!entity) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="underline text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">
        {children}
      </a>
    );
  }

  let chipCls: string, externalUrl: string, externalLabel: string, popupRows: React.ReactNode, icon: React.ReactNode;

  if (entity.kind === 'token') {
    chipCls = 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-700 hover:bg-sky-200 dark:hover:bg-sky-800/60';
    externalUrl = `https://www.coingecko.com/en/search?query=${encodeURIComponent(entity.symbol)}`;
    externalLabel = 'View on CoinGecko';
    icon = <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="9" strokeWidth={2} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v8M9 10h4.5a1.5 1.5 0 010 3H9" /></svg>;
    popupRows = <PopupRow label="Symbol" value={entity.symbol} />;
  } else if (entity.kind === 'chain') {
    const info = CHAIN_INFO[entity.chainId];
    chipCls = 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-800/60';
    externalUrl = `https://chainlist.org/chain/${entity.chainId}`;
    externalLabel = 'View on Chainlist';
    icon = <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>;
    popupRows = <><PopupRow label="Chain" value={info?.name ?? entity.chainId} /><PopupRow label="Chain ID" value={entity.chainId} /></>;
  } else {
    const lender = LENDER_INFO[entity.lenderId];
    const chain = CHAIN_INFO[entity.chainId];
    chipCls = 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-700 hover:bg-violet-200 dark:hover:bg-violet-800/60';
    externalUrl = `https://defillama.com/yields?project=${lender?.defillamaSlug ?? entity.lenderId.toLowerCase().replace(/_/g, '-')}`;
    externalLabel = 'View on DeFiLlama';
    icon = <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21V9l9-6 9 6v12M9 21v-6h6v6" /></svg>;
    popupRows = <><PopupRow label="Protocol" value={lender?.name ?? entity.lenderId} /><PopupRow label="Chain" value={chain?.name ?? entity.chainId} /><PopupRow label="Lender ID" value={entity.lenderId} /></>;
  }

  return (
    <span ref={containerRef} className="relative inline-block align-baseline">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-medium transition-colors mx-0.5 leading-none cursor-pointer ${chipCls}`}>
        {icon}<span>{children}</span>
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-52">
          <span className="block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl px-3 py-2.5 space-y-1.5">
            {popupRows}
            <span className="block border-t border-gray-100 dark:border-gray-700 pt-1.5 mt-0.5">
              <a href={externalUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                onClick={e => e.stopPropagation()}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                {externalLabel}
              </a>
            </span>
          </span>
          <span className="block w-0 h-0 mx-auto border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-200 dark:border-t-gray-600" />
          <span className="block w-0 h-0 mx-auto border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white dark:border-t-gray-800 -mt-[5px]" />
        </span>
      )}
    </span>
  );
}
