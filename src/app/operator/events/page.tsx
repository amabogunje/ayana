import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Repeat2,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { createOperatorEventAction, updateOperatorEventAction } from "@/app/operator/actions";
import { requireOperatorUser } from "@/lib/operator-auth";
import { listOperatorEventOverrides, listOperatorEventSeries } from "@/lib/operator-service";
import type { OperatorEventOverride, OperatorEventSeries } from "@/lib/operator-types";

const recurringDayOptions = [
  { value: "SUN", label: "Sun" },
  { value: "MON", label: "Mon" },
  { value: "TUE", label: "Tue" },
  { value: "WED", label: "Wed" },
  { value: "THU", label: "Thu" },
  { value: "FRI", label: "Fri" },
  { value: "SAT", label: "Sat" },
];

const weekdayByIndex = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

type CalendarEvent = {
  id: string;
  href: string;
  title: string;
  tone: "single" | "recurring" | "cancelled";
  flyerUrl?: string | null;
};

function dateKeyFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayKey() {
  return dateKeyFromDate(new Date());
}

function parseMonth(value?: string) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : todayKey().slice(0, 7);
}

function dateFromKey(value: string) {
  return new Date(`${value}T00:00:00`);
}

function addMonths(monthKey: string, offset: number) {
  const date = dateFromKey(`${monthKey}-01`);
  date.setMonth(date.getMonth() + offset);
  return dateKeyFromDate(date).slice(0, 7);
}

function monthLabel(monthKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(dateFromKey(`${monthKey}-01`));
}

function monthHref(monthKey: string) {
  return `/operator/events?month=${monthKey}`;
}

function eventsHref(input: { month?: string; drawer?: "new" | "detail"; event?: string }) {
  const params = new URLSearchParams();
  if (input.month && input.month !== todayKey().slice(0, 7)) params.set("month", input.month);
  if (input.drawer) params.set("drawer", input.drawer);
  if (input.event) params.set("event", input.event);
  const query = params.toString();
  return query ? `/operator/events?${query}` : "/operator/events";
}

function buildCalendarDays(monthKey: string) {
  const firstOfMonth = dateFromKey(`${monthKey}-01`);
  const firstGridDay = new Date(firstOfMonth);
  firstGridDay.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstGridDay);
    date.setDate(firstGridDay.getDate() + index);
    return {
      date,
      key: dateKeyFromDate(date),
      inMonth: dateKeyFromDate(date).startsWith(monthKey),
    };
  });
}

function seriesOccursOnDate(series: OperatorEventSeries, date: Date, key: string) {
  if (!series.active) return false;
  if (series.startDate && key < series.startDate) return false;
  if (series.endDate && key > series.endDate) return false;
  return series.recurringDays.includes(weekdayByIndex[date.getDay()]);
}

function eventsForDate(
  key: string,
  date: Date,
  series: OperatorEventSeries[],
  overrides: OperatorEventOverride[],
): CalendarEvent[] {
  const dateOverrides = overrides.filter((item) => item.occurrenceDate === key && item.active);
  const cancelledSeriesIds = new Set(
    dateOverrides
      .filter((item) => item.isCancelled && item.eventSeriesId)
      .map((item) => item.eventSeriesId as string),
  );
  const recurringEvents = series
    .filter((item) => !cancelledSeriesIds.has(item.id) && seriesOccursOnDate(item, date, key))
    .map((item) => ({
      id: `series-${item.id}`,
      href: eventsHref({ month: key.slice(0, 7), drawer: "detail", event: `series:${item.id}` }),
      title: item.title,
      tone: "recurring" as const,
      flyerUrl: item.flyer?.publicUrl,
    }));
  const singleEvents = dateOverrides.map((item) => ({
    id: `override-${item.id}`,
    href: eventsHref({ month: key.slice(0, 7), drawer: "detail", event: `override:${item.id}` }),
    title: item.isCancelled ? `${item.title ?? item.eventSeriesTitle ?? "Event"} cancelled` : item.title ?? item.eventSeriesTitle ?? "Special event",
    tone: item.isCancelled ? ("cancelled" as const) : ("single" as const),
    flyerUrl: item.flyer?.publicUrl,
  }));

  return [...singleEvents, ...recurringEvents].slice(0, 4);
}

