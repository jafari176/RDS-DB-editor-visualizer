import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DB Visualizer',
  description: 'AWS RDS PostgreSQL database visualizer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-gray-950 text-gray-100" style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace" }}>
        {children}
      </body>
    </html>
  );
}
