import Link from "next/link";
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

export default async function AnalyticsPage({
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
  const { analytics, kpis, portfolio, timeRange: activeRange, timeRangeLabel } = overview;

  return (
    <main className="admin-page">
      <section className="page-toolbar">
        <div className="page-toolbar-range">
          <div className="time-range-picker" aria-label="Analytics time range">
            {timeRanges.map((item) => (
              <Link
                key={item.value}
                href={item.value === "1m" ? "/analytics" : `/analytics?range=${item.value}`}
                className={`time-range-link ${activeRange === item.value ? "active" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <p className="page-toolbar-copy">Viewing performance for {timeRangeLabel.toLowerCase()}.</p>
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel panel-compact">
          <div className="panel-header">
            <div>
              <span className="panel-label">Performance snapshot</span>
              <h2>Key KPIs</h2>
            </div>
          </div>

          <div className="stat-grid stat-grid-bar">
            {kpis.map((item) => (
              <article key={item.label} className="stat-card stat-card-bar">
                <p>{item.label}</p>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Trend view</span>
              <h2>Performance over time</h2>
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
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Performance table</span>
              <h2>Weekly breakdown</h2>
            </div>
          </div>

          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Inquiries</th>
                  <th>Confirmed</th>
                  <th>Deposit conversion</th>
                  <th>Booked revenue</th>
                  <th>Escalation rate</th>
                </tr>
              </thead>
              <tbody>
                {analytics.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No analytics yet for this time range.</td>
                  </tr>
                ) : (
                  analytics.map((row) => (
                    <tr key={row.week}>
                      <td>{row.week}</td>
                      <td>{row.inquiries}</td>
                      <td>{row.confirmed}</td>
                      <td>{row.depositConversion}</td>
                      <td>{row.bookedRevenue}</td>
                      <td>{row.escalationRate}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
