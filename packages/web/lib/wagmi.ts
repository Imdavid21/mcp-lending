import { createConfig, http } from "wagmi";
import {
  mainnet, optimism, cronos, telos, xdc, bsc, gnosis, unichain,
  polygon, monad, sonic, manta, fantom, zoraTestnet, metis, coreDao,
  moonbeam, sei, soneium, morph, mantle, klaytn, base, plasma, mode,
  arbitrum, hemi, avalanche, linea, berachain, blast, taiko, scroll, katana,
} from "wagmi/chains";
import { injected } from "wagmi/connectors";

const chains = [
  mainnet, optimism, cronos, telos, xdc, bsc, gnosis, unichain,
  polygon, monad, sonic, manta, fantom, zoraTestnet, metis, coreDao,
  moonbeam, sei, soneium, morph, mantle, klaytn, base, plasma, mode,
  arbitrum, hemi, avalanche, linea, berachain, blast, taiko, scroll, katana,
] as const;

export const wagmiConfig = createConfig({
  chains,
  connectors: [injected()],
  ssr: true,
  transports: Object.fromEntries(chains.map(c => [c.id, http()])),
});
