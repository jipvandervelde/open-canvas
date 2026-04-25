import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import "dialkit/styles.css";
import { ThemeApplier } from "@/components/ThemeApplier";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Open Canvas",
  description: "Figma × Claude Code, as one tool.",
};

/**
 * Runs synchronously in the browser BEFORE React hydrates and before the
 * first paint. Sets `data-theme` on <html> from localStorage first, then
 * falls back to the system preference. Without this, the server renders
 * without a theme attribute (SSR has no window) and the initial paint is
 * light-default — then the client hydrates and the theme store flips it,
 * producing the visible "half light, half dark" flash.
 *
 * Keep this in sync with `detectInitial()` in lib/theme-store.ts so the
 * store's later hydration is a no-op.
 */
const themeBootScript = `(function(){try{var t=localStorage.getItem("oc:theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}var r=document.documentElement;r.setAttribute("data-theme",t);r.style.colorScheme=t;}catch(e){}})();`;

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
        <Script
          id="oc-theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeBootScript }}
        />
        <ThemeApplier />
        {children}
      </body>
    </html>
  );
}
