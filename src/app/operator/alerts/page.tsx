import Link from "next/link";
import { requireOperatorUser } from "@/lib/operator-auth";
import { listOperatorAlerts, listOperatorWorkflowTasks } from "@/lib/operator-service";

export default async function OperatorAlertsPage() {
  const user = await requireOperatorUser();
  const [alerts, workflowTasks] = await Promise.all([
    listOperatorAlerts(user.venueId),
    listOperatorWorkflowTasks(user.venueId),
  ]);

  return (
    <main className="admin-page">
      <section className="page-intro operator-page-intro">
        <div>
          <span className="eyebrow">Alerts</span>
          <h1>Venue exceptions</h1>
          <p>Review escalations, low-confidence threads, and follow-up risks that need operator attention.</p>
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Alert queue</span>
              <h2>Open venue alerts</h2>
            </div>
          </div>

          <div className="detail-list">
            {alerts.length === 0 ? (
              <div className="detail-row">
                <span>No open alerts</span>
                <strong>System</strong>
              </div>
            ) : (
              alerts.map((alert) => (
                <div key={alert.id} className="detail-row detail-row-alert">
                  <div className="detail-row-copy">
                    <div className="thread-meta">
                      <span className={`status-chip ${alert.severity === "CRITICAL" ? "danger" : alert.severity === "WARNING" ? "warning" : "neutral"}`}>
                        {alert.severity}
                      </span>
                      <span>{alert.createdAt}</span>
                    </div>
                    <strong>{alert.title}</strong>
                    <small>{alert.description}</small>
                  </div>
                  {alert.inquiryId ? (
                    <Link href={`/operator/inbox/${alert.inquiryId}`} className="button button-secondary">
                      Open thread
                    </Link>
                  ) : (
                    <span className="muted-inline">Venue-level</span>
                  )}
                </div>
              ))
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Workflow tasks</span>
              <h2>Follow-up queue</h2>
            </div>
          </div>

          <div className="detail-list">
            {workflowTasks.length === 0 ? (
              <div className="detail-row">
                <span>No workflow tasks</span>
                <strong>System</strong>
              </div>
            ) : (
              workflowTasks.map((task) => (
                <div key={task.id} className="detail-row detail-row-alert">
                  <div className="detail-row-copy">
                    <div className="thread-meta">
                      <span
                        className={`status-chip ${
                          task.status === "FAILED"
                            ? "danger"
                            : task.status === "PENDING" || task.status === "PROCESSING"
                              ? "warning"
                              : "neutral"
                        }`}
                      >
                        {task.status}
                      </span>
                      <span>{task.scheduledFor}</span>
                      <span>{task.type}</span>
                    </div>
                    <strong>{task.description}</strong>
                    <small>
                      Attempts: {task.attempts}
                      {task.lastError ? ` · ${task.lastError}` : ""}
                    </small>
                  </div>
                  {task.inquiryId ? (
                    <Link href={`/operator/inbox/${task.inquiryId}`} className="button button-secondary">
                      Open thread
                    </Link>
                  ) : (
                    <span className="muted-inline">Venue-level</span>
                  )}
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
