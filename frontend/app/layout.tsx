import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Merchant Loan Tracker",
  description: "Apply for, price and review small-business loans.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
