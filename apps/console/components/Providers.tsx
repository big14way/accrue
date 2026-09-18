"use client";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider as PrivyWagmiProvider, createConfig } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "viem";
import { WagmiProvider, createConfig as createPlainConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { chain, PRIVY_APP_ID, RPC } from "@/lib/config";
import { monad, monadTestnet, RPC_FALLBACKS } from "@accrue/sdk";

const transports = {
  [monadTestnet.id]: http(chain.id === monadTestnet.id ? RPC : RPC_FALLBACKS[monadTestnet.id][0]),
  [monad.id]: http(chain.id === monad.id ? RPC : RPC_FALLBACKS[monad.id][0]),
};

const queryClient = new QueryClient();

/**
 * Human onboarding: Privy embedded wallets when NEXT_PUBLIC_PRIVY_APP_ID is set (email / passkey /
 * social → wallet on Monad); otherwise plain injected wallets via wagmi. Read-only mode always works.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  if (PRIVY_APP_ID) {
    const config = createConfig({ chains: [monadTestnet, monad], transports });
    return (
      <PrivyProvider
        appId={PRIVY_APP_ID}
        config={{
          defaultChain: chain,
          supportedChains: [chain],
          embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
          appearance: { theme: "dark", accentColor: "#7ee2b8" },
          loginMethods: ["email", "wallet", "passkey", "google"],
        }}
      >
        <QueryClientProvider client={queryClient}>
          <PrivyWagmiProvider config={config}>{children}</PrivyWagmiProvider>
        </QueryClientProvider>
      </PrivyProvider>
    );
  }
  const config = createPlainConfig({ chains: [monadTestnet, monad], connectors: [injected()], transports });
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
