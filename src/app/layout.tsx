import "./globals.css";
import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Lakeside Dry Goods",
  description: "Store operations, capture first"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <header style={{ borderBottom: "1px solid var(--border)", background: "var(--panel)" }}>
          <div style={{ maxWidth: 980, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Link href="/" style={{ textDecoration: "none", color: "var(--text-primary)", fontWeight: 700, fontSize: 17 }}>
              Lakeside Dry Goods
            </Link>
            <Link href="/capture" className="btn-primary" style={{ textDecoration: "none" }}>
              + Capture
            </Link>
          </div>
        </header>
        <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 20px 64px" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
