import type { Metadata } from 'next';
import '@fontsource-variable/google-sans-flex';
import './globals.css';
import { SITE, SITE_NAME } from '@/lib/agents/data';

export const metadata: Metadata = {
  title: { default: "What's on in Jersey | Visitor Guide", template: '%s | Jersey Visitor Guide' },
  description: "Events, tours and experiences in Jersey, from the official Jersey visitor guide.",
  metadataBase: new URL(SITE),
  applicationName: SITE_NAME,
  openGraph: { siteName: 'Visitor: Jersey’s What’s On Guide', locale: 'en_GB', type: 'website' },
  twitter: { card: 'summary_large_image' },
  // For agents: the site described for them, and its API.
  other: { 'llms-txt': `${SITE}/llms.txt` },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
