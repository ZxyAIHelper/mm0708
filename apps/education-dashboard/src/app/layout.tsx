import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "教育质量看板 Demo",
  description: "面向校长、教师与学生视角的教育质量分析演示看板。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
