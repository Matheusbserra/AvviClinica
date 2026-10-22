import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { themeBootScript } from "@/lib/theme";

export const metadata: Metadata = {
  title: "AVVI Clínica",
  description: "Gestão de agenda, financeiro e performance para clínica estética."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootScript }} /></head>
      <body>{children}</body>
    </html>
  );
}

