import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/sidebar";
import { VerificationGate } from "@/components/dashboard/verification-gate";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1">
      <Sidebar />
      <main className="flex-1 p-6 lg:p-8">
        <VerificationGate>{children}</VerificationGate>
      </main>
    </div>
  );
}
