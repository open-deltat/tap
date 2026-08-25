import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@open-deltat/examples/components/ui/sonner";
import { NavHeader } from "@/components/nav-header";
import { JsonLd } from "@/components/json-ld";
import { SITE, TITLE_TEMPLATE, organizationLd, websiteLd, softwareApplicationLd } from "@/lib/seo";
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
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.defaultTitle,
    template: TITLE_TEMPLATE,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "Δt",
    "deltat",
    "time allocation protocol",
    "TAP",
    "scheduling database",
    "booking database",
    "availability engine",
    "holds",
    "real-time scheduling",
    "self-hostable",
  ],
  authors: [{ name: SITE.org, url: SITE.github }],
  creator: SITE.org,
  publisher: SITE.org,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: SITE.defaultTitle,
    description: SITE.description,
    url: SITE.url,
    locale: "en_US",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: SITE.defaultTitle }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.defaultTitle,
    description: SITE.description,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
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
        <JsonLd graph={[organizationLd(), websiteLd(), softwareApplicationLd()]} />
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
