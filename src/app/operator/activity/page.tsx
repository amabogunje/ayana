import { requireOperatorUser } from "@/lib/operator-auth";
import { listOperatorActivity } from "@/lib/operator-service";

export default async function OperatorActivityPage() {
  const user = await requireOperatorUser();
  const activity = await listOperatorActivity(user.venueId);

  return (
    <main className="admin-page">
      <section className="page-intro operator-page-intro">
        <div>
          <span className="eyebrow">Activity</span>
          <h1>Venue activity log</h1>
          <p>Track operator, system, and platform changes that affect live inquiries, reservations, and venue configuration.</p>
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Recent activity</span>
              <h2>Audit trail</h2>
            </div>
          </div>

          <div className="detail-list">
            {activity.length === 0 ? (
              <div className="detail-row">
                <span>No recorded activity yet</span>
                <strong>System</strong>
              </div>
            ) : (
              activity.map((item) => (
                <div key={item.id} className="detail-row detail-row-audit">
                  <div className="detail-row-copy">
                    <strong>{item.summary}</strong>
                    <small>
                      {item.actorName} · {item.actorType}
                    </small>
                  </div>
                  <strong>{item.createdAt}</strong>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
