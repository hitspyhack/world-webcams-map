import './globals.css';

export const metadata = {
  title: 'World Webcams Map',
  description: 'Discover public webcams around the world. Explore the globe, save your favorite views, and follow tourism and traffic cameras.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
