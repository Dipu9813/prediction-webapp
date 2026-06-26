import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bhagya Bharosa AI",
  description:
    "Predict FIFA World Cup match scores and climb the leaderboard. Powered by state-of-the-art machine learning (it's basically luck).",
  // Favicon is provided by the file convention: src/app/icon.png
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
