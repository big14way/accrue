import { monad, monadTestnet, anvil } from "viem/chains";
import type { Address, Chain } from "viem";

export { monad, monadTestnet };

/** Local Anvil for end-to-end runs (port 8546 so it never collides with a default node). */
export const anvilLocal: Chain = { ...anvil, rpcUrls: { default: { http: ["http://127.0.0.1:8546"] } } };

export const CHAINS: Record<number, Chain> = {
  [monadTestnet.id]: monadTestnet,
  [monad.id]: monad,
  [anvilLocal.id]: anvilLocal,
};

export const EXPLORERS: Record<number, string> = {
  [monadTestnet.id]: "https://testnet.monadexplorer.com",
  [monad.id]: "https://monadvision.com",
  [anvilLocal.id]: "http://127.0.0.1:8546/#",
};

export const DEFAULT_RPC: Record<number, string> = {
  [monadTestnet.id]: "https://testnet-rpc.monad.xyz",
  [monad.id]: "https://rpc.monad.xyz",
};

/** Public RPCs tried in order (viem `fallback`) when no rpcUrl is given. */
export const RPC_FALLBACKS: Record<number, string[]> = {
  [monadTestnet.id]: [
    "https://testnet-rpc.monad.xyz",
    "https://rpc-testnet.monadinfra.com",
    "https://monad-testnet.drpc.org",
    "https://rpc.ankr.com/monad_testnet",
  ],
  [monad.id]: ["https://rpc.monad.xyz", "https://monad.drpc.org", "https://rpc.ankr.com/monad"],
  [anvilLocal.id]: ["http://127.0.0.1:8546"],
};

/** ERC-8004 registries (CREATE2 vanity addresses, verified on both networks). */
export const ERC8004: Record<number, { identity: Address; reputation: Address }> = {
  [monadTestnet.id]: {
    identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  },
  [monad.id]: {
    identity: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  },
};

/** Chainlink CRE forwarders on Monad. */
export const CRE_FORWARDERS: Record<number, { production: Address; mock: Address; chainName: string }> = {
  [monadTestnet.id]: {
    production: "0xF8344CFd5c43616a4366C34E3EEE75af79a74482",
    mock: "0xB9F79d863261869B234c481D1f9A7af84AeAd192",
    chainName: "monad-testnet",
  },
  [monad.id]: {
    production: "0x76c9cf548b4179F8901cda1f8623568b58215E62",
    mock: "0x9eF6468C5f37b976E57d52054c693269479A784d",
    chainName: "monad-mainnet",
  },
};

export const TOKENS: Record<number, { USDC: Address; AUSD: Address }> = {
  [monadTestnet.id]: {
    USDC: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
    AUSD: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
  },
  [monad.id]: {
    USDC: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
    AUSD: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a",
  },
};

/** Live ERC-4626 yield vaults on Monad mainnet (Morpho, 17 Sep 2026). */
export const MAINNET_VAULTS = {
  groveSteakhouseAUSD: "0x32841A8511D5c2c5b253f45668780B99139e476D",
  steakhouseAUSD: "0xBC03E505EE65f9fAa68a2D7e5A74452858C16D29",
  steakhouseUSDC: "0x802c91d807A8DaCA257c4708ab264B6520964e44",
} as const;

export const X402_FACILITATOR = "https://x402-facilitator.molandak.org";

export function explorerTx(chainId: number, hash: string): string {
  return `${EXPLORERS[chainId] ?? EXPLORERS[monadTestnet.id]}/tx/${hash}`;
}

export function explorerAddress(chainId: number, address: string): string {
  return `${EXPLORERS[chainId] ?? EXPLORERS[monadTestnet.id]}/address/${address}`;
}
