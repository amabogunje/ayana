"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import Link from "next/link";

type OperatorContextMenuOption = {
  href: string;
  label: string;
  detail: string;
  active: boolean;
};

export function OperatorContextMenu({
  label,
  detail,
  options,
}: {
  label: string;
  detail: string;
  options: OperatorContextMenuOption[];
}) {
  const [open, setOpen] = useState(false);
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

  return (
    <div className="operator-board-context" ref={menuRef}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <CalendarDays size={22} aria-hidden="true" />
        <span>
          <strong>{label}</strong>
          <small>{detail}</small>
        </span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {open ? (
        <div>
          {options.map((option) => (
            <Link
              key={option.label}
              href={option.href}
              className={option.active ? "active" : ""}
              onClick={() => setOpen(false)}
            >
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
