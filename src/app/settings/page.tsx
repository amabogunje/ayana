import {
  clearStripeSecretKeyAction,
  clearOpenAIKeyAction,
  createPlatformUserAction,
  saveOpenAIKeyAction,
  saveStripeSecretKeyAction,
} from "@/app/settings/actions";
import { listPlatformUsers, requirePlatformUser } from "@/lib/auth";
import {
  getPlatformConfig,
  getResolvedOpenAIApiKey,
  getResolvedStripeSecretKey,
  maskApiKey,
} from "@/lib/platform-config";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    error?: string;
    configSaved?: string;
    configCleared?: string;
    configError?: string;
    stripeConfigSaved?: string;
    stripeConfigCleared?: string;
    stripeConfigError?: string;
  }>;
}) {
  const user = await requirePlatformUser();
  const params = await searchParams;
  const users = await listPlatformUsers();
  const platformConfig = await getPlatformConfig();
  const configuredKey = getResolvedOpenAIApiKey(platformConfig.openAIApiKey);
  const isEnvFallback = !platformConfig.openAIApiKey && Boolean(process.env.OPENAI_API_KEY);
  const configuredStripeKey = getResolvedStripeSecretKey(platformConfig.stripeSecretKey);
  const isStripeEnvFallback = !platformConfig.stripeSecretKey && Boolean(process.env.STRIPE_SECRET_KEY);

  return (
    <main className="admin-page">
      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">LLM configuration</span>
              <h2>OpenAI API key</h2>
            </div>
          </div>

          <div className="detail-list" style={{ marginTop: 0 }}>
            <div className="detail-row">
              <div className="detail-row-copy">
                <strong>Current key</strong>
                <small>
                  {configuredKey
                    ? isEnvFallback
                      ? `${maskApiKey(configuredKey)} from environment`
                      : `${maskApiKey(configuredKey)} stored in platform settings`
                    : "No OpenAI API key configured yet"}
                </small>
              </div>
              <span className={`status-chip ${configuredKey ? "success" : "warning"}`}>
                {configuredKey ? "Configured" : "Missing"}
              </span>
            </div>
          </div>

          {user.role === "PLATFORM_OWNER" ? (
            <>
              <form action={saveOpenAIKeyAction} className="entity-form">
                <div className="form-grid">
                  <label className="field field-span-2">
                    <span>OpenAI API key</span>
                    <input
                      name="openAIApiKey"
                      type="password"
                      placeholder="sk-..."
                      defaultValue={platformConfig.openAIApiKey ?? ""}
                      autoComplete="off"
                    />
                  </label>
                </div>

                <p className="form-helper">
                  This key will be used for platform-managed LLM conversations across supported guest
                  channels.
                </p>

                <div className="action-row">
                  <button type="submit" className="button button-primary action-button">
                    Save OpenAI key
                  </button>
                </div>
              </form>

              {platformConfig.openAIApiKey ? (
                <form action={clearOpenAIKeyAction} className="inline-form">
                  <button type="submit" className="button button-secondary">
                    Clear stored key
                  </button>
                </form>
              ) : null}

              {params.configSaved ? <p className="form-success">OpenAI API key saved.</p> : null}
              {params.configCleared ? <p className="form-success">Stored OpenAI API key cleared.</p> : null}
              {params.configError === "forbidden" ? (
                <p className="form-error">Only platform owners can update the OpenAI API key.</p>
              ) : null}
              {params.configError === "missing-openai-key" ? (
                <p className="form-error">Enter an OpenAI API key before saving.</p>
              ) : null}
            </>
          ) : (
            <p className="form-helper" style={{ marginTop: 18 }}>
              Only platform owners can update the OpenAI API key.
            </p>
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Payment configuration</span>
              <h2>Stripe secret key</h2>
            </div>
          </div>

          <div className="detail-list" style={{ marginTop: 0 }}>
            <div className="detail-row">
              <div className="detail-row-copy">
                <strong>Current key</strong>
                <small>
                  {configuredStripeKey
                    ? isStripeEnvFallback
                      ? `${maskApiKey(configuredStripeKey)} from environment`
                      : `${maskApiKey(configuredStripeKey)} stored in platform settings`
                    : "No Stripe secret key configured yet"}
                </small>
              </div>
              <span className={`status-chip ${configuredStripeKey ? "success" : "warning"}`}>
                {configuredStripeKey ? "Configured" : "Missing"}
              </span>
            </div>
          </div>

          {user.role === "PLATFORM_OWNER" ? (
            <>
              <form action={saveStripeSecretKeyAction} className="entity-form">
                <div className="form-grid">
                  <label className="field field-span-2">
                    <span>Stripe secret key</span>
                    <input
                      name="stripeSecretKey"
                      type="password"
                      placeholder="sk_test_..."
                      defaultValue={platformConfig.stripeSecretKey ?? ""}
                      autoComplete="off"
                    />
                  </label>
                </div>

                <p className="form-helper">
                  This key is used to create deposit checkout links for website chat reservations.
                </p>

                <div className="action-row">
                  <button type="submit" className="button button-primary action-button">
                    Save Stripe key
                  </button>
                </div>
              </form>

              {platformConfig.stripeSecretKey ? (
                <form action={clearStripeSecretKeyAction} className="inline-form">
                  <button type="submit" className="button button-secondary">
                    Clear stored Stripe key
                  </button>
                </form>
              ) : null}

              {params.stripeConfigSaved ? <p className="form-success">Stripe secret key saved.</p> : null}
              {params.stripeConfigCleared ? <p className="form-success">Stored Stripe secret key cleared.</p> : null}
              {params.stripeConfigError === "forbidden" ? (
                <p className="form-error">Only platform owners can update the Stripe secret key.</p>
              ) : null}
              {params.stripeConfigError === "missing-stripe-key" ? (
                <p className="form-error">Enter a Stripe secret key before saving.</p>
              ) : null}
            </>
          ) : (
            <p className="form-helper" style={{ marginTop: 18 }}>
              Only platform owners can update the Stripe secret key.
            </p>
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Platform users</span>
              <h2>Accounts and roles</h2>
            </div>
          </div>

          {user.role === "PLATFORM_OWNER" ? (
            <form action={createPlatformUserAction} className="entity-form">
              <div className="form-grid">
                <label className="field">
                  <span>Full name</span>
                  <input name="fullName" required />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input name="email" type="email" required />
                </label>
                <label className="field">
                  <span>Role</span>
                  <select name="role" className="select-input" defaultValue="PLATFORM_ADMIN">
                    <option value="PLATFORM_ADMIN">Platform Admin</option>
                    <option value="PLATFORM_OWNER">Platform Owner</option>
                  </select>
                </label>
                <label className="field">
                  <span>Temporary password</span>
                  <input name="password" type="text" defaultValue="demo1234" required />
                </label>
              </div>

              <div className="action-row">
                <button type="submit" className="button button-primary action-button">
                  Create platform user
                </button>
              </div>

              {params.created ? <p className="form-success">Platform user created successfully.</p> : null}
              {params.error === "forbidden" ? (
                <p className="form-error">Only platform owners can create new users.</p>
              ) : null}
              {params.error === "missing-fields" ? (
                <p className="form-error">Complete all fields to create a platform user.</p>
              ) : null}
            </form>
          ) : null}

          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((platformUser) => (
                  <tr key={platformUser.id}>
                    <td>{platformUser.fullName}</td>
                    <td>{platformUser.email}</td>
                    <td>{platformUser.role === "PLATFORM_OWNER" ? "Platform Owner" : "Platform Admin"}</td>
                    <td>{platformUser.isActive ? "Active" : "Inactive"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
