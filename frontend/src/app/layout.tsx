import type { Metadata } from "next"
import { Manrope } from "next/font/google"
import { AuthProvider } from "@/lib/contexts/AuthContext"
import { PreferencesProvider } from "@/lib/contexts/PreferencesContext"
import "./globals.css"

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" })

export const metadata: Metadata = {
  title: "AccessAudit - Find and fix web accessibility issues",
  description:
    "Scan webpages, detect WCAG 2.2 issues, and review AI-guided repair suggestions.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className={`${manrope.className} ${manrope.variable} bg-background text-foreground antialiased`}
      >
        <AuthProvider>
          <PreferencesProvider>{children}</PreferencesProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
