import {
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  MoreVertical,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { createOperatorStaffReservationAction } from "@/app/operator/actions";
import { OperatorDateScroller } from "@/components/operator-date-scroller";
import { requireOperatorUser } from "@/lib/operator-auth";
import { listOperatorReservations, listOperatorTableOptions } from "@/lib/operator-service";
import type { OperatorReservationItem, OperatorTableOption } from "@/lib/operator-types";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function dateKeyFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayKey() {
  return dateKeyFromDate(new Date());
}

function parseDateKey(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayKey();
}

function dateFromKey(value: string) {
  return new Date(`${value}T00:00:00`);
}

function addDays(value: string, days: number) {
  const date = dateFromKey(value);
  date.setDate(date.getDate() + days);
  return dateKeyFromDate(date);
}

function formatDateTitle(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dateFromKey(value));
}

function displayDateLabel(label: string) {
  const normalized = label.toLowerCase().trim();
  if (!normalized || normalized.includes("not provided")) return "No date selected";
  if (normalized === "tonight" || normalized === "2026-04-25" || normalized.includes("apr 25") || normalized.includes("april 25")) {
    return "Sat, Apr 25";
  }

  return label
    .replace("Saturday, ", "Sat, ")
    .replace("Sunday, ", "Sun, ")
    .replace("Monday, ", "Mon, ")
    .replace("Tuesday, ", "Tue, ")
    .replace("Wednesday, ", "Wed, ")
    .replace("Thursday, ", "Thu, ")
    .replace("Friday, ", "Fri, ")
    .replace(", 2026", "");
}

function reservationDateKey(reservation: OperatorReservationItem) {
  const label = reservation.requestedDateLabel.toLowerCase().trim();
  if (label === "2026-04-25" || label === "tonight" || label.includes("apr 25") || label.includes("april 25")) {
    return "2026-04-25";
  }

  const isoMatch = label.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return isoMatch[0];

  const parsed = Date.parse(reservation.requestedDateLabel.replace(" at ", " "));
  return Number.isNaN(parsed) ? "" : dateKeyFromDate(new Date(parsed));
}

function splitRequestedDate(label: string) {
  const [datePart = label, timePart = ""] = label.split(" at ");
  return {
    date: displayDateLabel(datePart),
    time: timePart || "TBD",
  };
}

function tableAreaLabel(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("vip")) return "VIP";
  if (lower.includes("high")) return "High Tops";
  if (lower.includes("main")) return "Main Floor";
  if (lower.includes("floor")) return "Main Floor";
  return "Other Tables";
}

function isConfirmed(reservation: OperatorReservationItem) {
  return reservation.status === "CONFIRMED";
}

