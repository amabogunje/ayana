import {
  Bot,
  CheckCircle2,
  MessageSquareText,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  UserRoundCheck,
} from "lucide-react";
import Link from "next/link";
import {
  resetOperatorVenueAgentConfigAction,
  updateOperatorVenueAgentConfigAction,
} from "@/app/operator/actions";
import type { OperatorVenueAgentSettings } from "@/lib/operator-types";

type Props = {
  settings: OperatorVenueAgentSettings;
};

const autonomyOptions = [
  { value: 0, label: "Level 0", detail: "Draft only" },
  { value: 1, label: "Level 1", detail: "Answer FAQs" },
  { value: 2, label: "Level 2", detail: "Qualify and recommend" },
  { value: 3, label: "Level 3", detail: "Quotes and deposits" },
  { value: 4, label: "Level 4", detail: "Create reservations" },
  { value: 5, label: "Level 5", detail: "Autopilot with escalations" },
] as const;

const actionControls = [
  {
    name: "canAnswerFaqs",
    label: "FAQs",
    title: "Answer FAQs",
    description: "Use configured venue knowledge for policy and amenity answers.",
    minLevel: 1,
  },
  {
    name: "canQualifyLeads",
    label: "Qualification",
    title: "Qualify leads",
    description: "Ask for date, party size, phone, budget, and occasion.",
    minLevel: 2,
  },
  {
    name: "canRecommendPackages",
    label: "Packages",
    title: "Recommend packages",
    description: "Suggest configured tables and packages only.",
    minLevel: 2,
  },
  {
    name: "canCreateQuotes",
    label: "Quotes",
    title: "Create draft quotes",
    description: "Persist draft quote options after policy checks pass.",
    minLevel: 3,
  },
  {
    name: "canSendDepositLinks",
    label: "Deposit links",
    title: "Send deposit links",
    description: "Allowed at Level 3+, but website chat checkout currently still needs reservation creation.",
    minLevel: 3,
    runtimeNote: "Requires reservations for website chat today.",
  },
  {
    name: "canCreateReservations",
    label: "Reservations",
    title: "Create reservations",
    description: "Create reservations when availability and guest details are ready.",
    minLevel: 4,
  },
] as const;

type ActionControlName = (typeof actionControls)[number]["name"];

function ActionToggle({
  name,
  title,
  description,
  defaultChecked,
  status,
  note,
}: {
  name: string;
  title: string;
  description: string;
  defaultChecked: boolean;
  status?: string;
  note?: string;
}) {
  return (
    <label className="detail-row detail-row-audit operator-agent-toggle">
      <div className="detail-row-copy">
        <strong>{title}</strong>
        <small>{description}</small>
        {note ? <small className="operator-agent-control-note">{note}</small> : null}
      </div>
      {status ? <span className="operator-agent-control-status">{status}</span> : null}
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
    </label>
  );
}

