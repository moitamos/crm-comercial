import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "CRM Comercial",
  description: "Gestão comercial de clientes, serviços e oportunidades.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-PT"><body>{children}</body></html>;
}
