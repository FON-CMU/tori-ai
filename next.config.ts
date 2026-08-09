import type { NextConfig } from "next";

// Vercel produces its own output; `standalone` is only for the Docker runner.
const isVercel = Boolean(process.env.VERCEL);

const nextConfig: NextConfig = {
  reactCompiler: true,
  ...(isVercel ? {} : { output: "standalone" as const }),
  // pdfkit reads assets/*.afm from its own package directory at runtime, and
  // pdf-parse/mammoth are Node-only. Bundling them breaks those reads.
  serverExternalPackages: ["pdfkit", "pdf-parse", "mammoth"],
  // assets/fonts lives outside public/ and is loaded through process.cwd(),
  // so nothing imports it and file tracing cannot find it on its own.
  outputFileTracingIncludes: {
    "/api/tor/[id]/export": ["./assets/fonts/THSarabunNew*.ttf", "./node_modules/pdfkit/js/data/**"],
    "/api/ja/[id]/export": ["./assets/fonts/THSarabunNew*.ttf", "./node_modules/pdfkit/js/data/**"],
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    }];
  },
};

export default nextConfig;
