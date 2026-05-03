"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, X } from "lucide-react";

type PatternItem = {
  label: string;
  venueSlug?: string;
  venueName?: string;
  kind: "venue" | "thread";
};

type Pattern = {
  title: string;
  description: string;
  count: string;
  items: PatternItem[];
};

export function AlertPatternsPanel({ patterns }: { patterns: Pattern[] }) {
  const [activePattern, setActivePattern] = useState<Pattern | null>(null);

  function closeDrawer() {
    setActivePattern(null);
  }

  return (
    <>
      <div className="state-grid state-grid-three">
        {patterns.length === 0 ? (
          <article className="state-card">
            <h3>No patterns yet</h3>
            <p>Patterns will appear after venues start receiving live inquiries.</p>
            <strong>0 signals</strong>
          </article>
        ) : (
          patterns.map((pattern) => {
            const isClickable = pattern.items.length > 0;

            return isClickable ? (
              <button
                key={pattern.title}
                type="button"
                className="state-card state-card-button"
                onClick={() => setActivePattern(pattern)}
              >
                <h3>{pattern.title}</h3>
                <p>{pattern.description}</p>
                <div className="state-card-footer">
                  <strong>{pattern.count}</strong>
                  <span className="text-link">
                    View affected
                    <ChevronRight size={14} />
                  </span>
                </div>
              </button>
            ) : (
              <article key={pattern.title} className="state-card state-card-disabled">
                <h3>{pattern.title}</h3>
                <p>{pattern.description}</p>
                <strong>{pattern.count}</strong>
              </article>
            );
          })
        )}
      </div>

      <div
        className={`drawer-scrim ${activePattern ? "" : "drawer-scrim-hidden"}`}
        role="presentation"
        onClick={closeDrawer}
      >
        <aside
          className={`drawer-panel ${activePattern ? "" : "drawer-panel-hidden"}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pattern-drawer-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="panel-header">
            <div>
              <span className="panel-label">Pattern details</span>
              <h2 id="pattern-drawer-title">{activePattern?.title ?? "Pattern"}</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={closeDrawer}
              aria-label="Close pattern drawer"
            >
              <X size={16} />
            </button>
          </div>

          <p className="form-helper">{activePattern?.description ?? ""}</p>

          <div className="detail-list">
            {activePattern?.items.length ? (
              activePattern.items.map((item) => (
                <div key={`${item.kind}-${item.label}`} className="detail-row detail-row-alert">
                  <div className="detail-row-copy">
                    <strong>{item.label}</strong>
                    <small>{item.kind === "venue" ? "Venue" : "Thread"}</small>
                  </div>
                  {item.venueSlug ? (
                    <Link href={`/venues/${item.venueSlug}`} className="button button-secondary">
                      Go to venue
                    </Link>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="detail-row">
                <span>No affected entities for this pattern.</span>
                <strong>0 results</strong>
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
