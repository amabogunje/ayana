import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { VenueBusinessConfigurationForm } from "@/components/venue-business-configuration-form";
import { VenueInventoryPanel } from "@/components/venue-inventory-panel";
import { getVenueOnboarding } from "@/lib/admin-service";
import { requirePlatformUser } from "@/lib/auth";

export default async function VenueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePlatformUser();
  const { slug } = await params;
  const query = await searchParams;
  const onboarding = await getVenueOnboarding(slug);
  const venue = onboarding?.venue;

  if (!venue) {
    notFound();
  }

  return (
    <main className="admin-page">
      <section className="page-intro">
        <Link href="/venues" className="button button-secondary">
          <ArrowLeft size={16} />
          <span>Back to venues</span>
        </Link>

        <div className="page-intro-bar">
          <div>
            <h1>{venue.name}</h1>
          </div>
        </div>
      </section>

      {!onboarding.readyForPilot ? (
        <section className="readiness-bar">
          <div className="readiness-bar-copy">
            <span className="panel-label">Onboarding readiness</span>
            <strong>
              {onboarding.completedCount}/{onboarding.totalCount} complete
            </strong>
            <span className="status-chip warning">Not ready</span>
          </div>

          <div className="readiness-bar-progress">
            <span
              className="readiness-progress-fill"
              style={{ width: `${(onboarding.completedCount / onboarding.totalCount) * 100}%` }}
            />
          </div>

          <div className="readiness-workflow" role="list" aria-label="Onboarding workflow">
            {onboarding.checklist.map((item) => (
              <article key={item.label} className="readiness-step" role="listitem">
                <div className="readiness-step-topline">
                  <span className={`readiness-dot ${item.complete ? "complete" : "open"}`} />
                  <span className={`status-chip ${item.complete ? "success" : "warning"}`}>
                    {item.complete ? "Complete" : "Open"}
                  </span>
                </div>
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Venue setup</span>
              <h2>Business configuration</h2>
            </div>
          </div>

          <VenueBusinessConfigurationForm venue={venue} error={query.error} />
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <VenueInventoryPanel
          slug={venue.slug}
          tableOptions={venue.tableOptions}
          error={query.error === "missing-table-fields" ? query.error : undefined}
        />
      </section>
    </main>
  );
}
