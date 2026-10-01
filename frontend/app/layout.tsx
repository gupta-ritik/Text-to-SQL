import "./globals.css";
import Script from "next/script";

export const metadata = {
  title: "Text-to-SQL AI Agent",
  description: "LangGraph Text-to-SQL with Schema RAG"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
