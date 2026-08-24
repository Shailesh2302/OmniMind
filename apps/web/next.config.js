/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
// Bare origin for proxying storage/api paths (no /api suffix).
const API_ORIGIN = process.env.API_ORIGIN || "http://localhost:3001";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    domains: ["localhost", "res.cloudinary.com"],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
      {
        source: "/storage/:path*",
        destination: `${API_ORIGIN}/storage/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
