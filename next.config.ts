import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Docker ใช้ standalone; Vercel สร้าง output เอง — อย่าบังคับ standalone บน Vercel
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
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
