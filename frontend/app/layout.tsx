import "./globals.css";

export const metadata = {
  title: "Text-to-SQL AI Agent",
  description: "LangGraph Text-to-SQL with Schema RAG"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script src="https://accounts.google.com/gsi/client" async defer />
      </head>
      <body>{children}</body>
    </html>
  );
}
