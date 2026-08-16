import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf ships pdf.js, which does its own dynamic requires. Bundling it breaks PDF
  // parsing at runtime on Vercel, so it is loaded as a plain Node dependency instead.
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
