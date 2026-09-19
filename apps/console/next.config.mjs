import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@accrue/sdk"],
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
  // pnpm workspace: trace server files from the monorepo root so prebuilt deploys carry them.
  outputFileTracingRoot: resolve(here, "..", ".."),
  turbopack: { root: resolve(here, "..", "..") },
};
export default nextConfig;
