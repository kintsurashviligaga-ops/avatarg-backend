export const metadata = {
  title: "Avatar G Backend",
  description: "Avatar G Backend (Next.js API)",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>{children}</body>
    </html>
  );
}
