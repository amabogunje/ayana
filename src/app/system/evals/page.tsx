import Link from "next/link";
import { requirePlatformUser } from "@/lib/auth";
import { getLatestChatEvalReport } from "@/lib/chat-evals/report";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function scoreTone(score: number) {
  if (score >= 90) return "success";
  if (score >= 75) return "warning";
  return "danger";
}

export default async function SystemEvalsPage() {
  await requirePlatformUser();
  const report = await getLatestChatEvalReport();

  return (
    <main className="admin-page">
      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">System QA</span>
              <h2>Website chat evals</h2>
            </div>
            <Link href="/settings" className="button button-secondary">
              Back to settings
            </Link>
          </div>

          {report ? (
            <>
              <div className="stats-grid" style={{ marginTop: 18 }}>
                <div className="stat-card">
                  <span className="panel-label">Last run</span>
                  <strong>{formatTimestamp(report.generatedAt)}</strong>
                  <small>{report.mode === "openai" ? "OpenAI guest/judge mode" : "Scripted eval mode"}</small>
                </div>
                <div className="stat-card">
                  <span className="panel-label">Venue</span>
                  <strong>{report.venueName}</strong>
                  <small>Latest deployment report target</small>
                </div>
                <div className="stat-card">
                  <span className="panel-label">Passed</span>
                  <strong>
                    {report.passCount}/{report.scenarioCount}
                  </strong>
                  <small>Scenario pass count</small>
                </div>
                <div className="stat-card">
                  <span className="panel-label">Average score</span>
                  <strong>{report.averageScore}</strong>
                  <small>Deterministic eval score</small>
                </div>
              </div>

              <div style={{ display: "grid", gap: 18, marginTop: 22 }}>
                {report.results.map((result) => (
                  <article key={result.scenarioId} className="panel" style={{ margin: 0 }}>
                    <div className="panel-header">
                      <div>
                        <span className="panel-label">{result.scenarioId}</span>
                        <h3 style={{ margin: "6px 0 0", fontSize: "1.1rem" }}>{result.title}</h3>
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span className={`status-chip ${result.passed ? "success" : "warning"}`}>
                          {result.passed ? "Passing" : "Needs tuning"}
                        </span>
                        <span className={`status-chip ${scoreTone(result.score)}`}>Score {result.score}</span>
                      </div>
                    </div>

                    <p className="form-helper" style={{ marginTop: 0 }}>{result.summary}</p>

                    <div className="detail-list">
                      {result.checks.map((check) => (
                        <div key={check.name} className="detail-row">
                          <div className="detail-row-copy">
                            <strong>{check.name}</strong>
                            <small>{check.detail}</small>
                          </div>
                          <span className={`status-chip ${check.passed ? "success" : "danger"}`}>
                            {check.passed ? "Pass" : "Fail"}
                          </span>
                        </div>
                      ))}
                    </div>

                    {result.llmJudge ? (
                      <div className="detail-list" style={{ marginTop: 16 }}>
                        <div className="detail-row">
                          <div className="detail-row-copy">
                            <strong>LLM judge feedback</strong>
                            <small>{result.llmJudge.feedback}</small>
                          </div>
                          <span className={`status-chip ${scoreTone(result.llmJudge.score)}`}>
                            Judge {result.llmJudge.score}
                          </span>
                        </div>
                      </div>
                    ) : null}

                    <details style={{ marginTop: 18 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700 }}>View transcript</summary>
                      <div className="table-shell" style={{ marginTop: 14 }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Role</th>
                              <th>Message</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.transcript.map((message, index) => (
                              <tr key={`${result.scenarioId}-${index}`}>
                                <td style={{ whiteSpace: "nowrap", textTransform: "capitalize" }}>{message.authorRole}</td>
                                <td>{message.content}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <p className="form-helper" style={{ marginTop: 18 }}>
              No chat eval report is available yet. Run the deployment-safe website chat eval generator to create one.
            </p>
          )}
        </article>
      </section>
    </main>
  );
}
