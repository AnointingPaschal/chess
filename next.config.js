/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for wagmi v2 + viem with Next.js pages router
  transpilePackages: ['@rainbow-me/rainbowkit', 'wagmi', 'viem'],
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false }
    return config
  },
}
module.exports = nextConfig
