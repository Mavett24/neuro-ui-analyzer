import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "./globals.css";

const description = "Predicted gaze, an auditable layout check and fMRI-based brain maps for any UI screenshot.";

// The favicon, Apple icon and social image come from the icon, apple-icon and opengraph-image files in app/.
export const metadata = {
  metadataBase: new URL("https://neuro-ui-analyzer.vercel.app"),
  title: "Neuro UI Analyzer",
  description,
  openGraph: {
    title: "Neuro UI Analyzer: know what the brain sees first",
    description,
    url: "/",
    siteName: "Neuro UI Analyzer",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Neuro UI Analyzer: know what the brain sees first",
    description,
  },
};

// viewport-fit=cover lets fixed bars respect the iPhone home indicator through env(safe-area-inset-*).
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
