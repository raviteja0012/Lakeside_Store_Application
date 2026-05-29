import "./globals.css";
import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Robinsons General Store",
  description: "Store operations, capture first"
};

const navLink = { textDecoration: "none", color: "var(--text-secondary)", fontWeight: 500 } as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <header className="no-print" style={{ borderBottom: "1px solid var(--border)", background: "var(--panel)" }}>
          <div style={{ maxWidth: 980, margin: "0 auto", padding: "12px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <Link href="/" style={{ textDecoration: "none", color: "var(--text-primary)", fontWeight: 700, fontSize: 17 }}>
                Robinsons General Store
              </Link>
              <nav style={{ display: "flex", gap: 14, fontSize: 14, flexWrap: "wrap" }}>
                <Link href="/" style={navLink}>Feed</Link>
                <Link href="/dashboard" style={navLink}>Dashboard</Link>
                <Link href="/vendors" style={navLink}>Vendors</Link>
                <Link href="/overdue" style={navLink}>Overdue</Link>
                <Link href="/knowledge" style={navLink}>Knowledge</Link>
                <Link href="/price-signs" style={navLink}>Price signs</Link>
              </nav>
            </div>
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
