"use client";

import { useMemo, useState } from "react";
import { Clock3, X } from "lucide-react";
import { updateVenueProfileAction } from "@/app/venues/actions";
import {
  brandToneOptions,
  operatingDays,
  venueChannels,
  venueTimezones,
} from "@/lib/venue-form-options";

type HoursState = Record<
  string,
  {
    open: boolean;
    start: string;
    end: string;
  }
>;

function parseChannelsSummary(summary: string) {
  return summary
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((label) => venueChannels.find((channel) => channel.label === label)?.value ?? label);
}

function parseHoursSummary(summary: string | null | undefined): HoursState {
  const initial = operatingDays.reduce<HoursState>((acc, day) => {
    acc[day.key] = { open: false, start: "", end: "" };
    return acc;
  }, {});

  if (!summary) {
    return initial;
  }

  for (const segment of summary.split(" · ")) {
    const [dayLabel, range] = segment.split(" ");
    const [start, end] = (range ?? "").split("-");
    const day = operatingDays.find((entry) => entry.label === dayLabel);
    if (!day || !start || !end) continue;

    initial[day.key] = {
      open: true,
      start,
      end,
    };
  }

  return initial;
}

function formatHoursSummary(hours: HoursState) {
  const segments = operatingDays.flatMap((day) => {
    const item = hours[day.key];
    if (!item?.open || !item.start || !item.end) return [];
    return [`${day.label} ${item.start}-${item.end}`];
  });

  return segments.join(" · ");
}

function getNextStatus(status: string) {
  switch (status) {
    case "DRAFT":
      return { value: "PILOT", label: "Move to pilot" };
    case "PILOT":
      return { value: "ACTIVE", label: "Activate venue" };
    case "ACTIVE":
      return { value: "PAUSED", label: "Pause venue" };
    case "PAUSED":
      return { value: "ACTIVE", label: "Return to active" };
    default:
      return null;
  }
}

