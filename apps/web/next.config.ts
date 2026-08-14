import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    optimizePackageImports: [
      "antd",
      "@ant-design/icons",
      "lucide-react",
      "recharts",
      "dayjs",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/core",
    ],
  },
  images: {
    remotePatterns: [
      // GCS — where uploads (chat attachments, passage/question images, etc.)
      // live since the AWS -> GCP migration.
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
      // Legacy S3 — kept so pre-migration records with old URLs still render.
      {
        protocol: "https",
        hostname: "*.s3.*.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "*.amazonaws.com",
      },
    ],
  },
};

export default nextConfig;
