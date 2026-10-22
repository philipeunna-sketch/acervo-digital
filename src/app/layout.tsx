import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers";
import { ThemeProvider, themeScript } from "@/components/theme/theme-provider";

export const metadata: Metadata = {
  title: {
    default: "Acervo Digital",
    template: "%s | Acervo Digital",
  },
  description:
    "Plataforma de gestao de arquivos, documentos, imagens, videos e descoberta de conteudo com inteligencia artificial.",
  applicationName: "Acervo Digital",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <ThemeProvider>
          <AppProviders>{children}</AppProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}
