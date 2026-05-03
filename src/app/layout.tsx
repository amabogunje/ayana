import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "@/components/top-nav";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Ayana",
  description: "Ayana is an AI persona for your nightclub that handles bookings and guest inquiries.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <TopNav user={user} />
        {children}
      </body>
    </html>
  );
}
