import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { NavHeader } from "@/components/nav-header";
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
  title: "Δt",
  description: "Time-allocation calendar powered by Δt",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <div className="flex h-[100dvh] flex-col">
            <NavHeader />
            <div className="flex-1 min-h-0">{children}</div>
          </div>
          <Toaster />
        </ThemeProvider>
        {process.env.NODE_ENV === "production" && (
          <Script
            defer
            src="https://analytics.sorzel.com/script.js"
            data-website-id="5a86f917-86a6-415d-a1d8-04a0fc5ec458"
          />
        )}
      </body>
    </html>
  );
}
