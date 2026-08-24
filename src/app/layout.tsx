import type { Metadata, Viewport } from "next";

import "./globals.css";

const APP_NAME = "重複ファイル検出・ストレージ整理ツール";

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description:
    "ファイルを端末内でSHA-256解析し、完全重複・巨大・古い・空ファイルを可視化。Human Reviewを経た安全な整理計画を作成します。",
  applicationName: APP_NAME,
  keywords: [
    "重複ファイル",
    "ストレージ整理",
    "SHA-256",
    "Local-first",
    "業務効率化",
  ],
  category: "productivity",
  formatDetection: {
    address: false,
    email: false,
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "重複整理",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f5f5f7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" data-scroll-behavior="smooth">
      <body className="app-body">
        <a className="skip-link" href="#main-content">
          メインコンテンツへ移動
        </a>
        {children}
      </body>
    </html>
  );
}
