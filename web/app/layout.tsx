import type { Metadata } from "next";
import "./globals.css";
import { AppNav } from "@/components/app-nav";

export const metadata: Metadata = {
  title: "마켓데스크 (MarketDesk)",
  description: "산업·기업 리포트와 경제뉴스를 내 관점(취업·투자)으로 정리·누적하는 도구",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AppNav />
        {children}
      </body>
    </html>
  );
}