function matchesSearch(reservation: OperatorReservationItem, query: string) {
  if (!query) return true;
  const haystack = [
    reservation.guestName,
    reservation.arrivalTimeLabel,
    reservation.tableOptionName,
    reservation.confirmationCode,
    reservation.requestedDateLabel,
    reservation.sourceName,
    "confirmed",
  ].join(" ").toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function buildReservationsHref(input: {
  q?: string;
  hide?: string[];
  drawer?: "new";
  date?: string;
}) {
  const params = new URLSearchParams();
  if (input.q) params.set("q", input.q);
  if (input.hide?.length) params.set("hide", input.hide.join(","));
  if (input.drawer) params.set("drawer", input.drawer);
  if (input.date && input.date !== todayKey()) params.set("date", input.date);
  const query = params.toString();
  return query ? `/operator/reservations?${query}` : "/operator/reservations";
}

function ReservationSection({
  title,
  subtitle,
  items,
  hidden,
  toggleHref,
}: {
  title: string;
  subtitle: string;
  items: OperatorReservationItem[];
  hidden: boolean;
  toggleHref: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className="operator-reservation-list-section tone-confirmed">
      <div className="operator-board-section-head">
        <Link href={toggleHref}>
          <CheckCircle2 size={20} aria-hidden="true" />
          <span>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </span>
          <em>{items.length}</em>
          <ChevronDown className={hidden ? "is-collapsed" : ""} size={17} aria-hidden="true" />
        </Link>
      </div>

      {!hidden ? (
        <div className="operator-board-list">
          {items.map((reservation) => {
            const date = splitRequestedDate(reservation.requestedDateLabel);

            return (
              <Link
                key={reservation.id}
                href={`/operator/inbox/${reservation.inquiryId}`}
                className="operator-reservation-list-row status-confirmed"
              >
                <span className="operator-reservation-timeblock">
                  <strong>{reservation.arrivalTimeLabel || date.time}</strong>
                  <small>{date.date}</small>
                </span>
                <span className="operator-reservation-guest">
                  <strong>{reservation.guestName}</strong>
                  <small>Source: {reservation.sourceName}</small>
                </span>
                <span>{tableAreaLabel(reservation.tableOptionName)}</span>
                <span>{reservation.tableOptionName}</span>
                <span className="operator-board-status status-confirmed">Confirmed</span>
                <span className="operator-board-money">
                  <strong>{formatCurrency(reservation.depositPaidCents)}</strong>
                  <small>{reservation.depositPaidCents > 0 ? "Deposit collected" : "No deposit recorded"}</small>
                </span>
                <span className="operator-board-action">View</span>
                <MoreVertical size={18} aria-hidden="true" className="operator-board-menu" />
              </Link>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function NewReservationDrawer({
  tableOptions,
  closeHref,
  error,
  selectedDate,
}: {
  tableOptions: OperatorTableOption[];
  closeHref: string;
  error: string;
  selectedDate: string;
}) {
  return (
    <section className="operator-inbox-drawer-shell" aria-label="Create reservation drawer">
      <Link href={closeHref} className="operator-inbox-drawer-scrim" aria-label="Close reservation drawer" />
      <aside className="operator-inbox-drawer operator-reservation-drawer">
        <div className="operator-drawer-head">
          <div>
            <span className="operator-drawer-avatar tone-tonight">
              <CalendarPlus size={22} aria-hidden="true" />
            </span>
            <span>
              <strong>New Reservation</strong>
              <small>Manual staff-created booking.</small>
            </span>
          </div>
          <Link href={closeHref} aria-label="Close drawer">
            <X size={20} aria-hidden="true" />
          </Link>
        </div>

        {error ? <div className="operator-drawer-error">{error}</div> : null}

        <form action={createOperatorStaffReservationAction} className="operator-reservation-form">
          <input type="hidden" name="returnDate" value={selectedDate} />
          <label>
            <span>Guest name</span>
            <input name="guestName" required placeholder="Guest name" />
          </label>

          <label>
            <span>Phone</span>
            <input name="phone" placeholder="Optional" />
          </label>

          <label>
            <span>Date</span>
            <input name="requestedDate" required type="date" defaultValue={selectedDate} />
          </label>

          <label>
            <span>Arrival time</span>
            <input name="arrivalTime" required type="time" />
          </label>

          <label>
            <span>Party size</span>
            <input name="partySize" required type="number" min="1" defaultValue="2" />
          </label>

          <label>
            <span>Table</span>
            <select name="tableOptionId" required>
              <option value="">Select table</option>
              {tableOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} / {option.capacityMin}-{option.capacityMax} guests / {formatCurrency(option.depositAmountCents)} deposit
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Deposit collected</span>
            <input name="depositPaidDollars" type="number" min="0" step="1" placeholder="Optional" />
          </label>

          <label className="span-2">
            <span>Notes</span>
            <textarea name="notes" rows={4} placeholder="Optional host notes" />
          </label>

          <div className="operator-reservation-form-actions">
            <Link href={closeHref} className="operator-secondary-action">Cancel</Link>
            <button type="submit" className="operator-primary-action">Create Reservation</button>
          </div>
        </form>
      </aside>
    </section>
  );
}

export default async function OperatorReservationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; hide?: string; drawer?: string; error?: string; date?: string }>;
}) {
  const user = await requireOperatorUser();
  const params = (await searchParams) ?? {};
  const query = String(params.q ?? "").trim();
  const selectedDate = parseDateKey(params.date);
  const hide = String(params.hide ?? "").split(",").filter(Boolean);
  const showDrawer = params.drawer === "new";
  const error = String(params.error ?? "");
  const [allReservations, tableOptions] = await Promise.all([
    listOperatorReservations(user.venueId),
    listOperatorTableOptions(user.venueId),
  ]);
  const reservations = allReservations.filter(isConfirmed);
  const selectedDateReservations = reservations.filter((reservation) => reservationDateKey(reservation) === selectedDate);
  const visibleReservations = selectedDateReservations.filter((reservation) => matchesSearch(reservation, query));
  const collectedDepositCents = selectedDateReservations.reduce((total, reservation) => total + reservation.depositPaidCents, 0);
  const sectionedTonight = Array.from(
    visibleReservations.reduce((groups, reservation) => {
      const key = tableAreaLabel(reservation.tableOptionName);
      const current = groups.get(key) ?? [];
      current.push(reservation);
      groups.set(key, current);
      return groups;
    }, new Map<string, OperatorReservationItem[]>()),
  );
  const closeHref = buildReservationsHref({ q: query, hide, date: selectedDate });

  function toggleHide(section: string) {
    const nextHide = hide.includes(section) ? hide.filter((item) => item !== section) : [...hide, section];
    return buildReservationsHref({ q: query, hide: nextHide, date: selectedDate });
  }

  return (
    <main className="operator-dashboard-page operator-board-page">
      <section className="operator-board-header">
        <div>
          <h1>Table Reservations</h1>
          <p>Confirmed bookings for tables the venue team needs to honor and operate.</p>
        </div>
        <div className="operator-reservation-header-actions">
          <Link href={buildReservationsHref({ q: query, hide, drawer: "new", date: selectedDate })} className="operator-primary-action">
            <CalendarPlus size={18} aria-hidden="true" />
            New Reservation
          </Link>
        </div>
      </section>

      <section className="operator-reservation-topbar">
        <OperatorDateScroller
          selectedDate={selectedDate}
          label={formatDateTitle(selectedDate)}
          previousHref={buildReservationsHref({ q: query, hide, date: addDays(selectedDate, -1) })}
          nextHref={buildReservationsHref({ q: query, hide, date: addDays(selectedDate, 1) })}
          todayHref={buildReservationsHref({ q: query, hide, date: todayKey() })}
          query={query}
          hide={hide}
        />

        <section className="operator-reservation-stat-row" aria-label="Reservation stats">
          <div>
            <small>Total Reservations</small>
            <strong>{selectedDateReservations.length}</strong>
          </div>
          <div>
            <small>Deposits Collected</small>
            <strong>{formatCurrency(collectedDepositCents)}</strong>
          </div>
        </section>
      </section>

      <section className="operator-board-tools">
        <form action="/operator/reservations">
          <label>
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search reservations</span>
            <input name="q" defaultValue={query} placeholder="Search by guest, table, or confirmation code..." />
          </label>
          {selectedDate !== todayKey() ? <input type="hidden" name="date" value={selectedDate} /> : null}
          <button type="submit">Search</button>
        </form>
      </section>

      <div className="operator-board-stack">
        {visibleReservations.length === 0 ? (
          <div className="operator-empty-state">No confirmed reservations match this search.</div>
        ) : (
          <>
            {sectionedTonight.map(([area, items]) => (
              <ReservationSection
                key={area}
                title={area}
                subtitle={`${items.length} confirmed reservation${items.length === 1 ? "" : "s"} for ${formatDateTitle(selectedDate)}.`}
                items={items}
                hidden={hide.includes(area)}
                toggleHref={toggleHide(area)}
              />
            ))}
          </>
        )}
      </div>

      {showDrawer ? (
        <NewReservationDrawer tableOptions={tableOptions} closeHref={closeHref} error={error} selectedDate={selectedDate} />
      ) : null}
    </main>
  );
}
