import type { Metadata } from "next";
import { Raleway } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/features/providers/query-provider";
import "./globals.css";

const raleway = Raleway({
  variable: "--font-raleway",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://festicycling.com",
  ),
  title: "Festi - Your Cycling Community",
  description:
    "Plan rides, connect with cyclists, and explore new routes together.",
  icons: {
    icon: [
      { url: "/logo.ico" },
      {
        url: "/logo-original-black.png",
        media: "(prefers-color-scheme: light)",
        type: "image/png",
      },
      {
        url: "/logo-original-white.png",
        media: "(prefers-color-scheme: dark)",
        type: "image/png",
      },
    ],
    shortcut: "/logo.ico",
    apple: "/logo-original-white.png",
  },
  openGraph: {
    title: "Festi - Your Cycling Community",
    description:
      "Plan rides, connect with cyclists, and explore new routes together.",
    images: ["/logo-original-white.png"],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${raleway.variable} h-full antialiased`}>
      <body className="min-h-screen bg-background text-foreground font-[family-name:var(--font-raleway)]">
        <a
          href="#main-content"
          className="sr-only rounded-lg bg-popover px-4 py-2 text-sm font-medium text-popover-foreground ring-2 ring-ring focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-100"
        >
          Skip to content
        </a>
        <QueryProvider>{children}</QueryProvider>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
