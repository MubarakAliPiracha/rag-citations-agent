import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf ships pdf.js, which does its own dynamic requires. Bundling it breaks PDF
  // parsing at runtime on Vercel, so it is loaded as a plain Node dependency instead.
  serverExternalPackages: ["unpdf"],

  // /evals readdirs eval/results at request time. The tracer cannot follow a runtime
  // path, so without this the report is absent from the serverless bundle and the page
  // silently renders its "no runs yet" state in production while working fine locally.
  outputFileTracingIncludes: {
    "/evals": ["./eval/results/**/*"],
  },
};

export default nextConfig;
