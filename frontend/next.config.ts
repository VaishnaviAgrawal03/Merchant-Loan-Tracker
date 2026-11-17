import type { NextConfig } from "next";

// This app renders entirely in the browser and talks to the Express API, so it uses
// Next.js's classic navigation (each page unmounts when you leave it). Cache Components
// is turned off on purpose: it keeps hidden copies of previous pages mounted.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
