import "./globals.css";
import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Robinsons General Store",
  description: "Store operations, capture first"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <AuthGate>
          <Header />
          <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 20px 64px" }}>
            {children}
          </main>
        </AuthGate>
      </body>
    </html>
  );
}
