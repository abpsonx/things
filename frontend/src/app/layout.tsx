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
  // Internal/company-only app — keep it out of search engines.
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
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
