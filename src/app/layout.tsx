import type { Metadata } from "next";
import { Unbounded, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StonksTerminal Pro",
  description: "Bloomberg-style end-to-end pre-market intelligence terminal with live market data, news aggregation, and AI-powered analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${unbounded.variable} ${hankenGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased dark`}
    >
      <body className="flex h-screen overflow-hidden bg-background font-sans text-foreground">
        <Sidebar />
        <main className="flex-1 overflow-hidden relative bg-[#020408]">{children}</main>
      </body>
    </html>
  );
}
