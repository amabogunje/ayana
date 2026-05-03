import { OperatorNav } from "@/components/operator-nav";
import { getCurrentOperatorUser } from "@/lib/operator-auth";

export default async function OperatorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentOperatorUser();

  return (
    <div className="operator-app-shell">
      {user ? <OperatorNav user={user} /> : null}
      {children}
    </div>
  );
}
