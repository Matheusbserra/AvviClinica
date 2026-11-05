import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { themeBootScript } from "@/lib/theme";

export const metadata: Metadata = {
  title: "AVVI Clínica",
  description: "Gestão de agenda, financeiro e performance para clínica estética.",
  icons: {
    icon: { url: "/logo-avvi.png?v=1", type: "image/png" },
    shortcut: "/logo-avvi.png?v=1"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootScript }} /></head>
      <body>{children}</body>
    </html>
  );
}

