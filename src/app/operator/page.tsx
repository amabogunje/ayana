import {
  Calendar,
  CalendarPlus,
  ChartNoAxesColumnIncreasing,
  ChevronRight,
  CreditCard,
  Lock,
  MessageCircle,
  Send,
  Sparkles,
  Ticket,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { requireOperatorUser } from "@/lib/operator-auth";
import { getOperatorOverview } from "@/lib/operator-service";
import type { OperatorOverviewMetric } from "@/lib/operator-types";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatDashboardDate() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
}

const metricIcons: Record<OperatorOverviewMetric["tone"], React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  purple: MessageCircle,
  blue: Calendar,
  green: CreditCard,
  amber: ChartNoAxesColumnIncreasing,
  cyan: CreditCard,
};

const quickActionIcons = [CalendarPlus, UserRound, Lock, Send, Ticket];

export default async function OperatorOverviewPage() {
  const user = await requireOperatorUser();
  const overview = await getOperatorOverview(user.venueId);
  const maxDepositPoint = Math.max(...overview.depositOverview.points.map((point) => point.valueCents), 1);

  return (
    <main className="operator-dashboard-page">
      <section className="operator-dashboard-header">
        <div>
          <h1>{greeting()}</h1>
          <p>Here&apos;s what&apos;s happening at {user.venue.name} tonight.</p>
        </div>

        <div className="operator-dashboard-actions">
          <button className="operator-date-button" type="button">
            <Calendar size={18} aria-hidden="true" />
            <span>{formatDashboardDate()}</span>
          </button>
          <Link href="/operator/inbox" className="operator-primary-action">
            <CalendarPlus size={18} aria-hidden="true" />
            <span>New Reservation</span>
          </Link>
        </div>
      </section>

      <section className="operator-metric-grid" aria-label="Overview metrics">
        {overview.metrics.map((metric) => {
          const Icon = metricIcons[metric.tone];

          return (
            <article key={metric.label} className={`operator-metric-card tone-${metric.tone}`}>
              <span className="operator-metric-icon">
                <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
              </span>
              <div>
                <p>{metric.label}</p>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </div>
            </article>
          );
        })}
      </section>

      <section className="operator-dashboard-grid">
        <article className="operator-dashboard-panel operator-panel-reservations">
          <div className="operator-panel-header">
            <div>
              <span className="operator-panel-kicker">
                <Calendar size={16} aria-hidden="true" />
                Reservations Tonight
              </span>
            </div>
            <Link href="/operator/reservations" className="operator-panel-button">
              View all
            </Link>
          </div>

          <div className="operator-reservation-list">
            {overview.reservationsTonight.length === 0 ? (
              <div className="operator-empty-state">No reservations are on the board yet.</div>
            ) : (
              overview.reservationsTonight.map((reservation) => (
                <Link
                  key={reservation.id}
                  href={`/operator/inbox/${reservation.inquiryId}`}
                  className="operator-reservation-row"
                >
                  <span className="operator-reservation-time">
                    <strong>{reservation.timeLabel}</strong>
                  </span>
                  <span className="operator-reservation-main">
                    <strong>{reservation.guestName}</strong>
                    <small>
                      {reservation.tableLabel} &middot; {reservation.partySizeLabel}
                    </small>
                  </span>
                  <span className="operator-reservation-deposit">
                    <strong>{reservation.depositLabel}</strong>
                    <small className={`deposit-${reservation.depositStatusTone}`}>
                      {reservation.depositStatusLabel}
                    </small>
                  </span>
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              ))
            )}
          </div>

          <Link href="/operator/reservations" className="operator-panel-footer-link">
            View all reservations <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </article>

        <article className="operator-dashboard-panel operator-panel-deposits">
          <div className="operator-panel-header">
            <span className="operator-panel-kicker">
              <Sparkles size={16} aria-hidden="true" />
              Deposit Overview
            </span>
            <button className="operator-panel-button" type="button">
              {overview.depositOverview.periodLabel}
            </button>
          </div>

          <div className="operator-deposit-total">
            <strong>{formatCurrency(overview.depositOverview.totalCollectedCents)}</strong>
            <span>Collected deposits recorded in Ayana</span>
          </div>

          <div className="operator-deposit-chart" aria-label="Collected deposits by day">
            {overview.depositOverview.points.map((point) => (
              <div key={point.label} className="operator-deposit-bar-wrap">
                <div
                  className="operator-deposit-bar"
                  style={{ height: `${Math.max(8, Math.round((point.valueCents / maxDepositPoint) * 100))}%` }}
                  title={`${point.label}: ${formatCurrency(point.valueCents)}`}
                />
                <span>{point.label}</span>
              </div>
            ))}
          </div>

        </article>

        <article className="operator-dashboard-panel operator-panel-events">
          <div className="operator-panel-header">
            <span className="operator-panel-kicker">
              <Sparkles size={16} aria-hidden="true" />
              Upcoming Events
            </span>
            <Link href="/operator/events" className="operator-panel-button">
              View all
            </Link>
          </div>

          <div className="operator-event-list">
            {overview.upcomingEvents.length === 0 ? (
              <div className="operator-empty-state">Create events to show what is happening tonight.</div>
            ) : (
              overview.upcomingEvents.map((event) => (
                <Link key={event.id} href="/operator/events" className="operator-event-row">
                  <span className="operator-event-art">
                    {event.flyerUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={event.flyerUrl} alt="" />
                    ) : (
                      <Sparkles size={22} aria-hidden="true" />
                    )}
                  </span>
                  <span className="operator-event-date">{event.dateLabel}</span>
                  <span className="operator-event-copy">
                    <strong>{event.title}</strong>
                    <small>{event.timeLabel}</small>
                  </span>
                  <span className="operator-event-status">{event.statusLabel}</span>
                </Link>
              ))
            )}
          </div>

          <Link href="/operator/events" className="operator-panel-footer-link">
            Manage events <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </article>

        <article className="operator-dashboard-panel operator-panel-inbox">
          <div className="operator-panel-header">
            <span className="operator-panel-kicker">
              <MessageCircle size={16} aria-hidden="true" />
              Inbox
            </span>
            <Link href="/operator/inbox" className="operator-panel-button">
              View all
            </Link>
          </div>

          <div className="operator-inbox-preview-list">
            {overview.inboxPreview.length === 0 ? (
              <div className="operator-empty-state">No open inquiries right now.</div>
            ) : (
              overview.inboxPreview.map((item) => (
                <Link key={item.id} href={`/operator/inbox/${item.id}`} className="operator-inbox-preview-row">
                  <span className="operator-avatar">{item.guestName.slice(0, 1).toUpperCase()}</span>
                  <span>
                    <strong>{item.guestName}</strong>
                    <small>{item.lastMessage}</small>
                  </span>
                  <em>{item.updatedAt}</em>
                </Link>
              ))
            )}
          </div>

          <Link href="/operator/inbox" className="operator-panel-footer-link">
            Go to inbox <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </article>

        <article className="operator-dashboard-panel operator-panel-quick">
          <div className="operator-panel-header">
            <span className="operator-panel-kicker">
              <UsersRound size={16} aria-hidden="true" />
              Quick Actions
            </span>
          </div>

          <div className="operator-quick-grid">
            {overview.quickActions.map((action, index) => {
              const Icon = quickActionIcons[index] ?? Sparkles;

              return (
                <Link key={action.label} href={action.href} className={`operator-quick-action tone-${action.tone}`}>
                  <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
                  <span>{action.label}</span>
                </Link>
              );
            })}
          </div>
        </article>

      </section>
    </main>
  );
}
