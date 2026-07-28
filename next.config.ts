import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "./src/lib/security/policy";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [{ source: "/(.*)", headers: [...STATIC_SECURITY_HEADERS] }];
  },
};

export default nextConfig;
