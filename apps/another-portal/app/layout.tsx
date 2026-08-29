import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Another Portal | 会社という街に出勤する',
  description: '社員同士が自然につながる、ShiftCoreの仮想オフィス。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
