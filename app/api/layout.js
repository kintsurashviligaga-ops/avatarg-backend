export const metadata = {
  title: "Avatar G Backend",
  description: "Avatar G Backend API — Next.js 14 App Router",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
