"use client";

import { useMemo, useState } from "react";
import { Clock3, X } from "lucide-react";
import { createVenueAction } from "@/app/venues/actions";
import {
  brandToneOptions,
  operatingDays,
  venueChannels,
  venueTimezones,
} from "@/lib/venue-form-options";

type VenueOnboardingFormProps = {
  error?: string;
};

type HoursState = Record<
  string,
  {
    open: boolean;
    start: string;
    end: string;
  }
>;

const defaultHours = operatingDays.reduce<HoursState>((acc, day) => {
  acc[day.key] = {
    open: day.key === "friday" || day.key === "saturday",
    start: day.key === "friday" || day.key === "saturday" ? "22:00" : "",
    end: day.key === "friday" || day.key === "saturday" ? "04:00" : "",
  };
  return acc;
}, {});

function formatHoursSummary(hours: HoursState) {
  const segments = operatingDays.flatMap((day) => {
    const item = hours[day.key];
    if (!item?.open || !item.start || !item.end) return [];
    return [`${day.label} ${item.start}-${item.end}`];
  });

  if (segments.length === 0) {
    return "No hours configured yet";
  }

  return segments.join(" · ");
}

export function VenueOnboardingForm({ error }: VenueOnboardingFormProps) {
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["SMS", "INSTAGRAM_DM"]);
  const [selectedTone, setSelectedTone] = useState<string>(brandToneOptions[0]?.value ?? "");
  const [hours, setHours] = useState<HoursState>(defaultHours);
  const [isHoursModalOpen, setIsHoursModalOpen] = useState(false);

  const hoursSummary = useMemo(() => formatHoursSummary(hours), [hours]);

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
      <form action={createVenueAction} className="entity-form venue-onboarding-form">
        <div className="venue-form-grid">
          <label className="field field-span-full">
            <span>Venue name</span>
            <input name="name" placeholder="Luma Saturdays" required />
          </label>

          <label className="field field-span-full">
            <span>Address</span>
            <input name="addressLine1" placeholder="123 Collins Ave" required />
          </label>

          <div className="form-row form-row-city">
            <label className="field">
              <span>City</span>
              <input name="city" placeholder="Miami" required />
            </label>

            <label className="field">
              <span>State</span>
              <input name="state" placeholder="FL" maxLength={2} required />
            </label>

            <label className="field">
              <span>ZIP code</span>
              <input name="postalCode" placeholder="33139" required />
            </label>
          </div>

          <div className="form-row form-row-contact">
            <label className="field">
              <span>Phone number</span>
              <input name="phoneNumber" type="tel" placeholder="(305) 555-0148" required />
            </label>

            <label className="field">
              <span>Timezone</span>
              <select name="timezone" className="select-input" defaultValue="America/New_York" required>
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
              <strong>{hoursSummary}</strong>
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
              <input name="primaryOperatorName" placeholder="Jordan Lee" />
            </label>

            <label className="field">
              <span>Primary operator role</span>
              <input name="primaryOperatorRole" placeholder="Venue Manager" />
            </label>

            <label className="field">
              <span>Primary operator email</span>
              <input name="primaryOperatorEmail" type="email" placeholder="manager@venue.com" />
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
        </div>
        <div className="action-row">
          <button type="submit" className="button button-primary action-button">
            Onboard venue
          </button>
        </div>

        {error ? <p className="form-error">Please complete every required field.</p> : null}

        <input type="hidden" name="hoursSummary" value={hoursSummary === "No hours configured yet" ? "" : hoursSummary} />

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
            aria-labelledby="hours-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-header">
              <div>
                <span className="panel-label">Operating hours</span>
                <h2 id="hours-modal-title">Configure schedule</h2>
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
                <span>{hoursSummary}</span>
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
