import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "./globals.css";

export const metadata = {
  title: "Neuro UI Analyzer",
  description: "Predicted attention, layout analysis and brain-region estimates for UI designs.",
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
