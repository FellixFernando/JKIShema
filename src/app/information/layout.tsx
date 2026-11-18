import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Visi, Misi & Nilai Kehidupan | JKI Shema",
  description:
    "Visi Misi 2027-2031, Fokus Tahunan, Nilai-Nilai Kehidupan, dan Tujuan Akhir Gereja Jemaat Kristen Indonesia (JKI) Shema.",
};

export default function InformationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

