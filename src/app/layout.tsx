import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pesquisa de Saúde e Bem-Estar | Instituto Alana",
  description:
    "Plataforma de mapeamento de riscos psicossociais do Instituto Alana.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} dark`}
    >
      <body>{children}</body>
    </html>
  );
}
