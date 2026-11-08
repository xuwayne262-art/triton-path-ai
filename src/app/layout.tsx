import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, THEME_BOOTSTRAP } from "@/components/plat/theme";
import { TermAddressSync } from "@/components/plat/useTerm";
import { HOME_DESCRIPTION, HOME_TITLE, SITE_NAME, TITLE_TEMPLATE } from "@/lib/siteTitle";
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
  // The home page gets the default; a page that names itself gets "<name> | UCSDPlans".
  title: { default: HOME_TITLE, template: TITLE_TEMPLATE },
  // The home page's search snippet; pages that describe themselves keep their own.
  description: HOME_DESCRIPTION,
  // og:site_name on every page. Next.js fills each page's og:title and
  // og:description from its own title and description, so nothing here may
  // name a single page. Course and professor pages set theirs in full.
  openGraph: { siteName: SITE_NAME, type: "website" },
  // "Add to Home Screen" on an iPhone opens it like an app, titled briefly.
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
  // Public paths (see src/lib/auth/routes.ts). The tab icon is
  // src/app/favicon.ico, which Next.js links first by itself. The 96 px PNG
  // is the same logo for search results (Google wants a multiple of 48 px); it
  // sits in public/ at a stable address, because declaring `icons` here makes
  // Next.js skip an app/icon.png. iOS fetches the apple icon for the Home Screen.
  icons: {
    icon: [{ url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" }],
    apple: "/apple-touch-icon.png",
  },
};

/**
 * Zoom stays enabled — pinching is how many people read small print. The
 * theme colour tints Safari's bars to match the page instead of a white band.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1420" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* First thing in the body, so it still runs before anything is painted. It used to sit in a
            hand-written <head>, which made server-rendered pages (/housing/new) fail to hydrate. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
        <TermAddressSync />
      </body>
    </html>
  );
}
