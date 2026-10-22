import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { SITE } from "@/lib/site";

const description =
  "A short, neutral political profile quiz. No subscription. No hidden costs. Unlock the full result for €1 (one‑time).";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "Pytheas Political Profile – 2‑Axis Quiz",
    template: "%s · Pytheas Institute",
  },
  description,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: "Pytheas Political Profile – Where do you stand?",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Pytheas Political Profile – Where do you stand?",
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
