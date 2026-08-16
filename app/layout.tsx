import type { Metadata } from "next";
import { EB_Garamond, Lato } from "next/font/google";

import "./globals.css";

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-eb-garamond",
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-lato",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RAG Agent with Citation Grounding",
  description:
    "Ask questions about your own PDFs and get answers with citations — or an honest " +
    "\"I don't know\" when the answer isn't in the documents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ebGaramond.variable} ${lato.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
