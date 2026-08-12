import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: "Griglia PCP | Repertory Grid Studio",
    description: "Applicazione per inserire e analizzare Griglie di Repertorio nella cornice della Personal Construct Psychology.",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "Griglia PCP",
      description: "Repertory Grid Studio per analisi descrittive, correlazioni, PCA, cluster e indici PCP.",
      images: [{ url: "/og.png", width: 1734, height: 908, alt: "Griglia PCP Repertory Grid Studio" }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Griglia PCP",
      description: "Repertory Grid Studio per l'analisi delle Griglie di Repertorio.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
