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
  // Absolute base so Open Graph/Twitter image and canonical URLs resolve.
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
        <QueryProvider>{children}</QueryProvider>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
