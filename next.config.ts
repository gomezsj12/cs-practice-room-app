import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/jam",
        destination: "/calendar",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
