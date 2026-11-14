import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "./globals.css";

export const metadata = {
  title: "Neuro UI Analyzer",
  description: "Predicted attention, layout analysis and brain-region estimates for UI designs.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
