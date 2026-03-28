/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensures @google/generative-ai stays server-side only (Next.js 14 syntax)
  experimental: {
    serverComponentsExternalPackages: ['@google/generative-ai'],
  },
  // Required for Cloud Run Docker deployment — outputs a minimal standalone server
  output: 'standalone',
};

export default nextConfig;
