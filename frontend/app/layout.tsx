import "./globals.css";

export const metadata = {
  title: "Text-to-SQL AI Agent",
  description: "LangGraph Text-to-SQL with Schema RAG"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
