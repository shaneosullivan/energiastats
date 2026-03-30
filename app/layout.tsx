import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Irish Energy Insights - Electricity Usage Dashboard",
  description:
    "Analyse your Irish electricity usage with detailed insights, comparisons, tariff analysis and energy-saving suggestions. Simulate savings from batteries and EVs. Free, open source, and fully private — your data never leaves your browser.",
  icons: {
    icon: [{ url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" }],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/favicon/site.webmanifest",
  metadataBase: new URL("https://energy.chofter.com"),
  openGraph: {
    title: "Irish Energy Insights",
    description:
      "Analyse your Irish electricity usage with detailed insights, tariff comparisons, and battery & EV savings simulations. Free and private — your data stays on your device.",
    url: "https://energy.chofter.com",
    siteName: "Irish Energy Insights",
    locale: "en_IE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Irish Energy Insights",
    description:
      "Analyse your Irish electricity usage with detailed insights, tariff comparisons, and battery & EV savings simulations. Free and private.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}
      >
        <div className="pb-12">{children}</div>
        <footer className="fixed bottom-0 left-0 w-full border-t border-gray-200 bg-white py-3 text-center text-xs text-gray-400 z-30">
          Created by{" "}
          <a
            href="https://chofter.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-gray-700 underline"
          >
            Shane O&apos;Sullivan
          </a>
          {" · "}
          <a
            href="https://github.com/shaneosullivan/energiastats"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-gray-700 underline"
          >
            Source
          </a>
          {" · "}
          MIT License
        </footer>
        <script
          async
          src="https://scripts.simpleanalyticscdn.com/latest.js"
        ></script>
      </body>
    </html>
  );
}
