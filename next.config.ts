import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.RAILWAY_BUILD === "1" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
