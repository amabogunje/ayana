import { Mail, Sparkles } from "lucide-react";
import { requirePlatformUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const roleLabels: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  promoter: "Promoter",
  staff: "Staff",
};

type PilotLeadRow = {
  id: string;
  fullName: string;
  email: string;
  venueName: string;
  role: string;
  createdAt: Date | string | number;
};

function formatDate(date: Date | string | number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export default async function LeadsPage() {
  await requirePlatformUser();

  const leads = await prisma.$queryRaw<PilotLeadRow[]>`
    SELECT id, fullName, email, venueName, role, createdAt
    FROM PilotLead
    ORDER BY createdAt DESC
  `;

  return (
    <main className="admin-page">
      <section className="page-toolbar">
        <div>
          <span className="panel-label">Pilot pipeline</span>
          <h1>Incoming leads</h1>
          <p className="page-toolbar-copy">Review venue owners and operators who requested a 30-day Ayana pilot.</p>
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Landing page submissions</span>
              <h2>Lead requests</h2>
            </div>
            <div className="panel-actions">
              <span className="status-chip neutral">{leads.length} total</span>
              <Sparkles size={18} className="icon-muted" />
            </div>
          </div>

          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Company / venue</th>
                  <th>Role</th>
                  <th>Submitted</th>
                  <th>Follow up</th>
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No pilot leads yet. New submissions from the landing page will appear here.</td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead.id}>
                      <td>{lead.fullName}</td>
                      <td>{lead.email}</td>
                      <td>{lead.venueName}</td>
                      <td>
                        <span className="status-chip neutral">{roleLabels[lead.role] ?? lead.role}</span>
                      </td>
                      <td>{formatDate(lead.createdAt)}</td>
                      <td>
                        <a className="text-link" href={`mailto:${lead.email}`}>
                          <Mail size={14} />
                          Email
                        </a>
                      </td>
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
