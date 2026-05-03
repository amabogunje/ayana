"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

export function OperatorDateScroller({
  selectedDate,
  label,
  previousHref,
  nextHref,
  todayHref,
  query,
  hide,
}: {
  selectedDate: string;
  label: string;
  previousHref: string;
  nextHref: string;
  todayHref: string;
  query: string;
  hide: string[];
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(selectedDate);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function jumpToDate() {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (hide.length) params.set("hide", hide.join(","));
    params.set("date", date);
    window.location.href = `/operator/reservations?${params.toString()}`;
  }

  return (
    <div className="operator-reservation-date-scroller" ref={menuRef}>
      <Link href={previousHref} aria-label="Previous day">
        <ChevronLeft size={18} aria-hidden="true" />
      </Link>
      <button type="button" className="operator-date-jump-button" onClick={() => setOpen((value) => !value)}>
        {label}
      </button>
      <Link href={nextHref} aria-label="Next day">
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
      <Link href={todayHref} className="operator-today-button">
        Today
      </Link>

      {open ? (
        <div className="operator-date-jump-popover">
          <label>
            <span>Jump to date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <button type="button" onClick={jumpToDate}>
            Go
          </button>
        </div>
      ) : null}
    </div>
  );
}
