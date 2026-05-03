import { Martini } from "lucide-react";
import { acceptOperatorInviteAction } from "./actions";

function errorMessage(error?: string) {
  if (!error) return null;
  if (error === "password-match") return "Passwords must match.";
  return decodeURIComponent(error);
}

export default async function OperatorInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const action = acceptOperatorInviteAction.bind(null, token);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="operator-venue-mark">
          <Martini size={22} strokeWidth={1.8} />
        </span>
        <span className="eyebrow">Venue Staff Invite</span>
        <h1>Create your operator account</h1>
        <p>Set a password to join your venue workspace.</p>

        <form action={action} className="auth-form">
          <label className="field">
            <span>Password</span>
            <input name="password" type="password" minLength={8} required />
          </label>
          <label className="field">
            <span>Confirm password</span>
            <input name="confirmPassword" type="password" minLength={8} required />
          </label>

          {errorMessage(error) ? <p className="form-error">{errorMessage(error)}</p> : null}

          <button type="submit" className="button button-primary auth-submit">
            Join workspace
          </button>
        </form>
      </section>
    </main>
  );
}
