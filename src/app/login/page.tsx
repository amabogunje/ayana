import { getLoginDefaults } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const defaults = await getLoginDefaults();

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="eyebrow">Platform Login</span>
        <h1>Sign in to Ayana</h1>
        <p>Use a platform owner or platform admin account to access onboarding and venue controls.</p>

        <form action="/api/auth/login" method="post" className="auth-form">
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" defaultValue={defaults.email} required />
          </label>

          <label className="field">
            <span>Password</span>
            <input name="password" type="password" defaultValue={defaults.password} required />
          </label>

          {params.error === "invalid" ? (
            <p className="form-error">The email or password did not match the platform owner account.</p>
          ) : null}

          <button type="submit" className="button button-primary auth-submit">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
