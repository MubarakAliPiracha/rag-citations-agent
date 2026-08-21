import type { Metadata } from "next";
import { EB_Garamond, JetBrains_Mono } from "next/font/google";

import "./globals.css";

/*
  Two families, no third.

  Serif carries everything the reader reads as prose — headings, answers, questions.
  Mono carries everything the machine asserts — queries, page labels, scores, citations.
  That split is doing semantic work: you can tell at a glance whether you are looking at
  language the model wrote or at a fact the system measured. A sans-serif in the middle
  would blur exactly that line, which is why there isn't one.
*/
const serif = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-eb-garamond",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RAG Agent with Citation Grounding",
  description:
    "A retrieval agent that writes its own search queries, cites every claim to an exact " +
    "page, and refuses to answer when the evidence is not there.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Committed to dark. The palette below is tuned as a single coherent scheme rather
    // than two half-tuned ones.
    <html lang="en" className={`${serif.variable} ${mono.variable}`} style={{ colorScheme: "dark" }}>
      <body className="h-dvh overflow-hidden">{children}</body>
    </html>
  );
}
