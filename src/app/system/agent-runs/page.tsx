import Link from "next/link";
import { requirePlatformUser } from "@/lib/auth";
import { listAgentRunInspection } from "@/lib/agent/agent-run-inspection-service";

function formatTimestamp(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatDuration(value: number | null) {
  if (value === null) return "n/a";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function statusTone(status: string) {
  if (status === "COMPLETED") return "success";
  if (status === "FAILED") return "danger";
  if (status === "SKIPPED") return "warning";
  return "neutral";
}

export default async function SystemAgentRunsPage({
  searchParams,
}: {
  searchParams: Promise<{
    venueId?: string;
    inquiryId?: string;
    status?: string;
    window?: string;
  }>;
}) {
  await requirePlatformUser();
  const params = await searchParams;
  const inspection = await listAgentRunInspection(params);

  return (
    <main className="admin-page">
      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Agent observability</span>
              <h2>Agent runs</h2>
            </div>
            <div className="action-row">
              <Link href="/system/evals" className="button button-secondary">
                System evals
              </Link>
              <Link href="/settings" className="button button-secondary">
                Back to settings
              </Link>
            </div>
          </div>

          <form className="agent-runs-filter-grid" action="/system/agent-runs">
            <label className="field">
              <span>Venue</span>
              <select name="venueId" defaultValue={inspection.filters.venueId}>
                <option value="">All venues</option>
                {inspection.venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Status</span>
              <select name="status" defaultValue={inspection.filters.status}>
                <option value="">All statuses</option>
                <option value="STARTED">Started</option>
                <option value="COMPLETED">Completed</option>
                <option value="FAILED">Failed</option>
                <option value="SKIPPED">Skipped</option>
              </select>
            </label>

            <label className="field">
              <span>Recent window</span>
              <select name="window" defaultValue={inspection.filters.window}>
                <option value="1h">Last hour</option>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
            </label>

            <label className="field">
              <span>Inquiry ID</span>
              <input name="inquiryId" defaultValue={inspection.filters.inquiryId} placeholder="Optional inquiry id" />
            </label>

            <button className="button button-primary" type="submit">
              Apply filters
            </button>
          </form>

          <div className="stats-grid" style={{ marginTop: 18 }}>
            {inspection.statusCounts.map((item) => (
              <div key={item.status} className="stat-card">
                <span className="panel-label">{item.status.toLowerCase()}</span>
                <strong>{item.count}</strong>
                <small>Runs in selected time window</small>
              </div>
            ))}
          </div>

          <div className="agent-run-list">
            {inspection.runs.length > 0 ? (
              inspection.runs.map((run) => (
                <article key={run.id} className="panel agent-run-card">
                  <div className="agent-run-card-head">
                    <div>
                      <span className="panel-label">{run.channel} / {run.source}</span>
                      <h3>{run.venue.name}</h3>
                      <p>
                        {run.inquiry ? (
                          <>
                            Inquiry <code>{run.inquiry.id}</code> for {run.inquiry.guestName}
                          </>
                        ) : (
                          "No inquiry linked"
                        )}
                      </p>
                    </div>
                    <div className="agent-run-status-stack">
                      <span className={`status-chip ${statusTone(run.status)}`}>{run.status}</span>
                      <small>{formatTimestamp(run.startedAt)}</small>
                    </div>
                  </div>

                  <div className="agent-run-meta-grid">
                    <div>
                      <span>Model</span>
                      <strong>{run.model ?? "n/a"}</strong>
                    </div>
                    <div>
                      <span>Intent</span>
                      <strong>{run.intent ?? "n/a"}</strong>
                    </div>
                    <div>
                      <span>Objective</span>
                      <strong>{run.objective ?? "n/a"}</strong>
                    </div>
                    <div>
                      <span>Mode</span>
                      <strong>{run.conversationMode ?? "n/a"}</strong>
                    </div>
                    <div>
                      <span>Confidence</span>
                      <strong>{run.confidence === null ? "n/a" : `${Math.round(run.confidence * 100)}%`}</strong>
                    </div>
                    <div>
                      <span>Duration</span>
                      <strong>{formatDuration(run.durationMs)}</strong>
                    </div>
                  </div>

                  <div className="detail-list">
                    <div className="detail-row">
                      <div className="detail-row-copy">
                        <strong>Final action</strong>
                        <small>{run.finalAction ?? "No final action recorded."}</small>
                      </div>
                    </div>
                    <div className="detail-row">
                      <div className="detail-row-copy">
                        <strong>Result summary</strong>
                        <small>{run.resultSummary ?? "No result summary recorded."}</small>
                      </div>
                    </div>
                    {run.errorMessage ? (
                      <div className="detail-row">
                        <div className="detail-row-copy">
                          <strong>Error</strong>
                          <small>{run.errorMessage}</small>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="agent-run-link-row">
                    <Link href={`/venues/${run.venue.slug}`} className="button button-secondary">
                      Venue
                    </Link>
                    {run.inquiry ? (
                      <Link href={`/system/agent-runs?inquiryId=${run.inquiry.id}&window=30d`} className="button button-secondary">
                        Filter inquiry runs
                      </Link>
                    ) : null}
                  </div>

                  <details className="agent-tool-details" open={run.status === "FAILED"}>
                    <summary>Tool calls ({run.toolCalls.length})</summary>
                    <div className="table-shell" style={{ marginTop: 14 }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Tool</th>
                            <th>Status</th>
                            <th>Input summary</th>
                            <th>Output summary</th>
                            <th>Error</th>
                            <th>Duration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.toolCalls.map((toolCall) => (
                            <tr key={toolCall.id}>
                              <td>{toolCall.toolName}</td>
                              <td>
                                <span className={`status-chip ${statusTone(toolCall.status)}`}>{toolCall.status}</span>
                              </td>
                              <td>{toolCall.inputSummary ?? "n/a"}</td>
                              <td>{toolCall.outputSummary ?? "n/a"}</td>
                              <td>{toolCall.errorMessage ?? "n/a"}</td>
                              <td>{formatDuration(toolCall.durationMs)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </article>
              ))
            ) : (
              <p className="form-helper" style={{ marginTop: 18 }}>
                No agent runs match these filters.
              </p>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
