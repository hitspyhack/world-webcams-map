/** @type {import('next').NextConfig} */
const nextConfig = {
  // reactStrictMode disabled: react-leaflet 4.x is incompatible with
  // React 18 Strict Mode double-invoke — causes 'Map container already initialized'.
  // Safe to re-enable if/when upgrading to react-leaflet 5+ (React 19 native support).
  reactStrictMode: false,
  transpilePackages: ['leaflet', 'react-leaflet'],
};

export default nextConfig;
