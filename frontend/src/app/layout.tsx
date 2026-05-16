import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Things - Project Management",
  description: "Kelola proyek tim kamu dengan elegan",
  manifest: "/manifest.json",
  icons: {
    icon: "/assets/logo.png",
    apple: "/assets/logo.png",
  },
  openGraph: {
    title: "Things - Project Management",
    description: "Kelola proyek tim kamu dengan elegan",
    url: "https://dothings.id",
    siteName: "Things",
    images: [
      {
        url: "https://dothings.id/assets/logo.png",
        width: 512,
        height: 512,
        alt: "Things Logo",
      },
    ],
    type: "website",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Things",
  },
  formatDetection: {
    telephone: false,
  },
};

import RootLayoutWrapper from "@/components/layout/RootLayoutWrapper";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { Toaster } from "sonner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Pre-hydration splash. Stays visible during the awkward gap
            between the OS PWA splash and React mounting. Removed by
            RootLayoutWrapper's first effect. */}
        <div
          id="boot-splash"
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            background: "#ffffff",
            transition: "opacity 280ms ease",
          }}
        >
          <div style={{ position: "relative", width: 64, height: 64 }}>
            <img
              src="/assets/logo.png"
              alt=""
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                objectFit: "contain",
                animation: "thingsBootPulse 1.4s ease-in-out infinite",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: -10,
                borderRadius: 22,
                border: "2px solid rgba(0,0,0,0.08)",
                borderTopColor: "rgba(0,0,0,0.55)",
                animation: "thingsBootSpin 0.9s linear infinite",
              }}
            />
          </div>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.04em",
              color: "rgba(0,0,0,0.45)",
              fontFamily: "system-ui, -apple-system, sans-serif",
              margin: 0,
            }}
          >
            Memuat Things…
          </p>
          <style
            dangerouslySetInnerHTML={{
              __html: `
                @keyframes thingsBootPulse { 0%,100% { transform: scale(1); opacity:.95 } 50% { transform: scale(1.06); opacity:.7 } }
                @keyframes thingsBootSpin { to { transform: rotate(360deg) } }
                @media (prefers-color-scheme: dark) { #boot-splash { background: #0a0a0a !important } #boot-splash p { color: rgba(255,255,255,0.45) !important } #boot-splash > div > div { border-color: rgba(255,255,255,0.08); border-top-color: rgba(255,255,255,0.55) } }
              `,
            }}
          />
        </div>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <RootLayoutWrapper>
            {children}
          </RootLayoutWrapper>
          <Toaster
            position="top-right"
            richColors
            closeButton
            theme="system"
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
