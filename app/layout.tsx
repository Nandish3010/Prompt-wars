import type { Metadata } from 'next';
import '@/app/globals.css';

export const metadata: Metadata = {
  title:       'CrisisConnect',
  description: 'Emergency dispatch assistant powered by Google Gemini',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