export function VenueBusinessConfigurationForm({
  venue,
  error,
}: {
  venue: {
    slug: string;
    status: "DRAFT" | "PILOT" | "ACTIVE" | "PAUSED" | "DEACTIVATED";
    addressLine1?: string | null;
    city: string;
    state?: string | null;
    postalCode?: string | null;
    phoneNumber?: string | null;
    timezone: string;
    channelsSummary: string;
    hoursSummary?: string | null;
    primaryOperatorName?: string | null;
    primaryOperatorRole?: string | null;
    primaryOperatorEmail?: string | null;
    brandTone: string;
    depositPolicy: string;
  };
  error?: string;
}) {
  const [selectedChannels, setSelectedChannels] = useState<string[]>(
    parseChannelsSummary(venue.channelsSummary),
  );
  const [selectedTone, setSelectedTone] = useState<string>(venue.brandTone);
  const [hours, setHours] = useState<HoursState>(parseHoursSummary(venue.hoursSummary));
  const [isHoursModalOpen, setIsHoursModalOpen] = useState(false);

  const hoursSummary = useMemo(() => formatHoursSummary(hours), [hours]);
  const nextStatus = getNextStatus(venue.status);

  function toggleChannel(value: string) {
    const channel = venueChannels.find((item) => item.value === value);
    if (!channel?.enabled) return;

    setSelectedChannels((current) => {
      if (current.includes(value)) {
        return current.length === 1 ? current : current.filter((item) => item !== value);
      }

      return [...current, value];
    });
  }

  function updateHours(dayKey: string, patch: Partial<HoursState[string]>) {
    setHours((current) => ({
      ...current,
      [dayKey]: {
        ...current[dayKey],
        ...patch,
      },
    }));
  }

  return (
    <>
      <form action={updateVenueProfileAction} className="entity-form venue-onboarding-form">
        <input type="hidden" name="slug" value={venue.slug} />
        <input type="hidden" name="currentStatus" value={venue.status} />

        <div className="venue-form-grid">
          <label className="field field-span-full">
            <span>Address</span>
            <input name="addressLine1" defaultValue={venue.addressLine1 ?? ""} required />
          </label>

          <div className="form-row form-row-city">
            <label className="field">
              <span>City</span>
              <input name="city" defaultValue={venue.city} required />
            </label>

            <label className="field">
              <span>State</span>
              <input name="state" maxLength={2} defaultValue={venue.state ?? ""} required />
            </label>

            <label className="field">
              <span>ZIP code</span>
              <input name="postalCode" defaultValue={venue.postalCode ?? ""} required />
            </label>
          </div>

          <div className="form-row form-row-contact">
            <label className="field">
              <span>Phone number</span>
              <input name="phoneNumber" type="tel" defaultValue={venue.phoneNumber ?? ""} required />
            </label>

            <label className="field">
              <span>Timezone</span>
              <select name="timezone" className="select-input" defaultValue={venue.timezone} required>
                {venueTimezones.map((timezone) => (
                  <option key={timezone.value} value={timezone.value}>
                    {timezone.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field field-span-full">
            <span>Channels</span>
            <div className="choice-grid">
              {venueChannels.map((channel) => {
                const active = selectedChannels.includes(channel.value);

                return (
                  <button
                    key={channel.value}
                    type="button"
                    className={`choice-chip ${active ? "active" : ""} ${!channel.enabled ? "disabled" : ""}`}
                    onClick={() => toggleChannel(channel.value)}
                    aria-pressed={active}
                    disabled={!channel.enabled}
                  >
                    {channel.label}
                    {!channel.enabled ? <small>Soon</small> : null}
                  </button>
                );
              })}
            </div>
            {selectedChannels.map((channel) => (
              <input key={channel} type="hidden" name="channels" value={channel} />
            ))}
          </div>

          <div className="field field-span-full">
            <span>Operating hours</span>
            <div className="hours-summary-card">
              <strong>{hoursSummary || "No hours configured yet"}</strong>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setIsHoursModalOpen(true)}
              >
                Edit hours
              </button>
            </div>
          </div>

          <div className="form-row form-row-operator">
            <label className="field">
              <span>Primary operator name</span>
              <input name="primaryOperatorName" defaultValue={venue.primaryOperatorName ?? ""} />
            </label>

            <label className="field">
              <span>Primary operator role</span>
              <input name="primaryOperatorRole" defaultValue={venue.primaryOperatorRole ?? ""} />
            </label>

            <label className="field">
              <span>Primary operator email</span>
              <input
                name="primaryOperatorEmail"
                type="email"
                defaultValue={venue.primaryOperatorEmail ?? ""}
              />
            </label>
          </div>

          <div className="field field-span-full">
            <span>Brand tone</span>
            <div className="tone-grid">
              {brandToneOptions.map((tone) => {
                const active = selectedTone === tone.value;

                return (
                  <button
                    key={tone.value}
                    type="button"
                    className={`tone-card ${active ? "active" : ""}`}
                    onClick={() => setSelectedTone(tone.value)}
                    aria-pressed={active}
                  >
                    <strong>{tone.label}</strong>
                    <p>{tone.value}</p>
                  </button>
                );
              })}
            </div>
            <input type="hidden" name="brandTone" value={selectedTone} />
          </div>

          <label className="field field-span-full">
            <span>Deposit policy</span>
            <textarea name="depositPolicy" rows={4} defaultValue={venue.depositPolicy} required />
          </label>
        </div>

        <div className="action-row">
          <button type="submit" className="button button-primary action-button">
            Save venue configuration
          </button>
          {nextStatus ? (
            <button
              type="submit"
              className="button button-secondary action-button"
              name="targetStatus"
              value={nextStatus.value}
            >
              {nextStatus.label}
            </button>
          ) : null}
        </div>

        {error === "readiness" ? (
          <p className="form-error">Complete the onboarding checklist before moving to the next phase.</p>
        ) : null}
        {error === "forbidden" ? (
          <p className="form-error">Only a platform owner can deactivate a venue.</p>
        ) : null}
        {error === "missing-fields" ? (
          <p className="form-error">Complete all required venue setup fields before saving.</p>
        ) : null}

        {operatingDays.map((day) => {
          const item = hours[day.key];
          return (
            <div key={day.key} hidden>
              <input type="checkbox" name={`open_${day.key}`} checked={item.open} readOnly />
              <input type="hidden" name={`start_${day.key}`} value={item.start} />
              <input type="hidden" name={`end_${day.key}`} value={item.end} />
            </div>
          );
        })}
      </form>

      {isHoursModalOpen ? (
        <div className="modal-scrim" role="presentation" onClick={() => setIsHoursModalOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="business-hours-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-header">
              <div>
                <span className="panel-label">Operating hours</span>
                <h2 id="business-hours-modal-title">Configure schedule</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsHoursModalOpen(false)}
                aria-label="Close operating hours"
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              {operatingDays.map((day) => {
                const item = hours[day.key];

                return (
                  <div key={day.key} className="modal-hours-row">
                    <label className="hours-toggle">
                      <input
                        type="checkbox"
                        checked={item.open}
                        onChange={(event) => updateHours(day.key, { open: event.target.checked })}
                      />
                      <span>{day.label}</span>
                    </label>

                    <input
                      type="time"
                      className="select-input hours-time"
                      value={item.start}
                      disabled={!item.open}
                      onChange={(event) => updateHours(day.key, { start: event.target.value })}
                    />

                    <input
                      type="time"
                      className="select-input hours-time"
                      value={item.end}
                      disabled={!item.open}
                      onChange={(event) => updateHours(day.key, { end: event.target.value })}
                    />
                  </div>
                );
              })}
            </div>

            <div className="modal-footer">
              <div className="modal-summary">
                <Clock3 size={16} />
                <span>{hoursSummary || "No hours configured yet"}</span>
              </div>
              <button
                type="button"
                className="button button-primary"
                onClick={() => setIsHoursModalOpen(false)}
              >
                Save hours
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
