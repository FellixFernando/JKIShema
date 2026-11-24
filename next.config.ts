import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.1.175', '192.168.100.18', 'localhost'],
  distDir: process.env.APP_ENV === 'e2e' ? '.next-e2e' : '.next',
};

export default nextConfig;