export function OperatorAgentSettingsForm({ settings }: Props) {
  const { config, venue } = settings;
  const actionPermissions = config.actionPermissions;
  const escalationRules = config.escalationRules;
  const websiteChatAllowed = config.enabledChannels.includes("website_chat");
  const websiteChatRuntimeReady = venue.websiteChatEnabled && websiteChatAllowed && config.enabled;
  const effectiveActions = actionControls.map((action) => {
    const checked = actionPermissions[action.name as ActionControlName];
    const levelAllows = config.autonomyLevel >= action.minLevel;
    const effective = checked && levelAllows && config.enabled;
    const status =
      !checked ? "Off"
      : !config.enabled ? "Paused"
      : levelAllows ? "Active"
      : `Limited by Level ${config.autonomyLevel}`;

    return {
      ...action,
      checked,
      levelAllows,
      effective,
      status,
    };
  });
  const activeActions = effectiveActions.filter((action) => action.effective).map((action) => action.label);
  const autonomySummary =
    config.autonomyLevel === 0 ? "No autonomous customer replies. Conversations are handed to an operator."
    : config.autonomyLevel === 1 ? "FAQ answers only. Booking qualification and sales actions hand off."
    : config.autonomyLevel === 2 ? "Can qualify leads and recommend configured packages. Quotes, deposits, and reservations are blocked."
    : config.autonomyLevel === 3 ? "Can create draft quotes and is permitted for deposit links, but website chat checkout still needs reservation creation."
    : config.autonomyLevel === 4 ? "Can create reservations when policy checks pass."
    : "Full autopilot for configured actions, except policy escalations.";

  return (
    <form action={updateOperatorVenueAgentConfigAction} className="operator-settings-form operator-agent-settings-form">
      <section className="operator-agent-grid">
        <div className="operator-agent-main">
          <section className="operator-dashboard-panel operator-settings-card operator-settings-section">
            <div className="operator-settings-card-head">
              <div>
                <h3>Identity <span aria-hidden="true">.</span></h3>
                <p>Name the agent and keep its voice aligned with the venue.</p>
              </div>
              <span className="operator-agent-source">Source: {config.source ?? "persisted"}</span>
            </div>

            <div className="venue-form-grid operator-settings-grid">
              <ActionToggle
                name="enabled"
                title="Agent enabled"
                description="Master switch for customer-facing AI replies and actions."
                defaultChecked={config.enabled}
                status={config.enabled ? "On" : "Paused"}
              />

              <label className="field">
                <span>Agent name</span>
                <span className="operator-field-control">
                  <Bot size={18} aria-hidden="true" />
                  <input name="agentName" defaultValue={config.agentName} maxLength={80} required />
                </span>
              </label>

              <label className="field field-span-full">
                <span>Brand voice</span>
                <span className="operator-field-control operator-agent-textarea-control">
                  <MessageSquareText size={18} aria-hidden="true" />
                  <textarea name="brandVoice" defaultValue={config.brandVoice} maxLength={800} rows={4} required />
                </span>
              </label>
            </div>
          </section>

          <section className="operator-dashboard-panel operator-settings-card operator-settings-section">
            <div className="operator-settings-card-head">
              <div>
                <h3>Autonomy <span aria-hidden="true">.</span></h3>
                <p>Choose the maximum operating level and individual actions this venue permits.</p>
              </div>
              <SlidersHorizontal size={22} aria-hidden="true" />
            </div>

            <div className="venue-form-grid operator-settings-grid">
              <label className="field field-span-full">
                <span>Autonomy level</span>
                <span className="operator-field-control">
                  <ShieldCheck size={18} aria-hidden="true" />
                  <select name="autonomyLevel" className="select-input" defaultValue={config.autonomyLevel}>
                    {autonomyOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}: {option.detail}
                      </option>
                    ))}
                  </select>
                </span>
                <small className="operator-agent-field-note">{autonomySummary}</small>
                <small className="operator-agent-field-note">
                  Autonomy is the ceiling. If an action is checked but its required level is higher, the action remains unavailable at runtime.
                </small>
              </label>

              <div className="operator-agent-toggle-grid field-span-full">
                {effectiveActions.map((action) => (
                  <ActionToggle
                    key={action.name}
                    name={action.name}
                    title={action.title}
                    description={`${action.description} Requires Level ${action.minLevel} or higher.`}
                    defaultChecked={action.checked}
                    status={action.status}
                    note={"runtimeNote" in action ? action.runtimeNote : undefined}
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="operator-dashboard-panel operator-settings-card operator-settings-section">
            <div className="operator-settings-card-head">
              <div>
                <h3>Handoff rules <span aria-hidden="true">.</span></h3>
                <p>Escalate conversations that need judgment, confidence, or operator approval.</p>
              </div>
              <UserRoundCheck size={22} aria-hidden="true" />
            </div>

            <div className="venue-form-grid operator-settings-grid">
              <div className="operator-agent-toggle-grid field-span-full">
                <ActionToggle
                  name="escalateOnLowConfidence"
                  title="Low confidence"
                  description="Route uncertain replies to a human instead of guessing."
                  defaultChecked={escalationRules.escalateOnLowConfidence}
                />
                <ActionToggle
                  name="escalateForVipRequests"
                  title="VIP or custom requests"
                  description="Escalate guest requests that need special approval."
                  defaultChecked={escalationRules.escalateForVipRequests}
                />
                <ActionToggle
                  name="escalateForUnavailableInventory"
                  title="Unavailable inventory"
                  description="Escalate instead of inventing availability or packages."
                  defaultChecked={escalationRules.escalateForUnavailableInventory}
                />
                <ActionToggle
                  name="escalateForOversizedParty"
                  title="Large parties"
                  description="Escalate groups beyond configured capacity or threshold."
                  defaultChecked={escalationRules.escalateForOversizedParty}
                />
              </div>

              <label className="field">
                <span>Confidence threshold</span>
                <span className="operator-field-control">
                  <ShieldCheck size={18} aria-hidden="true" />
                  <input
                    name="confidenceThreshold"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    defaultValue={config.confidenceThreshold}
                    required
                  />
                </span>
              </label>

              <label className="field">
                <span>Party size threshold</span>
                <span className="operator-field-control">
                  <UserRoundCheck size={18} aria-hidden="true" />
                  <input
                    name="partySizeThreshold"
                    type="number"
                    min="1"
                    max="999"
                    defaultValue={escalationRules.partySizeThreshold ?? ""}
                    placeholder="Use capacity rules"
                  />
                </span>
              </label>
            </div>
          </section>

          <section className="operator-dashboard-panel operator-settings-card operator-settings-section">
            <div className="operator-settings-card-head">
              <div>
                <h3>Channels <span aria-hidden="true">.</span></h3>
                <p>Control where this venue agent is allowed to respond.</p>
              </div>
              <MessageSquareText size={22} aria-hidden="true" />
            </div>

            <ActionToggle
              name="websiteChatEnabled"
              title="Allow agent on website chat"
              description={
                venue.websiteChatEnabled
                  ? "Controls whether the agent may respond on website chat. The venue website chat channel is currently enabled."
                  : "The venue website chat channel is off in venue settings, so this agent channel cannot receive guests yet."
              }
              defaultChecked={websiteChatAllowed}
              status={
                websiteChatRuntimeReady ? "Live"
                : !venue.websiteChatEnabled ? "Venue channel off"
                : websiteChatAllowed ? "Agent paused"
                : "Agent channel off"
              }
            />
            <div className="operator-agent-runtime-note">
              Venue website chat and agent website chat are separate switches. Guests can only reach the agent when both the venue channel and this agent channel are enabled.
            </div>
          </section>

          <section className="operator-dashboard-panel operator-settings-card operator-settings-section">
            <div className="operator-settings-card-head">
              <div>
                <h3>Advanced instructions <span aria-hidden="true">.</span></h3>
                <p>Stored for a future prompt policy pass. These notes are not used by the runtime yet.</p>
              </div>
              <span className="operator-agent-source">Not active</span>
            </div>

            <input type="hidden" name="advancedInstructions" value={config.advancedInstructions ?? ""} />
            <label className="field field-span-full">
              <span>Stored instructions</span>
              <span className="operator-field-control operator-agent-textarea-control">
                <MessageSquareText size={18} aria-hidden="true" />
                <textarea
                  defaultValue={config.advancedInstructions ?? ""}
                  maxLength={3000}
                  rows={6}
                  disabled
                  placeholder="Not active yet"
                />
              </span>
              <small className="operator-agent-field-note">
                This field is preserved on save but disabled until advanced instructions are wired into prompts and policy review.
              </small>
            </label>
          </section>
        </div>

        <aside className="operator-agent-side">
          <section className="operator-dashboard-panel operator-agent-preview">
            <div>
              <span className="panel-label">Preview</span>
              <h3>{config.agentName}</h3>
              <p>{config.brandVoice}</p>
            </div>
            <div className="detail-list">
              <div className="detail-row">
                <span>Status</span>
                <strong>{config.enabled ? "Enabled" : "Paused"}</strong>
              </div>
              <div className="detail-row">
                <span>Autonomy</span>
                <strong>Level {config.autonomyLevel}</strong>
              </div>
              <div className="detail-row">
                <span>Confidence</span>
                <strong>{Math.round(config.confidenceThreshold * 100)}%</strong>
              </div>
              <div className="detail-row">
                <span>Venue chat</span>
                <strong>{venue.websiteChatEnabled ? "Enabled" : "Off"}</strong>
              </div>
              <div className="detail-row">
                <span>Agent chat</span>
                <strong>{websiteChatAllowed ? "Allowed" : "Off"}</strong>
              </div>
            </div>
            <div className="operator-agent-chip-list">
              {activeActions.length > 0 ? (
                activeActions.map((action) => <span key={action}>{action}</span>)
              ) : (
                <span>No actions enabled</span>
              )}
            </div>
            {venue.websiteChatWidgetKey ? (
              <Link
                href={`/api/test/website-chat-page?widgetKey=${venue.websiteChatWidgetKey}`}
                className="operator-secondary-action"
              >
                <MessageSquareText size={16} aria-hidden="true" />
                Open chat test page
              </Link>
            ) : null}
          </section>

          <section className="operator-dashboard-panel operator-agent-save-panel">
            <div>
              <CheckCircle2 size={20} aria-hidden="true" />
              <span>Changes apply to the shared runtime after save.</span>
            </div>
            <button type="submit" className="operator-primary-action">
              <Save size={17} aria-hidden="true" />
              Save agent settings
            </button>
            <button type="submit" formAction={resetOperatorVenueAgentConfigAction} className="operator-secondary-action">
              <RotateCcw size={16} aria-hidden="true" />
              Reset defaults
            </button>
          </section>
        </aside>
      </section>
    </form>
  );
}
