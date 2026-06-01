import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  // skipWaiting + clientsClaim: SW baru langsung take-over begitu user
  // reload, gak perlu close-reopen PWA. Sebelumnya bug fix di JS gak
  // sampai ke PWA standalone karena SW lama tetap serve asset cached.
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
  },
});

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {}
};

export default withPWA(nextConfig);
