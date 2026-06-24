import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Rocksgroup HR Bot',
  description: 'LINE HR Chatbot by Rocksgroup',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  )
}
