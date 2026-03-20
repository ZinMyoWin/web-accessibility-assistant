import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Web Accessibility Assistant",
  description: "Scan webpages and review accessibility issues with repair guidance.",
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
