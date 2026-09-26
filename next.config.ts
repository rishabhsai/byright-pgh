import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // The model routes rebuild findings server-side from the shipped data files.
  outputFileTracingIncludes: { "/api/**": ["./public/data/lots.json", "./public/data/comps.json"] },
  /* config options here */
};

export default nextConfig;
