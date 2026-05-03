"use client";

import { useState } from "react";
import Link from "next/link";
import { PlusSquare, X } from "lucide-react";
import type { VenueListItem } from "@/lib/admin-service";
import { VenueOnboardingForm } from "@/components/venue-onboarding-form";

export function VenuesWorkspace({
  venues,
  error,
}: {
  venues: VenueListItem[];
  error?: string;
}) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(Boolean(error));
  const totalVenues = venues.length;
  const liveVenues = venues.filter((venue) => venue.status === "Active").length;
  const pilotVenues = venues.filter((venue) => venue.status === "Pilot").length;
  const venuesNeedingAttention = venues.filter(
    (venue) => Number.parseInt(venue.alertCount, 10) > 0 || venue.aiState !== "Live",
  ).length;

  return (
    <>
      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel panel-compact">
          <div className="panel-header">
            <div>
              <span className="panel-label">Venue snapshot</span>
              <h2>Key KPIs</h2>
            </div>
          </div>

          <div className="stat-grid stat-grid-bar">
            <article className="stat-card stat-card-bar">
              <p>Total venues</p>
              <strong>{totalVenues}</strong>
            </article>
            <article className="stat-card stat-card-bar">
              <p>Live venues</p>
              <strong>{liveVenues}</strong>
            </article>
            <article className="stat-card stat-card-bar">
              <p>Pilot venues</p>
              <strong>{pilotVenues}</strong>
            </article>
            <article className="stat-card stat-card-bar">
              <p>Need attention</p>
              <strong>{venuesNeedingAttention}</strong>
            </article>
          </div>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">All venues</span>
              <h2>Venue list</h2>
            </div>
            <div className="panel-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={() => setIsDrawerOpen(true)}
              >
                <PlusSquare size={16} />
                Create venue
              </button>
            </div>
          </div>

          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>Status</th>
                  <th>AI state</th>
                  <th>Channels</th>
                  <th>Attention</th>
                  <th>Last activity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {venues.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No venues yet. Use Create venue to onboard your first location.</td>
                  </tr>
                ) : (
                  venues.map((venue) => (
                    <tr key={venue.name}>
                      <td>{venue.name}</td>
                      <td>
                        <span className={`status-chip ${venue.statusTone}`}>{venue.status}</span>
                      </td>
                      <td>{venue.aiState}</td>
                      <td>{venue.channels}</td>
                      <td>
                        {Number.parseInt(venue.alertCount, 10) > 0 ? (
                          <span>{venue.alertCount} alert{venue.alertCount === "1" ? "" : "s"}</span>
                        ) : (
                          <span>No issues</span>
                        )}
                      </td>
                      <td>{venue.lastActivity}</td>
                      <td>
                        <Link href={`/venues/${venue.slug}`} className="text-link">
                          Edit venue
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {isDrawerOpen ? (
        <div className="drawer-scrim" role="presentation" onClick={() => setIsDrawerOpen(false)}>
          <aside
            className="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="venue-drawer-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-header">
              <div>
                <span className="panel-label">Onboard venue</span>
                <h2 id="venue-drawer-title">Create a new venue</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsDrawerOpen(false)}
                aria-label="Close venue drawer"
              >
                <X size={16} />
              </button>
            </div>

            <VenueOnboardingForm error={error} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
