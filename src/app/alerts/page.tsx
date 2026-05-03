import Link from "next/link";
import { AlertPatternsPanel } from "@/components/alert-patterns-panel";
import { getAdminOverview } from "@/lib/admin-service";
import { requirePlatformUser } from "@/lib/auth";

function compactAlertSummary(summary: string, venue: string) {
  const normalizedVenue = venue.trim().toLowerCase();
  const normalizedSummary = summary.trim();

  if (normalizedSummary.toLowerCase().startsWith(normalizedVenue)) {
    return normalizedSummary.slice(venue.length).replace(/^['\s.-]+/, "").trim() || normalizedSummary;
  }

  return normalizedSummary;
}

export default async function AlertsPage() {
  await requirePlatformUser();
  const overview = await getAdminOverview();
  const openAlerts = overview.flags;
  const criticalAlerts = openAlerts.filter((item) => item.tone === "danger").length;
  const impactedVenues = new Set(openAlerts.map((item) => item.venue)).size;
  const patterns = overview.patterns;

  return (
    <main className="admin-page">
      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel panel-compact">
          <div className="panel-header">
            <div>
              <span className="panel-label">Alert snapshot</span>
              <h2>Key KPIs</h2>
            </div>
          </div>

          <div className="stat-grid stat-grid-bar">
            <article className="stat-card stat-card-bar">
              <p>Open alerts</p>
              <strong>{openAlerts.length}</strong>
            </article>
            <article className="stat-card stat-card-bar">
              <p>Critical alerts</p>
              <strong>{criticalAlerts}</strong>
            </article>
            <article className="stat-card stat-card-bar">
              <p>Venues impacted</p>
              <strong>{impactedVenues}</strong>
            </article>
            <article className="stat-card stat-card-bar">
              <p>Patterns detected</p>
              <strong>{patterns.length}</strong>
            </article>
          </div>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Patterns</span>
              <h2>Cross-venue signals</h2>
            </div>
          </div>

          <AlertPatternsPanel patterns={patterns} />
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Open alerts</span>
              <h2>Needs review now</h2>
            </div>
          </div>

          <div className="detail-list">
            {openAlerts.length === 0 ? (
              <div className="detail-row">
                <span>No open alerts</span>
                <strong>System</strong>
              </div>
            ) : (
              openAlerts.map((thread) => (
                <div key={thread.id} className="detail-row detail-row-alert">
                  <div className="detail-row-copy">
                    <div className="thread-meta">
                      <span className={`status-chip ${thread.tone}`}>{thread.flag}</span>
                      <span>{thread.updatedAt}</span>
                    </div>
                    <strong>{thread.guest}</strong>
                    <small>{compactAlertSummary(thread.summary, thread.venue)}</small>
                  </div>
                  <div className="alert-row-actions">
                    <span className="muted-inline">{thread.venue}</span>
                    {thread.venueSlug ? (
                      <Link href={`/venues/${thread.venueSlug}`} className="button button-secondary">
                        Go to venue
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
