import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerEnv } from "@/lib/env/server";
import "./globals.css";

export function generateMetadata(): Metadata {
  const env = getServerEnv();

  return {
    metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
    title: "InformationBoard",
    description: "매장, 행사, 모임 안내를 만들고 QR로 공유하세요.",
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
