import {
  ArrowLeft,
  Calendar,
  Check,
  Link as LinkIcon,
  Phone,
  Send,
  Table2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addOperatorMessageAction,
  updateOperatorInquiryStatusAction,
} from "@/app/operator/actions";
import { requireOperatorUser } from "@/lib/operator-auth";
import { getOperatorInquiry } from "@/lib/operator-service";

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

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function splitRequestedDate(label: string) {
  const [datePart = label, timePart = ""] = label.split(" at ");
  return {
    date: datePart.replace("Saturday, ", "Sat, ").replace("Friday, ", "Fri, "),
    time: timePart || "TBD",
  };
}

export default async function OperatorInquiryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await requireOperatorUser();
  const { id } = await params;
  const query = await searchParams;
  const inquiry = await getOperatorInquiry(user.venueId, id);

  if (!inquiry) {
    notFound();
  }

  const requested = splitRequestedDate(inquiry.requestedDateLabel);
  const tableName = inquiry.reservation?.tableOption.name ?? inquiry.quoteOptions[0]?.tableOption.name ?? "Table TBD";
  const depositRequiredCents = inquiry.reservation?.depositAmountCents ?? inquiry.quoteOptions[0]?.tableOption.depositAmountCents ?? 0;
  const depositPaidCents = inquiry.reservation?.depositPaidCents ?? 0;
  const depositDueCents = Math.max(0, depositRequiredCents - depositPaidCents);
  const isSecured = inquiry.reservation?.status === "CONFIRMED" || (depositRequiredCents > 0 && depositDueCents === 0);
  const phone = inquiry.phone ?? "";
  const primaryAction = isSecured ? "Confirm booking" : `Send ${depositDueCents ? formatCurrency(depositDueCents) : "deposit"} link`;
  const latestGuestMessage = [...inquiry.messages].reverse().find((message) => message.authorRole === "guest")?.content;

  return (
    <main className="operator-dashboard-page operator-simple-detail-page">
      <section className="operator-simple-detail-top">
        <Link href="/operator/inbox" className="operator-back-link">
          <ArrowLeft size={18} aria-hidden="true" />
          Back to inbox
        </Link>
      </section>

      {query.saved ? <p className="form-success operator-detail-feedback">Saved {query.saved}.</p> : null}
      {query.error ? <p className="form-error operator-detail-feedback">{query.error}</p> : null}

      <section className={`operator-simple-lead ${isSecured ? "secured" : "not-secured"}`}>
        <div className="operator-simple-lead-main">
          <span className="operator-simple-lead-avatar">{initials(inquiry.guestName)}</span>
          <div>
            <span className="operator-simple-lead-status">{isSecured ? "Secured" : "Deposit needed"}</span>
            <h1>{inquiry.guestName}</h1>
            <p>{latestGuestMessage ?? inquiry.nextAction}</p>
          </div>
        </div>

        <div className="operator-simple-lead-facts">
          <span>
            <Users size={18} aria-hidden="true" />
            {inquiry.partySize} guests
          </span>
          <span>
            <Table2 size={18} aria-hidden="true" />
            {tableName}
          </span>
          <span>
            <Calendar size={18} aria-hidden="true" />
            {requested.date} / {inquiry.reservation?.arrivalTimeLabel ?? requested.time}
          </span>
        </div>

        <div className="operator-simple-next">
          <div>
            <small>Next best action</small>
            <strong>{primaryAction}</strong>
            <span>
              {isSecured
                ? "Booking is ready to close out."
                : `${depositRequiredCents ? formatCurrency(depositRequiredCents) : "Deposit"} required to hold this table.`}
            </span>
          </div>

          <div className="operator-simple-action-row">
            <form action={updateOperatorInquiryStatusAction}>
              <input type="hidden" name="inquiryId" value={inquiry.id} />
              <input type="hidden" name="status" value={isSecured ? "CONFIRMED" : "DEPOSIT_SENT"} />
              <button type="submit" className="operator-primary-action">
                {isSecured ? <Check size={18} aria-hidden="true" /> : <LinkIcon size={18} aria-hidden="true" />}
                {primaryAction}
              </button>
            </form>
            {phone ? (
              <a href={`tel:${phone}`} className="operator-secondary-action">
                <Phone size={18} aria-hidden="true" />
                Call
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="operator-simple-thread">
        <div className="operator-simple-thread-head">
          <h2>Conversation</h2>
          <span>{inquiry.messages.length} messages</span>
        </div>

        <div className="operator-simple-messages">
          {inquiry.messages.map((message) => {
            const isOutbound = message.authorRole === "operator" || message.authorRole === "ai";
            return (
              <article key={message.id} className={isOutbound ? "outbound" : "inbound"}>
                <div>
                  <strong>{isOutbound ? (message.authorRole === "ai" ? "AI" : "You") : inquiry.guestName}</strong>
                  <small>{formatMessageTime(message.createdAt)}</small>
                </div>
                <p>{message.content}</p>
              </article>
            );
          })}
        </div>

        <form action={addOperatorMessageAction} className="operator-simple-reply">
          <input type="hidden" name="inquiryId" value={inquiry.id} />
          <label>
            <span className="sr-only">Reply to guest</span>
            <textarea name="content" rows={3} placeholder="Reply to guest..." required />
          </label>
          <button type="submit" className="operator-primary-action">
            <Send size={17} aria-hidden="true" />
            Send
          </button>
        </form>
      </section>
    </main>
  );
}
