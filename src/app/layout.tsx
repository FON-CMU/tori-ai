import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TORI — AI Secretary",
  description: "ผู้ช่วยบันทึกการปฏิบัติงานตาม TOR",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
