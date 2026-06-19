import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sua experiência no trabalho importa | BeeTouch",
  description:
    "Plataforma de mapeamento de riscos psicossociais da BeeTouch.",
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
