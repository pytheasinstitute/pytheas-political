import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Political Profile – 2‑Axis Quiz",
  description:
    "A short, neutral political profile quiz. No subscription. No hidden costs. Unlock the full result for €1 (one‑time).",
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
