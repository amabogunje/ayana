import { redirect } from "next/navigation";
import { OperatorLoginForm } from "@/components/operator-login-form";
import { getCurrentOperatorUser, getOperatorLoginDefaults } from "@/lib/operator-auth";

export default async function OperatorLoginPage() {
  const currentUser = await getCurrentOperatorUser();
  if (currentUser) {
    redirect("/operator");
  }

  const defaults = await getOperatorLoginDefaults();

  return (
    <main className="auth-page operator-auth-page">
      <section className="auth-card operator-auth-card">
        <span className="eyebrow">Ayana for Venues</span>
        <h1>Sign in to your venue dashboard</h1>
        <p>Manage guest conversations, reservations, and venue details from one place.</p>
        <OperatorLoginForm defaults={defaults} />
      </section>
    </main>
  );
}
