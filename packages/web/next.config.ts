import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // API routes that use the MCP SDK need Node.js, not edge runtime.
  // This is the default — stated explicitly for clarity.
  serverExternalPackages: ["@modelcontextprotocol/sdk"],
};

export default nextConfig;
