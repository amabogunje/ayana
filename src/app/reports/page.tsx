import Link from "next/link";
import { Download } from "lucide-react";
import { requirePlatformUser } from "@/lib/auth";
import {
  formatReportTimestamp,
  listOperationalReport,
  listReportVenues,
  listTranscriptReport,
} from "@/lib/reports";

function buildDownloadHref(
  path: string,
  filters: {
    venue?: string;
    start?: string;
    end?: string;
  },
) {
  const params = new URLSearchParams();
  if (filters.venue) params.set("venue", filters.venue);
  if (filters.start) params.set("start", filters.start);
  if (filters.end) params.set("end", filters.end);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function buildPageHref(input: {
  venue?: string;
  start?: string;
  end?: string;
  opPage?: number;
  trPage?: number;
  opSize?: string;
  trSize?: string;
}) {
  const params = new URLSearchParams();
  if (input.venue) params.set("venue", input.venue);
  if (input.start) params.set("start", input.start);
  if (input.end) params.set("end", input.end);
  if (input.opPage && input.opPage > 1) params.set("opPage", String(input.opPage));
  if (input.trPage && input.trPage > 1) params.set("trPage", String(input.trPage));
  if (input.opSize && input.opSize !== "10") params.set("opSize", input.opSize);
  if (input.trSize && input.trSize !== "10") params.set("trSize", input.trSize);
  const query = params.toString();
  return query ? `/reports?${query}` : "/reports";
}

function formatCountLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function normalizePageSize(value?: string) {
  if (value === "5" || value === "10" || value === "25" || value === "all") {
    return value;
  }
  return "10";
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    venue?: string;
    start?: string;
    end?: string;
    opPage?: string;
    trPage?: string;
    opSize?: string;
    trSize?: string;
  }>;
}) {
  await requirePlatformUser();
  const params = (await searchParams) ?? {};
  const selectedVenue = params.venue ?? "";
  const startDate = params.start ?? "";
  const endDate = params.end ?? "";
  const operationalPage = Math.max(1, Number.parseInt(params.opPage ?? "1", 10) || 1);
  const transcriptPage = Math.max(1, Number.parseInt(params.trPage ?? "1", 10) || 1);
  const operationalSize = normalizePageSize(params.opSize);
  const transcriptSize = normalizePageSize(params.trSize);

  const [venues, activity, transcripts] = await Promise.all([
    listReportVenues(),
    listOperationalReport(
      {
        venueSlug: selectedVenue || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      },
      {
        page: operationalPage,
        pageSize: operationalSize === "all" ? -1 : Number.parseInt(operationalSize, 10),
      },
    ),
    listTranscriptReport(
      {
        venueSlug: selectedVenue || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      },
      {
        page: transcriptPage,
        pageSize: transcriptSize === "all" ? -1 : Number.parseInt(transcriptSize, 10),
      },
    ),
  ]);

  const operationalDownloadHref = buildDownloadHref("/api/reports/operational", {
    venue: selectedVenue || undefined,
    start: startDate || undefined,
    end: endDate || undefined,
  });
  const transcriptDownloadHref = buildDownloadHref("/api/reports/transcripts", {
    venue: selectedVenue || undefined,
    start: startDate || undefined,
    end: endDate || undefined,
  });

  return (
    <main className="admin-page">
      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel panel-compact">
          <div className="panel-header">
            <div>
              <span className="panel-label">Filters</span>
              <h2>Reports</h2>
            </div>
          </div>

          <form method="get" className="entity-form">
            <div className="report-filter-grid">
              <label className="field">
                <span>Venue</span>
                <select name="venue" className="select-input" defaultValue={selectedVenue}>
                  <option value="">All venues</option>
                  {venues.map((venue) => (
                    <option key={venue.id} value={venue.slug}>
                      {venue.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Start date</span>
                <input type="date" name="start" defaultValue={startDate} />
              </label>

              <label className="field">
                <span>End date</span>
                <input type="date" name="end" defaultValue={endDate} />
              </label>

              <div className="report-filter-actions">
                <button type="submit" className="button button-primary">
                  Apply filters
                </button>
                <Link href="/reports" className="button button-secondary">
                  Clear
                </Link>
              </div>
            </div>
          </form>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Transcript history</span>
              <h2>Booking transcripts</h2>
              <p className="panel-meta">
                {formatCountLabel(transcripts.totalCount, "row", "rows")}
              </p>
            </div>
            <div className="panel-actions">
              <Link href={transcriptDownloadHref} className="button button-secondary">
                <Download size={16} />
                <span>Download CSV</span>
              </Link>
            </div>
          </div>

          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>Guest</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Last message</th>
                </tr>
              </thead>
              <tbody>
                {transcripts.items.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No transcripts found for this filter range.</td>
                  </tr>
                ) : (
                  transcripts.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.venue.name}</td>
                      <td>{item.guestName}</td>
                      <td>{item.channel}</td>
                      <td>{item.status}</td>
                      <td>{formatReportTimestamp(item.requestedAt)}</td>
                      <td>{item.messages[0]?.content ?? "No guest message stored"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="report-pagination">
            <div className="time-range-picker" aria-label="Transcript history page size">
              {["5", "10", "25", "all"].map((size) => (
                <Link
                  key={size}
                  href={buildPageHref({
                    venue: selectedVenue || undefined,
                    start: startDate || undefined,
                    end: endDate || undefined,
                    opPage: operationalPage,
                    trPage: 1,
                    opSize: operationalSize,
                    trSize: size,
                  })}
                  className={`time-range-link ${transcriptSize === size ? "active" : ""}`}
                >
                  {size === "all" ? "All" : size}
                </Link>
              ))}
            </div>
            <Link
              href={buildPageHref({
                venue: selectedVenue || undefined,
                start: startDate || undefined,
                end: endDate || undefined,
                opPage: operationalPage,
                trPage: Math.max(1, transcripts.page - 1),
                opSize: operationalSize,
                trSize: transcriptSize,
              })}
              className={`button button-secondary ${transcripts.page === 1 ? "button-disabled" : ""}`}
              aria-disabled={transcripts.page === 1}
              tabIndex={transcripts.page === 1 ? -1 : undefined}
            >
              Previous
            </Link>
            <span className="panel-meta">
              Page {transcripts.page} of {transcripts.totalPages}
            </span>
            <Link
              href={buildPageHref({
                venue: selectedVenue || undefined,
                start: startDate || undefined,
                end: endDate || undefined,
                opPage: operationalPage,
                trPage: Math.min(transcripts.totalPages, transcripts.page + 1),
                opSize: operationalSize,
                trSize: transcriptSize,
              })}
              className={`button button-secondary ${transcripts.page === transcripts.totalPages ? "button-disabled" : ""}`}
              aria-disabled={transcripts.page === transcripts.totalPages}
              tabIndex={transcripts.page === transcripts.totalPages ? -1 : undefined}
            >
              Next
            </Link>
          </div>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Operational history</span>
              <h2>Recent activity</h2>
              <p className="panel-meta">
                {formatCountLabel(activity.totalCount, "row", "rows")}
              </p>
            </div>
            <div className="panel-actions">
              <Link href={operationalDownloadHref} className="button button-secondary">
                <Download size={16} />
                <span>Download CSV</span>
              </Link>
            </div>
          </div>

          <div className="detail-list">
            {activity.items.length === 0 ? (
              <div className="detail-row">
                <span>No activity found for this filter range.</span>
                <strong>System</strong>
              </div>
            ) : (
              activity.items.map((item) => (
                <div key={item.id} className="detail-row detail-row-audit">
                  <div className="detail-row-copy">
                    <span>{item.summary}</span>
                    <small>
                      {item.actor?.fullName ?? "System"}
                      {item.venue?.name ? ` · ${item.venue.name}` : ""}
                    </small>
                  </div>
                  <strong>{formatReportTimestamp(item.createdAt)}</strong>
                </div>
              ))
            )}
          </div>

          <div className="report-pagination">
            <div className="time-range-picker" aria-label="Operational history page size">
              {["5", "10", "25", "all"].map((size) => (
                <Link
                  key={size}
                  href={buildPageHref({
                    venue: selectedVenue || undefined,
                    start: startDate || undefined,
                    end: endDate || undefined,
                    opPage: 1,
                    trPage: transcriptPage,
                    opSize: size,
                    trSize: transcriptSize,
                  })}
                  className={`time-range-link ${operationalSize === size ? "active" : ""}`}
                >
                  {size === "all" ? "All" : size}
                </Link>
              ))}
            </div>
            <Link
              href={buildPageHref({
                venue: selectedVenue || undefined,
                start: startDate || undefined,
                end: endDate || undefined,
                opPage: Math.max(1, activity.page - 1),
                trPage: transcriptPage,
                opSize: operationalSize,
                trSize: transcriptSize,
              })}
              className={`button button-secondary ${activity.page === 1 ? "button-disabled" : ""}`}
              aria-disabled={activity.page === 1}
              tabIndex={activity.page === 1 ? -1 : undefined}
            >
              Previous
            </Link>
            <span className="panel-meta">
              Page {activity.page} of {activity.totalPages}
            </span>
            <Link
              href={buildPageHref({
                venue: selectedVenue || undefined,
                start: startDate || undefined,
                end: endDate || undefined,
                opPage: Math.min(activity.totalPages, activity.page + 1),
                trPage: transcriptPage,
                opSize: operationalSize,
                trSize: transcriptSize,
              })}
              className={`button button-secondary ${activity.page === activity.totalPages ? "button-disabled" : ""}`}
              aria-disabled={activity.page === activity.totalPages}
              tabIndex={activity.page === activity.totalPages ? -1 : undefined}
            >
              Next
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}
