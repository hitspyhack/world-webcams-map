/** @type {import('next').NextConfig} */
const nextConfig = {
  // reactStrictMode disabled: react-leaflet 4.x incompatible with Strict Mode double-invoke
  reactStrictMode: false,
  transpilePackages: ['leaflet', 'react-leaflet'],
};

export default nextConfig;
