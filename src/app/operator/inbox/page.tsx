import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  CreditCard,
  MoreVertical,
  Phone,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { updateOperatorInquiryStatusAction } from "@/app/operator/actions";
import { OperatorContextMenu } from "@/components/operator-context-menu";
import { requireOperatorUser } from "@/lib/operator-auth";
import { getOperatorInquiry, listOperatorInbox } from "@/lib/operator-service";
import type { OperatorInboxItem, OperatorInquiryDetail } from "@/lib/operator-types";

type BoardTone = "attention" | "confirmed" | "tonight" | "upcoming" | "neutral";
type InboxFilter = "all" | "attention" | "deposits" | "confirmed";
type InboxContext = "tonight" | "next7" | "all";

const contextOptions: Array<{
  value: InboxContext;
  label: string;
  detail: string;
}> = [
  { value: "tonight", label: "Tonight", detail: "Sat, Apr 25" },
  { value: "next7", label: "Next 7 Days", detail: "Apr 25 - May 2" },
  { value: "all", label: "All", detail: "All active inquiries" },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function splitRequestedDate(label: string) {
  const [datePart = label, timePart = ""] = label.split(" at ");
  return {
    date: datePart
      .replace("Saturday, ", "Sat, ")
      .replace("Sunday, ", "Sun, ")
      .replace("Monday, ", "Mon, ")
      .replace("Tuesday, ", "Tue, ")
      .replace("Wednesday, ", "Wed, ")
      .replace("Thursday, ", "Thu, ")
      .replace("Friday, ", "Fri, "),
    time: timePart || "TBD",
  };
}

function groupDateLabel(label: string) {
  const normalized = label.toLowerCase().trim();
  if (!normalized || normalized.includes("not provided")) return "No date selected";
  if (normalized === "tonight" || normalized.includes("apr 25") || normalized.includes("april 25")) {
    return "Sat, April 25";
  }

  return splitRequestedDate(label).date;
}

function displayDateLabel(label: string) {
  const normalized = label.toLowerCase().trim();
  if (!normalized || normalized.includes("not provided")) return "No date selected";
  if (normalized === "tonight" || normalized === "2026-04-25" || normalized.includes("apr 25") || normalized.includes("april 25")) {
    return "Sat, Apr 25";
  }

  return splitRequestedDate(label).date;
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function channelLabel(channel: string) {
  return channel.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isAttention(item: OperatorInboxItem) {
  return item.isHumanTakeover;
}

function isConfirmed(item: OperatorInboxItem) {
  return item.reservationStatus === "CONFIRMED" || item.status === "CONFIRMED";
}

function isDepositPending(item: OperatorInboxItem) {
  return item.reservationStatus === "DEPOSIT_PENDING" || item.status === "DEPOSIT_SENT";
}

function isTonight(item: OperatorInboxItem) {
  const label = item.requestedDateLabel.toLowerCase();
  return label.includes("tonight") || label.includes("apr 25") || label.includes("april 25");
}

function isNextSevenDays(item: OperatorInboxItem) {
  const label = item.requestedDateLabel.toLowerCase();
  return (
    isTonight(item) ||
    label.includes("apr 26") ||
    label.includes("april 26") ||
    label.includes("apr 27") ||
    label.includes("april 27") ||
    label.includes("apr 28") ||
    label.includes("april 28") ||
    label.includes("apr 29") ||
    label.includes("april 29") ||
    label.includes("apr 30") ||
    label.includes("april 30") ||
    label.includes("may 1") ||
    label.includes("may 2")
  );
}

function itemMatchesContext(item: OperatorInboxItem, context: InboxContext) {
  if (context === "all") return true;
  if (context === "tonight") return isTonight(item);
  return isNextSevenDays(item);
}

function itemTone(item: OperatorInboxItem): BoardTone {
  if (isAttention(item)) return "attention";
  if (isTonight(item)) return "tonight";
  if (isConfirmed(item)) return "tonight";
  return "upcoming";
}

function actionText(item: OperatorInboxItem) {
  if (item.isHumanTakeover) return "Reply";
  if (isDepositPending(item)) return "Send deposit";
  return "View";
}

function statusText(item: OperatorInboxItem) {
  if (item.isHumanTakeover) return "Needs reply";
  if (isDepositPending(item)) return "Deposit pending";
  if (isConfirmed(item)) return "Confirmed";
  if (item.status === "NEW") return "New inquiry";
  if (item.status === "QUALIFYING") return "Qualifying";
  if (item.status === "QUOTED") return "Quoted";
  return "Open";
}

function statusTone(item: OperatorInboxItem) {
  if (item.isHumanTakeover) return "attention";
  if (isDepositPending(item)) return "deposit";
  if (isConfirmed(item)) return "confirmed";
  return "neutral";
}

function depositValue(item: OperatorInboxItem, detail?: OperatorInquiryDetail | null) {
  if (!detail?.reservation) return detail?.quoteOptions[0]?.tableOption.depositAmountCents ?? 0;
  if (isConfirmed(item)) return detail.reservation.depositPaidCents;
  return Math.max(0, detail.reservation.depositAmountCents - detail.reservation.depositPaidCents);
}

function depositRequired(detail?: OperatorInquiryDetail | null) {
  return detail?.reservation?.depositAmountCents ?? detail?.quoteOptions[0]?.tableOption.depositAmountCents ?? 0;
}

function tableLabel(detail?: OperatorInquiryDetail | null) {
  return detail?.reservation?.tableOption.name ?? detail?.quoteOptions[0]?.tableOption.name ?? "Table TBD";
}

function priority(item: OperatorInboxItem) {
  if (item.isHumanTakeover) return 0;
  if (isDepositPending(item)) return 1;
  if (isTonight(item)) return 2;
  if (isConfirmed(item)) return 3;
  return 4;
}

function buildInboxHref(input: {
  lead?: string;
  q?: string;
  filter?: InboxFilter;
  context?: InboxContext;
  hide?: string[];
}) {
  const params = new URLSearchParams();
  if (input.lead) params.set("lead", input.lead);
  if (input.q) params.set("q", input.q);
  if (input.filter && input.filter !== "all") params.set("filter", input.filter);
  if (input.context && input.context !== "tonight") params.set("context", input.context);
  if (input.hide?.length) params.set("hide", input.hide.join(","));
  const query = params.toString();
  return query ? `/operator/inbox?${query}` : "/operator/inbox";
}

function itemMatchesFilter(item: OperatorInboxItem, filter: InboxFilter) {
  if (filter === "all") return true;
  if (filter === "attention") return isAttention(item);
  if (filter === "deposits") return isDepositPending(item);
  return isConfirmed(item);
}

function itemMatchesSearch(item: OperatorInboxItem, detail: OperatorInquiryDetail | undefined, query: string) {
  if (!query) return true;
  const haystack = [
    item.guestName,
    item.channel,
    item.status,
    item.reservationStatus,
    item.requestedDateLabel,
    item.spendIntentLabel,
    item.lastMessage,
    statusText(item),
    tableLabel(detail),
  ].join(" ").toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function BoardSection({
  title,
  subtitle,
  tone,
  items,
  details,
  hidden,
  toggleHref,
  query,
  filter,
  context,
  hide,
  showActualDate = false,
}: {
  title: string;
  subtitle: string;
  tone: BoardTone;
  items: OperatorInboxItem[];
  details: Map<string, OperatorInquiryDetail>;
  hidden: boolean;
  toggleHref: string;
  query: string;
  filter: InboxFilter;
  context: InboxContext;
  hide: string[];
  showActualDate?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <section className={`operator-board-section tone-${tone}`}>
      <div className="operator-board-section-head">
        <Link href={toggleHref}>
          {tone === "attention" ? <AlertTriangle size={20} aria-hidden="true" /> : <CalendarDays size={20} aria-hidden="true" />}
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
          {items.map((item) => {
            const detail = details.get(item.id);
            const date = splitRequestedDate(item.requestedDateLabel);
            const depositCents = depositValue(item, detail);
            const itemBoardTone = tone === "neutral" ? "neutral" : itemTone(item);
            const itemStatusTone = statusTone(item);
            const showDepositFlag = item.isHumanTakeover && isDepositPending(item);

            return (
              <Link
                key={item.id}
                href={buildInboxHref({ lead: item.id, q: query, filter, context, hide })}
                className={`operator-board-row tone-${itemBoardTone} status-${itemStatusTone}`}
              >
                <span className="operator-board-avatar">{initials(item.guestName)}</span>
                <span className="operator-board-person">
                  <strong>{item.guestName}</strong>
                  <small>{item.partySize} guests / {date.time} / {tableLabel(detail)}</small>
                </span>
                <span className="operator-board-date">
                  {showActualDate ? displayDateLabel(item.requestedDateLabel) : isTonight(item) ? "Tonight" : date.date}
                </span>
                <span className="operator-board-status-stack">
                  <span className={`operator-board-status status-${itemStatusTone}`}>
                    {statusText(item)}
                  </span>
                  {showDepositFlag ? (
                    <span className="operator-board-status status-deposit">
                      Deposit pending
                    </span>
                  ) : null}
                </span>
                <span className="operator-board-money">
                  <strong>{depositCents ? formatCurrency(depositCents) : item.spendIntentLabel}</strong>
                  <small>{item.updatedAt}</small>
                </span>
                <span className="operator-board-action">{actionText(item)}</span>
                <MoreVertical size={18} aria-hidden="true" className="operator-board-menu" />
              </Link>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export default async function OperatorInboxPage({
  searchParams,
}: {
  searchParams?: Promise<{ lead?: string; q?: string; filter?: string; context?: string; hide?: string }>;
}) {
  const user = await requireOperatorUser();
  const params = (await searchParams) ?? {};
  const query = String(params.q ?? "").trim();
  const context: InboxContext = params.context === "next7" || params.context === "all" ? params.context : "tonight";
  const activeContext = contextOptions.find((option) => option.value === context) ?? contextOptions[0];
  const filter: InboxFilter =
    params.filter === "attention" || params.filter === "deposits" || params.filter === "confirmed"
      ? params.filter
      : "all";
  const hide = String(params.hide ?? "").split(",").filter(Boolean);
  const allInquiries = [...(await listOperatorInbox(user.venueId))].sort((a, b) => priority(a) - priority(b));
  const detailItems = await Promise.all(allInquiries.map((item) => getOperatorInquiry(user.venueId, item.id)));
  const details = new Map(
    detailItems
      .filter((detail): detail is OperatorInquiryDetail => Boolean(detail))
      .map((detail) => [detail.id, detail]),
  );

  const contextInquiries = allInquiries.filter((item) => itemMatchesContext(item, context));
  const visibleInquiries = contextInquiries.filter(
    (item) => itemMatchesFilter(item, filter) && itemMatchesSearch(item, details.get(item.id), query),
  );
  const selectedItem = params.lead ? allInquiries.find((item) => item.id === params.lead) : null;
  const selected = selectedItem ? details.get(selectedItem.id) ?? await getOperatorInquiry(user.venueId, selectedItem.id) : null;
  const selectedDate = selected ? splitRequestedDate(selected.requestedDateLabel) : null;
  const dueCents = selectedItem ? depositValue(selectedItem, selected) : 0;
  const requiredCents = depositRequired(selected);
  const isSecured = selectedItem ? isConfirmed(selectedItem) || (requiredCents > 0 && dueCents === 0) : false;

  const allAttention = contextInquiries.filter(isAttention);
  const allPending = contextInquiries.filter(isDepositPending);
  const allConfirmed = contextInquiries.filter(isConfirmed);
  const attention =
    context === "all"
      ? []
      : (context === "tonight" ? contextInquiries : contextInquiries)
        .filter(isAttention)
        .filter((item) => itemMatchesSearch(item, details.get(item.id), query))
        .filter((item) => filter === "all" || itemMatchesFilter(item, filter));
  const attentionIds = new Set(attention.map((item) => item.id));
  const remaining = visibleInquiries.filter((item) => !attentionIds.has(item.id));
  const tonight = context === "tonight" ? remaining.filter(isTonight) : [];
  const tonightConfirmed = tonight.filter(isConfirmed);
  const tonightPending = tonight.filter((item) => !isConfirmed(item));
  const remainingPendingCount = remaining.filter(isDepositPending).length;
  const remainingOtherCount = remaining.filter((item) => !isDepositPending(item) && !isConfirmed(item)).length;
  const groupedByDate = Array.from(
    remaining.reduce((groups, item) => {
      const key = groupDateLabel(item.requestedDateLabel);
      const current = groups.get(key) ?? [];
      current.push(item);
      groups.set(key, current);
      return groups;
    }, new Map<string, OperatorInboxItem[]>()),
  );
  const allInbox = context === "all" ? remaining : [];
  const depositAtRisk = allPending.reduce((total, item) => total + depositValue(item, details.get(item.id)), 0);
  const securedDeposits = allConfirmed.reduce((total, item) => total + depositValue(item, details.get(item.id)), 0);

  function toggleHide(section: string) {
    const nextHide = hide.includes(section) ? hide.filter((item) => item !== section) : [...hide, section];
    return buildInboxHref({ q: query, filter, context, hide: nextHide });
  }

  return (
    <main className={`operator-dashboard-page operator-board-page context-${context}`}>
      <section className="operator-board-header">
        <div>
          <h1>Inbox</h1>
          <p>Stay on top of every lead and reservation.</p>
        </div>
      </section>

      <section className="operator-board-glance">
        <OperatorContextMenu
          label={activeContext.label}
          detail={activeContext.detail}
          options={contextOptions.map((option) => ({
            href: buildInboxHref({ q: query, filter, context: option.value }),
            label: option.label,
            detail: option.detail,
            active: option.value === context,
          }))}
        />
        <div className="metric-attention">
          <strong>{allAttention.length}</strong>
          <small>Needs attention</small>
          <em>Act now</em>
        </div>
        <div className="metric-deposits">
          <strong>{allPending.length}</strong>
          <small>Deposits pending</small>
          <em>{formatCurrency(depositAtRisk)} at risk</em>
        </div>
        <div className="metric-confirmed">
          <strong>{allConfirmed.length}</strong>
          <small>Confirmed</small>
          <em>{formatCurrency(securedDeposits)} secured</em>
        </div>
        <div className="metric-total">
          <strong>{contextInquiries.length}</strong>
          <small>Total inquiries</small>
          <em>{activeContext.label}</em>
        </div>
      </section>

      <section className="operator-board-tools">
        <form action="/operator/inbox">
          <label>
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search inbox</span>
            <input name="q" defaultValue={query} placeholder="Search by guest, table, or status..." />
          </label>
          {context !== "tonight" ? <input type="hidden" name="context" value={context} /> : null}
          {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
          <button type="submit">Search</button>
        </form>
        <div>
          <Link className={filter === "all" ? "active" : ""} href={buildInboxHref({ q: query, context })}>All</Link>
          <Link className={filter === "attention" ? "active" : ""} href={buildInboxHref({ q: query, filter: "attention", context })}>Needs attention</Link>
          <Link className={filter === "deposits" ? "active" : ""} href={buildInboxHref({ q: query, filter: "deposits", context })}>Deposits</Link>
          <Link className={filter === "confirmed" ? "active" : ""} href={buildInboxHref({ q: query, filter: "confirmed", context })}>Confirmed</Link>
        </div>
      </section>

      <div className="operator-board-stack">
        {visibleInquiries.length === 0 && attention.length === 0 ? (
          <div className="operator-empty-state">No reservations match this search or filter.</div>
        ) : (
          <>
            <BoardSection
              title="Needs attention now"
              subtitle="Escalated conversations that need a human response."
              tone="attention"
              items={attention}
              details={details}
              hidden={hide.includes("attention")}
              toggleHref={toggleHide("attention")}
              query={query}
              filter={filter}
              context={context}
              hide={hide}
            />
            {context === "tonight" ? (
              <>
                <BoardSection
                  title="Confirmed tonight"
                  subtitle={`${tonightConfirmed.length} bookings secured for tonight.`}
                  tone="confirmed"
                  items={tonightConfirmed}
                  details={details}
                  hidden={hide.includes("confirmed-tonight")}
                  toggleHref={toggleHide("confirmed-tonight")}
                  query={query}
                  filter={filter}
                  context={context}
                  hide={hide}
                />
                <BoardSection
                  title="Pending bookings"
                  subtitle={`${remainingPendingCount} deposits pending / ${remainingOtherCount} other inquiries`}
                  tone="upcoming"
                  items={tonightPending}
                  details={details}
                  hidden={hide.includes("pending-tonight")}
                  toggleHref={toggleHide("pending-tonight")}
                  query={query}
                  filter={filter}
                  context={context}
                  hide={hide}
                />
              </>
            ) : null}
            {context === "next7"
              ? groupedByDate.map(([date, items]) => (
                <BoardSection
                  key={date}
                  title={date}
                  subtitle="Remaining inquiries for this date."
                  tone={items.some(isTonight) ? "tonight" : "upcoming"}
                  items={items}
                  details={details}
                  hidden={hide.includes(date)}
                  toggleHref={toggleHide(date)}
                  query={query}
                  filter={filter}
                  context={context}
                  hide={hide}
                  showActualDate
                />
              ))
              : null}
            {context === "all" ? (
              <BoardSection
                title="All active inquiries"
                subtitle="Full inbox view with lower urgency styling."
                tone="neutral"
                items={allInbox}
                details={details}
                hidden={hide.includes("all-active")}
                toggleHref={toggleHide("all-active")}
                query={query}
                filter={filter}
                context={context}
                hide={hide}
                showActualDate
              />
            ) : null}
          </>
        )}
      </div>

      {selected && selectedItem && selectedDate ? (
        <section className="operator-inbox-drawer-shell" aria-label={`${selected.guestName} lead drawer`}>
          <Link href={buildInboxHref({ q: query, filter, context, hide })} className="operator-inbox-drawer-scrim" aria-label="Close lead drawer" />
          <aside className="operator-inbox-drawer">
            <div className="operator-drawer-head">
              <div>
                <span className={`operator-drawer-avatar tone-${itemTone(selectedItem)}`}>{initials(selected.guestName)}</span>
                <span>
                  <strong>{selected.guestName}</strong>
                  <small>{channelLabel(selected.channel)} / {selectedItem.updatedAt}</small>
                </span>
              </div>
              <Link href={buildInboxHref({ q: query, filter, context, hide })} aria-label="Close drawer">
                <X size={20} aria-hidden="true" />
              </Link>
            </div>

            <div className={`operator-drawer-status tone-${itemTone(selectedItem)}`}>
              <strong>{isSecured ? "Booking secured" : isAttention(selectedItem) ? "Needs attention" : "Reservation open"}</strong>
              <span>
                {isSecured
                  ? "Deposit is covered. Keep the table ready."
                  : dueCents
                    ? `${formatCurrency(dueCents)} deposit still needed.`
                    : selected.nextAction}
              </span>
            </div>

            <div className="operator-drawer-facts">
              <span><Users size={18} aria-hidden="true" />{selected.partySize} guests</span>
              <span>{tableLabel(selected)}</span>
              <span>{selectedDate.date} / {selected.reservation?.arrivalTimeLabel ?? selectedDate.time}</span>
              <span>{requiredCents ? `${formatCurrency(requiredCents)} deposit` : "Deposit TBD"}</span>
            </div>

            <div className="operator-drawer-actions">
              {isDepositPending(selectedItem) ? (
                <form action={updateOperatorInquiryStatusAction}>
                  <input type="hidden" name="inquiryId" value={selected.id} />
                  <input type="hidden" name="status" value="DEPOSIT_SENT" />
                  <input type="hidden" name="redirectTo" value={buildInboxHref({ lead: selected.id, q: query, filter, context, hide })} />
                  <button type="submit" className="operator-primary-action">
                    <CreditCard size={17} aria-hidden="true" />
                    Send deposit
                  </button>
                </form>
              ) : (
                <Link href={`/operator/inbox/${selected.id}`} className="operator-primary-action">
                  <Send size={17} aria-hidden="true" />
                  {actionText(selectedItem)}
                </Link>
              )}
              {selected.phone ? (
                <a href={`tel:${selected.phone}`} className="operator-secondary-action">
                  <Phone size={17} aria-hidden="true" />
                  Call
                </a>
              ) : null}
            </div>

            <div className="operator-drawer-messages">
              <h2>Message history</h2>
              {selected.messages.slice(-5).map((message) => (
                <article key={message.id} className={message.authorRole === "guest" ? "guest" : "outbound"}>
                  <div>
                    <strong>
                      {message.authorRole === "guest"
                        ? selected.guestName
                        : message.authorRole === "ai"
                          ? "AI"
                          : "You"}
                    </strong>
                    <small>{formatMessageTime(message.createdAt)}</small>
                  </div>
                  <p>{message.content}</p>
                </article>
              ))}
            </div>
          </aside>
        </section>
      ) : null}
    </main>
  );
}
