import { OperatorSettingsForm } from "@/components/operator-settings-form";
import { requireOperatorUser } from "@/lib/operator-auth";
import { hasOperatorPermission } from "@/lib/operator-permissions";
import { getOperatorVenueSettings } from "@/lib/operator-service";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function OperatorSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; drawer?: string; tab?: string }>;
}) {
  const user = await requireOperatorUser();
  if (!hasOperatorPermission(user.role, "settings:read")) {
    redirect("/operator");
  }
  const params = await searchParams;
  const settings = await getOperatorVenueSettings(user.venueId);

  if (!settings) {
    return null;
  }

  return (
    <main className="operator-dashboard-page operator-settings-page">
      <section className="operator-dashboard-header">
        <div>
          <h1>Settings</h1>
          <p>Manage venue details, guest-facing policies, menus, and channel setup.</p>
        </div>
        <div className="operator-agent-header-actions">
          {hasOperatorPermission(user.role, "ai:control") ? (
            <Link href="/operator/settings/agent" className="operator-secondary-action">
              AI agent settings
            </Link>
          ) : null}
          <div className="operator-settings-save-chip">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>All changes saved</span>
          </div>
        </div>
      </section>

      {params.saved === "website-chat" ? (
        <div className="operator-inline-success">Website chat snippet generated.</div>
      ) : null}
      {params.saved && params.saved !== "website-chat" ? (
        <div className="operator-inline-success">Venue settings saved.</div>
      ) : null}
      {params.error ? <div className="operator-drawer-error">{params.error}</div> : null}

      <OperatorSettingsForm
        settings={settings}
        initialSection={params.tab === "channels" || params.drawer === "website-chat" ? "channels" : "venue"}
      />
    </main>
  );
}
