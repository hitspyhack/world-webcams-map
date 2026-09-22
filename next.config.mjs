/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['leaflet', 'react-leaflet'],
  webpack: (config) => {
    // Allow Leaflet to resolve its CSS assets correctly
    config.resolve.fallback = { fs: false };
    return config;
  },
};

export default nextConfig;
