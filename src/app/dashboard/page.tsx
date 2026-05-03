import Link from "next/link";
import { AlertTriangle, BarChart3, MessageSquareText, Sparkles } from "lucide-react";
import { requirePlatformUser } from "@/lib/auth";
import { type DashboardTimeRange, getAdminOverview } from "@/lib/admin-service";

const timeRanges: Array<{ value: DashboardTimeRange; label: string }> = [
  { value: "7d", label: "7D" },
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "ytd", label: "YTD" },
  { value: "1y", label: "1Y" },
  { value: "max", label: "Max" },
];

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string }>;
}) {
  await requirePlatformUser();
  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedRange = resolvedSearchParams.range;
  const timeRange = timeRanges.some((item) => item.value === requestedRange)
    ? (requestedRange as DashboardTimeRange)
    : "1m";

  const overview = await getAdminOverview(timeRange);
  const { kpis, portfolio, timeRange: activeRange, timeRangeLabel, venues, flags } = overview;

  return (
    <main className="admin-page">
      <section className="page-toolbar">
        <div className="page-toolbar-range">
          <div className="time-range-picker" aria-label="Dashboard time range">
            {timeRanges.map((item) => (
              <Link
                key={item.value}
                href={item.value === "1m" ? "/dashboard" : `/dashboard?range=${item.value}`}
                className={`time-range-link ${activeRange === item.value ? "active" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <p className="page-toolbar-copy">Viewing platform metrics for {timeRangeLabel.toLowerCase()}.</p>
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel panel-compact">
          <div className="panel-header">
            <div>
              <span className="panel-label">Platform snapshot</span>
              <h2>Key KPIs</h2>
            </div>
            <Sparkles size={18} className="icon-muted" />
          </div>

          <div className="stat-grid stat-grid-bar">
            {kpis.map((item) => (
              <article key={item.label} className="stat-card stat-card-bar">
                <p>{item.label}</p>
                <strong>{item.value}</strong>
                <span>{item.detail}</span>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Portfolio performance</span>
              <h2>Venue performance overview</h2>
            </div>
            <div className="panel-actions">
              <Link href="/analytics" className="text-link">
                View analytics
              </Link>
              <BarChart3 size={18} className="icon-muted" />
            </div>
          </div>

          <div className="chart-card">
            {portfolio.length === 0 ? (
              <div className="chart-placeholder" aria-label="No data available">
                <div className="chart-placeholder-watermark">NO DATA AVAILABLE</div>
                <div className="chart-placeholder-graphic">
                  <span className="placeholder-bar placeholder-bar-slate" />
                  <span className="placeholder-bar placeholder-bar-blue" />
                  <span className="placeholder-bar placeholder-bar-gold" />
                  <span className="placeholder-bar placeholder-bar-green" />
                </div>
              </div>
            ) : (
              <>
                <div className="chart-bars chart-bars-four">
                  {portfolio.map((point) => (
                    <div key={point.label} className="chart-group">
                      <div className="bar-stack">
                        <span className="bar bar-slate" style={{ height: `${point.inquiries}%` }} />
                        <span className="bar bar-blue" style={{ height: `${point.confirmed}%` }} />
                        <span className="bar bar-gold" style={{ height: `${point.deposit}%` }} />
                        <span className="bar bar-green" style={{ height: `${point.revenue}%` }} />
                      </div>
                      <p>{point.label}</p>
                    </div>
                  ))}
                </div>

                <div className="legend-row">
                  <span>
                    <i className="legend-dot legend-slate" />
                    Inquiries
                  </span>
                  <span>
                    <i className="legend-dot legend-blue" />
                    Confirmed bookings
                  </span>
                  <span>
                    <i className="legend-dot legend-gold" />
                    Deposit conversion
                  </span>
                  <span>
                    <i className="legend-dot legend-green" />
                    Estimated booked revenue
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>Inquiries</th>
                  <th>Confirmed</th>
                  <th>Deposit conversion</th>
                  <th>Booked revenue</th>
                  <th>Status</th>
                  <th>AI state</th>
                </tr>
              </thead>
              <tbody>
                {venues.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No venue data yet. Create a venue or load demo data from Venues.</td>
                  </tr>
                ) : (
                  venues.map((venue) => (
                    <tr key={venue.name}>
                      <td>{venue.name}</td>
                      <td>{venue.inquiries}</td>
                      <td>{venue.confirmed}</td>
                      <td>{venue.depositConversion}</td>
                      <td>{venue.bookedRevenue}</td>
                      <td>
                        <span className={`status-chip ${venue.statusTone}`}>{venue.status}</span>
                      </td>
                      <td>{venue.aiState}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Open alerts</span>
              <h2>Needs review now</h2>
            </div>
            <div className="panel-actions">
              <Link href="/alerts" className="text-link">
                View all alerts
              </Link>
              <AlertTriangle size={18} className="icon-muted" />
            </div>
          </div>

          <div className="thread-stack">
            {flags.length === 0 ? (
              <article className="thread-card">
                <h3>No open alerts</h3>
                <p>The system is not currently surfacing any operational issues that need review.</p>
              </article>
            ) : (
              flags.slice(0, 6).map((thread) => (
                <article key={thread.id} className="thread-card">
                  <div className="thread-meta">
                    <span className={`status-chip ${thread.tone}`}>{thread.flag}</span>
                    <span>{thread.venue}</span>
                  </div>
                  <h3>{thread.guest}</h3>
                  <p>{thread.summary}</p>
                  <div className="thread-footer">
                    <span>
                      <MessageSquareText size={14} />
                      {thread.channel}
                    </span>
                    <span>{thread.updatedAt}</span>
                  </div>
                </article>
              ))
            )}
          </div>

        </article>
      </section>
    </main>
  );
}
