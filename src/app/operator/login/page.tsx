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
    <main className="auth-page">
      <section className="auth-card">
        <span className="eyebrow">Venue Operator Login</span>
        <h1>Sign in to your venue workspace</h1>
        <p>Use a venue-scoped operator account to manage live inquiries, reservations, and venue settings.</p>
        <OperatorLoginForm defaults={defaults} />
      </section>
    </main>
  );
}
