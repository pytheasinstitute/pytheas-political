import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid Next/Turbopack picking the monorepo root when multiple lockfiles exist.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
