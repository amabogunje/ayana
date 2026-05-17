import { OperatorAgentSettingsForm } from "@/components/operator-agent-settings-form";
import { requireOperatorUser } from "@/lib/operator-auth";
import { hasOperatorPermission } from "@/lib/operator-permissions";
import { getOperatorVenueAgentSettings } from "@/lib/operator-service";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function OperatorAgentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requireOperatorUser();
  if (!hasOperatorPermission(user.role, "ai:control")) {
    redirect("/operator");
  }

  const params = await searchParams;
  const settings = await getOperatorVenueAgentSettings(user.venueId);

  if (!settings) {
    return null;
  }

  return (
    <main className="operator-dashboard-page operator-settings-page operator-agent-settings-page">
      <section className="operator-dashboard-header">
        <div>
          <h1>AI Agent</h1>
          <p>Configure identity, autonomy, handoff rules, channels, and venue-specific operating notes.</p>
        </div>
        <div className="operator-agent-header-actions">
          <Link href="/operator/settings" className="operator-secondary-action">
            Back to settings
          </Link>
          <div className="operator-settings-save-chip">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>Shared runtime</span>
          </div>
        </div>
      </section>

      {params.saved === "reset" ? (
        <div className="operator-inline-success">AI agent settings reset to venue defaults.</div>
      ) : null}
      {params.saved && params.saved !== "reset" ? (
        <div className="operator-inline-success">AI agent settings saved.</div>
      ) : null}
      {params.error ? <div className="operator-drawer-error">{params.error}</div> : null}

      <OperatorAgentSettingsForm settings={settings} />
    </main>
  );
}
