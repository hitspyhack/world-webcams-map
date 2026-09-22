import './globals.css';

export const metadata = {
  title: 'World Webcams Map',
  description: 'Windy + Skyline webcam world map — hitspyhack',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