function CreateEventDrawer({
  closeHref,
  defaultEventDate,
  error,
}: {
  closeHref: string;
  defaultEventDate: string;
  error: string;
}) {
  return (
    <section className="operator-inbox-drawer-shell" aria-label="Create event drawer">
      <Link href={closeHref} className="operator-inbox-drawer-scrim" aria-label="Close event drawer" />
      <aside className="operator-inbox-drawer operator-event-drawer">
        <div className="operator-drawer-head">
          <div>
            <span className="operator-drawer-avatar tone-tonight">
              <CalendarPlus size={22} aria-hidden="true" />
            </span>
            <span>
              <strong>Create Event</strong>
              <small>Single event by default, recurring when needed.</small>
            </span>
          </div>
          <Link href={closeHref} aria-label="Close drawer">
            <X size={20} aria-hidden="true" />
          </Link>
        </div>

        {error ? <div className="operator-drawer-error">{error}</div> : null}

        <form action={createOperatorEventAction} className="operator-event-form" encType="multipart/form-data">
          <label className="span-2">
            <span>Event title</span>
            <input name="title" placeholder="Ladies' Night or Special Guest DJ" required />
          </label>

          <label className="span-2">
            <span>Description</span>
            <textarea name="description" rows={3} placeholder="Short context for staff and guest replies." />
          </label>

          <label>
            <span>Event date</span>
            <input name="eventDate" type="date" required defaultValue={defaultEventDate} />
          </label>

          <label>
            <span>Flyer</span>
            <input name="flyerFile" type="file" accept=".pdf,image/*" />
          </label>

          <label className="span-2 operator-event-recurring-toggle">
            <span>
              <strong>Make this recurring</strong>
              <small>Use this for weekly nights that repeat on selected weekdays.</small>
            </span>
            <input type="checkbox" name="isRecurring" />
          </label>

          <div className="span-2 operator-event-days" aria-label="Recurring weekdays">
            <span>Recurring weekdays</span>
            <div>
              {recurringDayOptions.map((day) => (
                <label key={day.value}>
                  <input type="checkbox" name="recurringDays" value={day.value} />
                  <span>{day.label}</span>
                </label>
              ))}
            </div>
          </div>

          <label>
            <span>Start date</span>
            <input name="startDate" type="date" defaultValue={defaultEventDate} />
          </label>

          <label>
            <span>End date</span>
            <input name="endDate" type="date" />
          </label>

          <div className="operator-reservation-form-actions">
            <Link href={closeHref} className="operator-secondary-action">Cancel</Link>
            <button type="submit" className="operator-primary-action">
              <CalendarPlus size={17} aria-hidden="true" />
              Save Event
            </button>
          </div>
        </form>
      </aside>
    </section>
  );
}

