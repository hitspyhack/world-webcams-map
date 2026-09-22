/** @type {import('next').NextConfig} */
const nextConfig = {
  // reactStrictMode disabled: react-leaflet 4.x is incompatible with
  // React 18 Strict Mode double-invoke — causes 'Map container already initialized'.
  reactStrictMode: false,
  transpilePackages: ['leaflet', 'react-leaflet'],
  watchOptions: {
    // Prevent Watchpack from scanning C:\ system files (EINVAL warnings)
    ignored: /node_modules/,
  },
};

export default nextConfig;
