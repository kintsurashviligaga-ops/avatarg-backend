export const metadata = {
  title: "Avatar G Backend",
  description: "Backend is running"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