function EventDetailDrawer({
  closeHref,
  event,
  eventType,
  monthKey,
  error,
}: {
  closeHref: string;
  event: OperatorEventSeries | OperatorEventOverride;
  eventType: "series" | "override";
  monthKey: string;
  error: string;
}) {
  const isSeries = eventType === "series";
  const series = isSeries ? event as OperatorEventSeries : null;
  const override = !isSeries ? event as OperatorEventOverride : null;
  const title = series?.title ?? override?.title ?? override?.eventSeriesTitle ?? "Special event";
  const description = series?.description ?? override?.description ?? "";
  const flyer = series?.flyer ?? override?.flyer;
  const isCancelled = override?.isCancelled ?? false;

  return (
    <section className="operator-inbox-drawer-shell" aria-label="Event detail drawer">
      <Link href={closeHref} className="operator-inbox-drawer-scrim" aria-label="Close event detail" />
      <aside className="operator-inbox-drawer operator-event-drawer">
        <div className="operator-drawer-head">
          <div>
            <span className="operator-drawer-avatar tone-tonight">
              {isSeries ? <Repeat2 size={22} aria-hidden="true" /> : <CalendarDays size={22} aria-hidden="true" />}
            </span>
            <span>
              <strong>{title}</strong>
              <small>{isSeries ? "Recurring event series" : "Single calendar event"}</small>
            </span>
          </div>
          <Link href={closeHref} aria-label="Close drawer">
            <X size={20} aria-hidden="true" />
          </Link>
        </div>

        {error ? <div className="operator-drawer-error">{error}</div> : null}
        {isSeries ? (
          <div className="operator-event-edit-note">Changes apply to every occurrence in this recurring series.</div>
        ) : null}

        <form action={updateOperatorEventAction} className="operator-event-form" encType="multipart/form-data">
          <input type="hidden" name="eventType" value={eventType} />
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="month" value={monthKey} />

          <label className="span-2">
            <span>Event title</span>
            <input name="title" required defaultValue={title} />
          </label>

          <label className="span-2">
            <span>Description</span>
            <textarea name="description" rows={3} defaultValue={description ?? ""} />
          </label>

          {isSeries ? (
            <>
              <div className="span-2 operator-event-days" aria-label="Recurring weekdays">
                <span>Recurring weekdays</span>
                <div>
                  {recurringDayOptions.map((day) => (
                    <label key={day.value}>
                      <input
                        type="checkbox"
                        name="recurringDays"
                        value={day.value}
                        defaultChecked={series?.recurringDays.includes(day.value)}
                      />
                      <span>{day.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label>
                <span>Start date</span>
                <input name="startDate" type="date" defaultValue={series?.startDate ?? ""} />
              </label>

              <label>
                <span>End date</span>
                <input name="endDate" type="date" defaultValue={series?.endDate ?? ""} />
              </label>
            </>
          ) : (
            <>
              <label>
                <span>Event date</span>
                <input name="occurrenceDate" type="date" required defaultValue={override?.occurrenceDate ?? ""} />
              </label>

              <label className="operator-event-cancel-toggle">
                <span>
                  <strong>Cancelled</strong>
                  <small>Mark this event as cancelled on the calendar.</small>
                </span>
                <input type="checkbox" name="isCancelled" defaultChecked={isCancelled} />
              </label>
            </>
          )}

          <label className="span-2">
            <span>{flyer ? "Replace flyer" : "Flyer"}</span>
            <input name="flyerFile" type="file" accept=".pdf,image/*" />
          </label>

          {flyer ? (
            <a className="operator-event-existing-flyer span-2" href={flyer.publicUrl} target="_blank" rel="noreferrer">
              Current flyer: {flyer.fileName}
            </a>
          ) : null}

          <label className="span-2 operator-event-cancel-toggle">
            <span>
              <strong>Show on calendar</strong>
              <small>Turn this off to hide the event without deleting it.</small>
            </span>
            <input type="checkbox" name="active" defaultChecked={event.active} />
          </label>

          <div className="operator-reservation-form-actions">
            <Link href={closeHref} className="operator-secondary-action">Cancel</Link>
            <button type="submit" className="operator-primary-action">
              Save Changes
            </button>
          </div>
        </form>
      </aside>
    </section>
  );
}

export default async function OperatorEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; month?: string; drawer?: string; event?: string }>;
}) {
  const user = await requireOperatorUser();
  const params = await searchParams;
  const monthKey = parseMonth(params.month);
  const [series, overrides] = await Promise.all([
    listOperatorEventSeries(user.venueId),
    listOperatorEventOverrides(user.venueId),
  ]);
  const activeSeries = series.filter((item) => item.active);
  const activeOverrides = overrides.filter((item) => item.active && !item.isCancelled);
  const cancelledOverrides = overrides.filter((item) => item.isCancelled);
  const flyerCount = [...series, ...overrides].filter((item) => item.flyer).length;
  const days = buildCalendarDays(monthKey);
  const currentMonth = todayKey().slice(0, 7);
  const defaultEventDate = monthKey === currentMonth ? todayKey() : `${monthKey}-01`;
  const closeHref = eventsHref({ month: monthKey });
  const showDrawer = params.drawer === "new";
  const [selectedEventType, selectedEventId] = String(params.event ?? "").split(":") as ["series" | "override" | undefined, string | undefined];
  const selectedEvent =
    params.drawer === "detail" && selectedEventType === "series"
      ? series.find((item) => item.id === selectedEventId)
      : params.drawer === "detail" && selectedEventType === "override"
        ? overrides.find((item) => item.id === selectedEventId)
        : null;

  return (
    <main className="operator-dashboard-page operator-events-page">
      <section className="operator-dashboard-header">
        <div>
          <h1>Events</h1>
          <p>Plan single events and weekly nights from one calendar.</p>
        </div>
        <Link href={eventsHref({ month: monthKey, drawer: "new" })} className="operator-primary-action">
          <CalendarPlus size={18} aria-hidden="true" />
          <span>Create Event</span>
        </Link>
      </section>

      {params.saved === "series" ? <div className="operator-inline-success">Recurring event saved.</div> : null}
      {params.saved === "override" ? <div className="operator-inline-success">Event saved.</div> : null}
      {params.error && !showDrawer ? <div className="operator-drawer-error">{params.error}</div> : null}

      <section className="operator-event-stat-grid" aria-label="Event metrics">
        <article>
          <Repeat2 size={20} aria-hidden="true" />
          <span>
            <strong>{activeSeries.length}</strong>
            <small>Recurring nights</small>
          </span>
        </article>
        <article>
          <CalendarDays size={20} aria-hidden="true" />
          <span>
            <strong>{activeOverrides.length}</strong>
            <small>Single events</small>
          </span>
        </article>
        <article>
          <XCircle size={20} aria-hidden="true" />
          <span>
            <strong>{cancelledOverrides.length}</strong>
            <small>Cancelled exceptions</small>
          </span>
        </article>
        <article>
          <ImageIcon size={20} aria-hidden="true" />
          <span>
            <strong>{flyerCount}</strong>
            <small>Flyers uploaded</small>
          </span>
        </article>
      </section>

      <section className="operator-events-calendar-layout">
        <article className="operator-dashboard-panel operator-event-calendar-panel">
          <div className="operator-event-calendar-head">
            <div>
              <span className="operator-panel-kicker">
                <CalendarDays size={16} aria-hidden="true" />
                Calendar
              </span>
              <h2>{monthLabel(monthKey)}</h2>
            </div>
            <div className="operator-event-month-controls">
              <Link href={monthHref(addMonths(monthKey, -1))} aria-label="Previous month">
                <ChevronLeft size={18} aria-hidden="true" />
              </Link>
              <Link href="/operator/events">Today</Link>
              <Link href={monthHref(addMonths(monthKey, 1))} aria-label="Next month">
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="operator-event-calendar-grid" aria-label={`${monthLabel(monthKey)} event calendar`}>
            {recurringDayOptions.map((day) => (
              <span key={day.value} className="operator-event-weekday">
                {day.label}
              </span>
            ))}

            {days.map((day) => {
              const dayEvents = eventsForDate(day.key, day.date, series, overrides);

              return (
                <div
                  key={day.key}
                  className={`operator-event-calendar-day ${day.inMonth ? "" : "is-outside"} ${day.key === todayKey() ? "is-today" : ""}`}
                >
                  <strong>{day.date.getDate()}</strong>
                  <div>
                    {dayEvents.length === 0 ? (
                      <span className="operator-event-calendar-empty">No events</span>
                    ) : (
                      dayEvents.map((event) => (
                        <Link key={event.id} href={event.href} className={`operator-event-calendar-chip tone-${event.tone}`}>
                          {event.flyerUrl ? <ImageIcon size={12} aria-hidden="true" /> : null}
                          {event.title}
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      {showDrawer ? <CreateEventDrawer closeHref={closeHref} defaultEventDate={defaultEventDate} error={String(params.error ?? "")} /> : null}
      {selectedEvent && (selectedEventType === "series" || selectedEventType === "override") ? (
        <EventDetailDrawer
          closeHref={closeHref}
          event={selectedEvent}
          eventType={selectedEventType}
          monthKey={monthKey}
          error={String(params.error ?? "")}
        />
      ) : null}
    </main>
  );
}
