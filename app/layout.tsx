import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './hud-theme.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://sketchsite-chef-bagels.howardhuang.chatgpt.site'),
  title: 'Sketchly — Wireframe to website',
  description:
    'Sketch a website wireframe and turn it into a polished responsive page.',
  icons: {
    icon: '/icon.jpg',
    apple: '/icon.jpg',
  },
  openGraph: {
    title: 'Sketchly — Wireframe to website',
    description:
      'Draw a wireframe and turn it into a polished responsive website.',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1730,
        height: 909,
        alt: 'Sketchly turns a drawn wireframe into a finished website.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sketchly — Wireframe to website',
    description:
      'Draw a wireframe and turn it into a polished responsive website.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
