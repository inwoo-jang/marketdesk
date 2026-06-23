import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "리포트렌즈",
  description: "산업리포트를 내 관점(취업·투자)으로 정리·누적하는 도구",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
