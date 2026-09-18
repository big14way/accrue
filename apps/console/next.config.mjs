/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@accrue/sdk"],
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
  turbopack: {},
};
export default nextConfig;
