import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/.prisma/client/query_compiler_bg.wasm",
      "./node_modules/.prisma/client/query_compiler_bg.js",
      "./node_modules/.prisma/client/schema.prisma"
    ]
  },
  serverExternalPackages: ["@prisma/client", ".prisma/client"]
};

export default nextConfig;
