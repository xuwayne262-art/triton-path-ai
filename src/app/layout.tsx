import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, THEME_BOOTSTRAP } from "@/components/plat/theme";
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
  title: "UCSDPlans — UCSD course radar & AI planner",
  description:
    "Grade distributions, professor ratings and Fall 2026 seats for every UCSD course, plus an AI four-year planner.",
  // "Add to Home Screen" on an iPhone opens it like an app, titled briefly.
  appleWebApp: { capable: true, title: "UCSDPlans", statusBarStyle: "default" },
  // A public path (see src/lib/auth/routes.ts): iOS fetches it for the icon.
  icons: { apple: "/apple-touch-icon.png" },
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
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
