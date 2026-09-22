import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Accrue — escrow that earns while it waits", template: "%s · Accrue" },
  description: "Yield-bearing ERC-8183 job escrow with receivables advances and a Chainlink CRE evaluator, for agent-to-agent commerce on Monad.",
  metadataBase: new URL("https://accrue-virid.vercel.app"),
  openGraph: { title: "Accrue — escrow that earns while it waits", description: "Yield-bearing ERC-8183 escrow, receivables advances priced on ERC-8004 history, and an evaluator that is a contract, on Monad.", images: ["/img/hero.jpg"], type: "website" },
  twitter: { card: "summary_large_image" },
};
export const viewport: Viewport = { themeColor: "#06090c", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <Providers>
          <Nav />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
