import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'BOOSTIFY Control · Finanzas claras',
  description: 'Panel financiero privado de BOOSTIFY',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
