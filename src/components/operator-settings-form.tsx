"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  Building2,
  CalendarDays,
  Check,
  Clock3,
  Copy,
  Hash,
  Instagram,
  MapPin,
  MessageSquareText,
  MessagesSquare,
  Pencil,
  Phone,
  Plus,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
  UsersRound,
  Wine,
  X,
} from "lucide-react";
import {
  generateOperatorWebsiteChatSnippetAction,
} from "@/app/operator/actions";
import { operatingDays, venueChannels, venueTimezones } from "@/lib/venue-form-options";

type HoursState = Record<
  string,
  {
    open: boolean;
    start: string;
    end: string;
  }
>;

type OperatorSettingsProps = {
  settings: {
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
    depositPolicy: string;
    servesFood: boolean;
    servesHookah: boolean;
    hasParking: boolean;
    hasValet: boolean;
    dressCodeSummary?: string | null;
    agePolicySummary?: string | null;
    websiteChatEnabled: boolean;
    websiteChatWidgetKey?: string | null;
    websiteChatAllowedOrigins?: string | null;
    websiteChatWelcomeMessage?: string | null;
    websiteChatPromptPlaceholder?: string | null;
    websiteChatInstallSnippet?: string | null;
    staffUsers: Array<{
      id: string;
      fullName: string;
      email: string;
      role: "VENUE_OWNER" | "VENUE_MANAGER" | "VENUE_AGENT";
      inviteAcceptedAt?: string | null;
    }>;
    assets: Array<{
      id: string;
      type: "BOTTLE_MENU" | "FOOD_MENU" | "HOOKAH_MENU" | "EVENT_FLYER";
      label: string;
      publicUrl: string;
      fileName: string;
      mimeType: string;
      createdAt: string;
    }>;
  };
  initialSection?: SettingsSection;
};

type SettingsSection = "venue" | "staff" | "channels" | "menus" | "policies";
type TabIcon = typeof MapPin;
type StaffUser = OperatorSettingsProps["settings"]["staffUsers"][number];
type StaffDraft = {
  fullName: string;
  email: string;
  role: "VENUE_MANAGER" | "VENUE_AGENT";
};

const settingsTabs: Array<{ id: SettingsSection; label: string; detail: string; icon: TabIcon }> = [
  { id: "venue", label: "Venue", detail: "Address, phone, hours", icon: MapPin },
  { id: "staff", label: "Staff", detail: "Operators and roles", icon: UsersRound },
  { id: "channels", label: "Channels", detail: "Guest touchpoints", icon: MessagesSquare },
  { id: "menus", label: "Menus", detail: "Bottle, food, hookah", icon: Wine },
  { id: "policies", label: "Policies", detail: "Deposits and rules", icon: ShieldCheck },
];
const primaryOperatorRoleOptions = ["Owner", "Manager", "Admin", "Host", "Promoter"];

function parseHoursSummary(summary: string | null | undefined): HoursState {
  const initial = operatingDays.reduce<HoursState>((acc, day) => {
    acc[day.key] = { open: false, start: "", end: "" };
    return acc;
  }, {});

  if (!summary) {
    return initial;
  }

  for (const segment of summary.split(/\s[|Â·]\s/)) {
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

  return segments.join(" | ");
}

function formatHourLabel(value: string) {
  if (!value) return "";
  const [hourPart, minutePart = "00"] = value.split(":");
  const hour = Number(hourPart);
  if (!Number.isFinite(hour)) return value;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutePart} ${suffix}`;
}

function formatVisibleHours(hours: HoursState) {
  return operatingDays.flatMap((day) => {
    const item = hours[day.key];
    if (!item?.open || !item.start || !item.end) return [];
    return [
      {
        day: day.label,
        range: `${formatHourLabel(item.start)} - ${formatHourLabel(item.end)}`,
      },
    ];
  });
}

function parseConfiguredChannels(summary: string) {
  const configured = new Set(
    summary
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

  return venueChannels.map((channel) => ({
    ...channel,
    selected:
      configured.has(channel.label) ||
      (channel.value === "INSTAGRAM_DM" && configured.has("Instagram DM")),
  }));
}

function channelIcon(value: string) {
  switch (value) {
    case "WEBSITE_CHAT":
      return <MessageSquareText size={16} />;
    case "SMS":
      return <Smartphone size={16} />;
    case "INSTAGRAM_DM":
      return <Instagram size={16} />;
    case "WHATSAPP":
      return <MessageSquareText size={16} />;
    case "PHONE":
      return <Phone size={16} />;
    default:
      return <MessageSquareText size={16} />;
  }
}

function isImageAsset(mimeType: string) {
  return mimeType.startsWith("image/");
}

function prettyAssetTypeLabel(mimeType: string) {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "Image";
  return "File";
}

function roleLabel(role: "VENUE_OWNER" | "VENUE_MANAGER" | "VENUE_AGENT") {
  if (role === "VENUE_OWNER") return "Owner";
  if (role === "VENUE_MANAGER") return "Admin";
  return "Host";
}

function initialsForName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "S";
}

function AssetPreview({
  asset,
}: {
  asset?: {
    fileName: string;
    publicUrl: string;
    mimeType: string;
  } | null;
}) {
  if (!asset) return null;

  return (
    <div className="operator-asset-preview">
      {isImageAsset(asset.mimeType) ? (
        <a href={asset.publicUrl} target="_blank" rel="noreferrer" className="operator-asset-thumb-link">
          <img src={asset.publicUrl} alt={asset.fileName} className="operator-asset-thumb" />
        </a>
      ) : (
        <a href={asset.publicUrl} target="_blank" rel="noreferrer" className="operator-asset-thumb-link">
          <div className="operator-asset-pdf-frame">
            <object
              data={`${asset.publicUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
              type="application/pdf"
              className="operator-asset-pdf-object"
              aria-label={asset.fileName}
            >
              <div className="operator-asset-doc-card">
                <strong>{prettyAssetTypeLabel(asset.mimeType)}</strong>
                <span className="operator-asset-doc-icon" aria-hidden="true">
                  {asset.mimeType === "application/pdf" ? "PDF" : "FILE"}
                </span>
                <small>{asset.fileName}</small>
              </div>
            </object>
          </div>
        </a>
      )}

      <div className="operator-settings-inline-note">
        <strong>Saved asset</strong>
        <span>{prettyAssetTypeLabel(asset.mimeType)} attached</span>
      </div>

      <a href={asset.publicUrl} className="operator-secondary-action" target="_blank" rel="noreferrer">
        Preview larger
      </a>
    </div>
  );
}

export function OperatorSettingsForm({
  settings,
  initialSection = "venue",
}: OperatorSettingsProps) {
  const [hours, setHours] = useState<HoursState>(parseHoursSummary(settings.hoursSummary));
  const [isHoursModalOpen, setIsHoursModalOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [copied, setCopied] = useState(false);
  const [servesFood, setServesFood] = useState(settings.servesFood);
  const [servesHookah, setServesHookah] = useState(settings.servesHookah);
  const [hasParking, setHasParking] = useState(settings.hasParking);
  const [hasValet, setHasValet] = useState(settings.hasValet);
  const [draftBottleMenuName, setDraftBottleMenuName] = useState<string | null>(null);
  const [draftFoodMenuName, setDraftFoodMenuName] = useState<string | null>(null);
  const [draftHookahMenuName, setDraftHookahMenuName] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [staffInviteUrl, setStaffInviteUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [staffSavingId, setStaffSavingId] = useState<string | null>(null);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffDrafts, setStaffDrafts] = useState<Record<string, StaffDraft>>({});
  const [savedAssets, setSavedAssets] = useState(settings.assets);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>(settings.staffUsers);
  const installSnippetRef = useRef<HTMLTextAreaElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const newStaffNameRef = useRef<HTMLInputElement | null>(null);
  const newStaffEmailRef = useRef<HTMLInputElement | null>(null);

  const hoursSummary = useMemo(() => formatHoursSummary(hours), [hours]);
  const visibleHours = useMemo(() => formatVisibleHours(hours), [hours]);
  const configuredChannels = useMemo(
    () => parseConfiguredChannels(settings.channelsSummary),
    [settings.channelsSummary],
  );

  const websiteChatAvailable =
    settings.websiteChatEnabled ||
    configuredChannels.some((channel) => channel.value === "WEBSITE_CHAT" && channel.selected);
  const websiteChatTestUrl = settings.websiteChatWidgetKey
    ? `/api/test/website-chat-page?widgetKey=${settings.websiteChatWidgetKey}`
    : null;

  const bottleMenuAsset = savedAssets.find((asset) => asset.type === "BOTTLE_MENU");
  const foodMenuAsset = savedAssets.find((asset) => asset.type === "FOOD_MENU");
  const hookahMenuAsset = savedAssets.find((asset) => asset.type === "HOOKAH_MENU");
  const additionalStaff = staffUsers.filter(
    (staff) => staff.email.toLowerCase() !== (settings.primaryOperatorEmail ?? "").toLowerCase(),
  );

  async function copyInstallSnippet() {
    if (!settings.websiteChatInstallSnippet) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(settings.websiteChatInstallSnippet);
      } else {
        throw new Error("Clipboard API unavailable");
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = installSnippetRef.current;
      if (!textarea) {
        setCopied(false);
        return;
      }

      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);

      try {
        const copiedWithFallback = document.execCommand("copy");
        setCopied(copiedWithFallback);
        if (copiedWithFallback) {
          window.setTimeout(() => setCopied(false), 2000);
        }
      } catch {
        setCopied(false);
      }
    }
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

  function startEditingStaff(staff: StaffUser) {
    setEditingStaffId(staff.id);
    setStaffDrafts((current) => ({
      ...current,
      [staff.id]: {
        fullName: staff.fullName,
        email: staff.email,
        role: staff.role === "VENUE_MANAGER" ? "VENUE_MANAGER" : "VENUE_AGENT",
      },
    }));
  }

  function updateStaffDraft(staffId: string, patch: Partial<StaffDraft>) {
    setStaffDrafts((current) => ({
      ...current,
      [staffId]: {
        ...(current[staffId] ?? {
          fullName: "",
          email: "",
          role: "VENUE_AGENT" as const,
        }),
        ...patch,
      },
    }));
  }

  async function saveStaff(staffId: string) {
    const draft = staffDrafts[staffId];
    if (!draft || staffSavingId) return;

    setStaffSavingId(staffId);
    setSaveError(null);
    setSaveSuccess(null);
    setStaffInviteUrl(null);

    try {
      const response = await fetch(`/api/operator/staff/${staffId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update staff user.");
      }
      setStaffUsers(payload.settings?.staffUsers ?? staffUsers);
      setEditingStaffId(null);
      setSaveSuccess("Staff member updated.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to update staff user.");
    } finally {
      setStaffSavingId(null);
    }
  }

  async function removeStaff(staffId: string) {
    if (staffSavingId) return;

    setStaffSavingId(staffId);
    setSaveError(null);
    setSaveSuccess(null);
    setStaffInviteUrl(null);

    try {
      const response = await fetch(`/api/operator/staff/${staffId}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to remove staff user.");
      }
      setStaffUsers(payload.settings?.staffUsers ?? staffUsers.filter((staff) => staff.id !== staffId));
      setSaveSuccess("Staff member removed.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to remove staff user.");
    } finally {
      setStaffSavingId(null);
    }
  }

  async function handleSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    const nativeEvent = event.nativeEvent as SubmitEvent;
    const submitter = nativeEvent.submitter as HTMLButtonElement | null;

    if (submitter && submitter.dataset.submitKind !== "settings-save") {
      return;
    }

    event.preventDefault();
    const form = formRef.current;
    if (!form || isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    setStaffInviteUrl(null);

    try {
      const formData = new FormData(form);
      const response = await fetch("/api/operator/settings", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save venue settings.");
      }
      setSavedAssets(payload.settings?.assets ?? []);
      setStaffUsers(payload.settings?.staffUsers ?? staffUsers);
      if (newStaffNameRef.current) newStaffNameRef.current.value = "";
      if (newStaffEmailRef.current) newStaffEmailRef.current.value = "";
      setIsAddingStaff(false);
      setDraftBottleMenuName(null);
      setDraftFoodMenuName(null);
      setDraftHookahMenuName(null);
      if (payload.staffInviteUrl) {
        setStaffInviteUrl(payload.staffInviteUrl);
        setSaveSuccess("Staff member added. Copy the invite link below.");
      } else {
        setSaveSuccess("Venue settings saved.");
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save venue settings.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <form
        ref={formRef}
        onSubmit={handleSettingsSubmit}
        className="operator-settings-form"
        encType="multipart/form-data"
      >
        <input type="hidden" name="hoursSummary" value={hoursSummary} />

        <div className="operator-settings-layout">
          <div className="operator-settings-subnav-links" role="tablist" aria-label="Settings sections">
            {settingsTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeSection === tab.id}
                className={`operator-settings-tab ${activeSection === tab.id ? "is-active" : ""}`}
                onClick={() => setActiveSection(tab.id)}
              >
                <tab.icon size={22} aria-hidden="true" />
                <span className="operator-settings-tab-copy">
                  <strong>{tab.label}</strong>
                  <span>{tab.detail}</span>
                </span>
              </button>
            ))}
          </div>

          <section
            className={`operator-dashboard-panel operator-settings-card operator-settings-section ${
              activeSection === "venue" ? "" : "is-hidden"
            }`}
          >
            <div className="operator-settings-card-head">
              <div>
                <h3>Venue details <span aria-hidden="true">•</span></h3>
                <p>Keep the venue contact and day-to-day operating details current.</p>
              </div>
            </div>

            <div className="venue-form-grid operator-settings-grid">
              <label className="field field-span-full">
                <span>Address</span>
                <span className="operator-field-control">
                  <MapPin size={18} aria-hidden="true" />
                  <input name="addressLine1" defaultValue={settings.addressLine1 ?? ""} />
                </span>
              </label>

              <div className="form-row form-row-city">
                <label className="field">
                  <span>City</span>
                  <span className="operator-field-control">
                    <Building2 size={18} aria-hidden="true" />
                    <input name="city" defaultValue={settings.city} required />
                  </span>
                </label>
                <label className="field">
                  <span>State</span>
                  <span className="operator-field-control">
                    <MapPin size={18} aria-hidden="true" />
                    <input name="state" maxLength={2} defaultValue={settings.state ?? ""} />
                  </span>
                </label>
                <label className="field">
                  <span>ZIP code</span>
                  <span className="operator-field-control">
                    <Hash size={18} aria-hidden="true" />
                    <input name="postalCode" defaultValue={settings.postalCode ?? ""} />
                  </span>
                </label>
              </div>

              <div className="form-row form-row-contact">
                <label className="field">
                  <span>Phone number</span>
                  <span className="operator-field-control">
                    <Phone size={18} aria-hidden="true" />
                    <input name="phoneNumber" defaultValue={settings.phoneNumber ?? ""} />
                  </span>
                </label>
                <label className="field">
                  <span>Timezone</span>
                  <span className="operator-field-control">
                    <Clock3 size={18} aria-hidden="true" />
                    <select name="timezone" className="select-input" defaultValue={settings.timezone} required>
                      {venueTimezones.map((timezone) => (
                        <option key={timezone.value} value={timezone.value}>
                          {timezone.label}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              </div>

              <div className="field field-span-full operator-hours-field">
                <div className="hours-summary-card operator-hours-summary-card">
                  <div>
                    <span className="operator-hours-icon">
                      <Clock3 size={24} aria-hidden="true" />
                    </span>
                    <strong>Operating hours</strong>
                    <small className="form-helper">Use this to shape expectation-setting across channels.</small>
                  </div>
                  <button
                    type="button"
                    className="operator-secondary-action"
                    onClick={() => setIsHoursModalOpen(true)}
                  >
                    <CalendarDays size={16} aria-hidden="true" />
                    Edit hours
                  </button>
                  <div className="operator-hours-preview">
                    {visibleHours.length > 0 ? (
                      visibleHours.map((item) => (
                        <span key={`${item.day}-${item.range}`}>
                          <strong>{item.day}</strong>
                          {item.range}
                        </span>
                      ))
                    ) : (
                      <span>No hours configured yet</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            className={`operator-dashboard-panel operator-settings-card operator-settings-section ${
              activeSection === "staff" ? "" : "is-hidden"
            }`}
          >
            <div className="operator-settings-card-head">
              <div>
                <h3>Staff <span aria-hidden="true">•</span></h3>
                <p>Manage venue operators.</p>
              </div>
              <button
                type="button"
                className="operator-primary-action operator-add-staff-button"
                onClick={() => setIsAddingStaff((current) => !current)}
              >
                <Plus size={18} aria-hidden="true" />
                Add staff member
              </button>
            </div>

            <div className="operator-settings-staff-panel">
              <div className="operator-staff-table">
                <div className="operator-staff-table-head">
                  <span>Staff member</span>
                  <span>Role</span>
                  <span>Email</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                <div className="operator-staff-table-row operator-staff-table-row-protected">
                  <div className="operator-staff-member-cell">
                    <span className="operator-staff-avatar">
                      {initialsForName(settings.primaryOperatorName || "Primary operator")}
                    </span>
                    <div>
                      <input
                        className="operator-staff-inline-input"
                        name="primaryOperatorName"
                        defaultValue={settings.primaryOperatorName ?? ""}
                        aria-label="Primary operator name"
                      />
                      <span>Primary operator</span>
                    </div>
                  </div>
                  <select
                    name="primaryOperatorRole"
                    className="select-input operator-staff-role-select"
                    defaultValue={settings.primaryOperatorRole ?? "Manager"}
                    aria-label="Primary operator role"
                  >
                    {settings.primaryOperatorRole && !primaryOperatorRoleOptions.includes(settings.primaryOperatorRole) ? (
                      <option value={settings.primaryOperatorRole}>{settings.primaryOperatorRole}</option>
                    ) : null}
                    {primaryOperatorRoleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <input
                    className="operator-staff-inline-input"
                    name="primaryOperatorEmail"
                    type="email"
                    defaultValue={settings.primaryOperatorEmail ?? ""}
                    aria-label="Primary operator email"
                  />
                  <span className="operator-protected-label">
                    <ShieldCheck size={18} aria-hidden="true" />
                    Protected
                  </span>
                  <span className="operator-staff-actions">
                    <span className="operator-staff-action-placeholder">System</span>
                  </span>
                </div>
                {additionalStaff.length > 0 ? (
                  additionalStaff.map((staff) => {
                    const isEditing = editingStaffId === staff.id;
                    const draft = staffDrafts[staff.id] ?? {
                      fullName: staff.fullName,
                      email: staff.email,
                      role: staff.role === "VENUE_MANAGER" ? "VENUE_MANAGER" : "VENUE_AGENT",
                    };

                    return (
                      <div key={staff.id} className="operator-staff-table-row">
                        <div className="operator-staff-member-cell">
                          <span className="operator-staff-avatar">{initialsForName(staff.fullName)}</span>
                          <div>
                            {isEditing ? (
                              <input
                                className="operator-staff-inline-input"
                                value={draft.fullName}
                                onChange={(event) => updateStaffDraft(staff.id, { fullName: event.target.value })}
                                aria-label={`Name for ${staff.fullName}`}
                              />
                            ) : (
                              <strong>{staff.fullName}</strong>
                            )}
                            <span>{roleLabel(staff.role)}</span>
                          </div>
                        </div>
                        <select
                          className="select-input operator-staff-role-select"
                          value={isEditing ? draft.role : staff.role}
                          disabled={!isEditing}
                          onChange={(event) =>
                            updateStaffDraft(staff.id, {
                              role: event.target.value === "VENUE_MANAGER" ? "VENUE_MANAGER" : "VENUE_AGENT",
                            })
                          }
                        >
                          <option value="VENUE_AGENT">{roleLabel("VENUE_AGENT")}</option>
                          <option value="VENUE_MANAGER">{roleLabel("VENUE_MANAGER")}</option>
                        </select>
                        {isEditing ? (
                          <input
                            className="operator-staff-inline-input"
                            type="email"
                            value={draft.email}
                            onChange={(event) => updateStaffDraft(staff.id, { email: event.target.value })}
                            aria-label={`Email for ${staff.fullName}`}
                          />
                        ) : (
                          <span>{staff.email}</span>
                        )}
                        <span className="operator-staff-status">
                          <span aria-hidden="true" />
                        Active
                        </span>
                        <span className="operator-staff-actions">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="operator-primary-action operator-staff-save-button"
                                onClick={() => saveStaff(staff.id)}
                                disabled={staffSavingId === staff.id}
                              >
                                {staffSavingId === staff.id ? "Saving" : "Save"}
                              </button>
                              <button
                                type="button"
                                className="operator-icon-button"
                                onClick={() => setEditingStaffId(null)}
                                aria-label={`Cancel editing ${staff.fullName}`}
                              >
                                <X size={16} aria-hidden="true" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="operator-icon-button"
                                onClick={() => startEditingStaff(staff)}
                                aria-label={`Edit ${staff.fullName}`}
                              >
                                <Pencil size={16} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="operator-icon-button"
                                onClick={() => removeStaff(staff.id)}
                                disabled={staffSavingId === staff.id}
                                aria-label={`Remove ${staff.fullName}`}
                              >
                                <Trash2 size={16} aria-hidden="true" />
                              </button>
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })
                ) : null}
                {additionalStaff.length === 0 ? (
                  <div className="operator-settings-empty-state">
                    <span>No additional staff yet.</span>
                  </div>
                ) : null}
                {isAddingStaff ? (
                  <div className="operator-staff-table-row operator-staff-add-row">
                    <div className="operator-staff-member-cell">
                      <span className="operator-staff-avatar">+</span>
                      <input ref={newStaffNameRef} name="newStaffName" placeholder="Staff name" />
                    </div>
                    <select name="newStaffRole" className="select-input operator-staff-role-select" defaultValue="VENUE_AGENT">
                      <option value="VENUE_AGENT">Host</option>
                      <option value="VENUE_MANAGER">Admin</option>
                    </select>
                    <input ref={newStaffEmailRef} name="newStaffEmail" type="email" placeholder="name@example.com" />
                    <span className="operator-staff-status">
                      <span aria-hidden="true" />
                      New
                    </span>
                    <span className="operator-staff-actions">
                      <button type="submit" className="operator-primary-action" data-submit-kind="settings-save">
                        Save
                      </button>
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section
            className={`operator-dashboard-panel operator-settings-card operator-settings-section ${
              activeSection === "channels" ? "" : "is-hidden"
            }`}
          >
            <div className="operator-settings-card-head">
              <div>
                <h3>Channels</h3>
                <p>Review the channels that can create guest conversations for this venue.</p>
              </div>
            </div>

            <div className="operator-dashboard-panel operator-drawer-hero">
              <span className="panel-label">Configured services</span>
              <div className="operator-services-grid" aria-label="Configured services">
                {configuredChannels.map((channel) => (
                  <label
                    key={channel.value}
                    className={`hours-toggle operator-service-option ${channel.selected ? "is-selected" : ""}`}
                  >
                    <span className="operator-service-leading">
                      <input type="checkbox" checked={channel.selected} readOnly tabIndex={-1} />
                      <span className="operator-service-icon" aria-hidden="true">
                        {channelIcon(channel.value)}
                      </span>
                    </span>
                    <span className="operator-service-label">{channel.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="detail-list">
              <div className="detail-row detail-row-audit">
                <div className="detail-row-copy">
                  <strong>Website chat status</strong>
                  <small>
                    {websiteChatAvailable
                      ? "Admin has enabled Website Chat for this venue."
                      : "A platform admin needs to enable Website Chat before setup can continue."}
                  </small>
                </div>
                <strong>{websiteChatAvailable ? "Ready" : "Blocked"}</strong>
              </div>

              {settings.websiteChatAllowedOrigins ? (
                <div className="detail-row detail-row-audit">
                  <div className="detail-row-copy">
                    <strong>Allowed origins</strong>
                    <small>{settings.websiteChatAllowedOrigins}</small>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="operator-dashboard-panel">
              <span className="panel-label">Install snippet</span>
              <strong>Paste this into the venue website just before the closing body tag.</strong>
              <p>Once installed, incoming chats will land in the normal operator inbox.</p>
            </div>

            <label className="field">
              <span>Snippet</span>
              <textarea
                ref={installSnippetRef}
                rows={6}
                readOnly
                value={settings.websiteChatInstallSnippet ?? ""}
              />
            </label>

            <div className="action-row">
              {!settings.websiteChatInstallSnippet && websiteChatAvailable ? (
                <button
                  type="submit"
                  formAction={generateOperatorWebsiteChatSnippetAction}
                  className="operator-primary-action"
                >
                  Generate snippet
                </button>
              ) : null}

              <button
                type="button"
                className="operator-primary-action"
                onClick={copyInstallSnippet}
                disabled={!settings.websiteChatInstallSnippet}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied" : "Copy snippet"}
              </button>

              {websiteChatTestUrl ? (
                <a className="operator-secondary-action" href={websiteChatTestUrl}>
                  Open test page
                </a>
              ) : null}
            </div>
          </section>

          <section
            className={`operator-dashboard-panel operator-settings-card operator-settings-section ${
              activeSection === "menus" ? "" : "is-hidden"
            }`}
          >
            <div className="operator-settings-card-head">
              <div>
                <h3>Menus</h3>
                <p>Keep guest-facing spend context current for bottle service, food, and hookah.</p>
              </div>
            </div>

            <div className="operator-knowledge-upload-grid">
              <div className="operator-dashboard-panel operator-knowledge-upload-card">
                <div className="operator-settings-inline-note">
                  <strong>Bottle menu</strong>
                  <span>{bottleMenuAsset ? `Current file: ${bottleMenuAsset.fileName}` : "Upload a PDF or image."}</span>
                </div>
                <AssetPreview asset={bottleMenuAsset} />
                {draftBottleMenuName ? (
                  <div className="operator-settings-inline-note">
                    <strong>Selected now</strong>
                    <span>{draftBottleMenuName} pending save</span>
                  </div>
                ) : null}
                <label className="field field-span-full">
                  <span>Upload bottle menu</span>
                  <input
                    name="bottleMenuFile"
                    type="file"
                    accept=".pdf,image/*"
                    onChange={(event) => setDraftBottleMenuName(event.target.files?.[0]?.name ?? null)}
                  />
                </label>
              </div>

              <div className="operator-dashboard-panel operator-knowledge-upload-card">
                <label className="detail-row detail-row-audit">
                  <div className="detail-row-copy">
                    <strong>Food service</strong>
                    <small>Enable this if guests can order food at the venue.</small>
                  </div>
                  <input
                    type="checkbox"
                    name="servesFood"
                    checked={servesFood}
                    onChange={(event) => setServesFood(event.target.checked)}
                  />
                </label>
                <div className="operator-settings-inline-note">
                  <strong>Food menu</strong>
                  <span>
                    {foodMenuAsset
                      ? `Current file: ${foodMenuAsset.fileName}`
                      : servesFood
                        ? "Upload a PDF or image."
                        : "Enable food service first."}
                  </span>
                </div>
                <AssetPreview asset={foodMenuAsset} />
                {draftFoodMenuName ? (
                  <div className="operator-settings-inline-note">
                    <strong>Selected now</strong>
                    <span>{draftFoodMenuName} pending save</span>
                  </div>
                ) : null}
                <label className="field field-span-full">
                  <span>Upload food menu</span>
                  <input
                    name="foodMenuFile"
                    type="file"
                    accept=".pdf,image/*"
                    disabled={!servesFood}
                    onChange={(event) => setDraftFoodMenuName(event.target.files?.[0]?.name ?? null)}
                  />
                </label>
              </div>

              <div className="operator-dashboard-panel operator-knowledge-upload-card">
                <label className="detail-row detail-row-audit">
                  <div className="detail-row-copy">
                    <strong>Hookah service</strong>
                    <small>Enable this if hookah is available for sale.</small>
                  </div>
                  <input
                    type="checkbox"
                    name="servesHookah"
                    checked={servesHookah}
                    onChange={(event) => setServesHookah(event.target.checked)}
                  />
                </label>
                <div className="operator-settings-inline-note">
                  <strong>Hookah menu</strong>
                  <span>
                    {hookahMenuAsset
                      ? `Current file: ${hookahMenuAsset.fileName}`
                      : servesHookah
                        ? "Upload a PDF or image."
                        : "Enable hookah service first."}
                  </span>
                </div>
                <AssetPreview asset={hookahMenuAsset} />
                {draftHookahMenuName ? (
                  <div className="operator-settings-inline-note">
                    <strong>Selected now</strong>
                    <span>{draftHookahMenuName} pending save</span>
                  </div>
                ) : null}
                <label className="field field-span-full">
                  <span>Upload hookah menu</span>
                  <input
                    name="hookahMenuFile"
                    type="file"
                    accept=".pdf,image/*"
                    disabled={!servesHookah}
                    onChange={(event) => setDraftHookahMenuName(event.target.files?.[0]?.name ?? null)}
                  />
                </label>
              </div>
            </div>
          </section>

          <section
            className={`operator-dashboard-panel operator-settings-card operator-settings-section ${
              activeSection === "policies" ? "" : "is-hidden"
            }`}
          >
            <div className="operator-settings-card-head">
              <div>
                <h3>Policies</h3>
                <p>Set the rules the AI host and staff should use when guiding guests.</p>
              </div>
            </div>

            <div className="venue-form-grid operator-settings-grid">
              <label className="field field-span-full">
                <span>Deposit policy</span>
                <textarea name="depositPolicy" rows={4} defaultValue={settings.depositPolicy} required />
              </label>

              <label className="field field-span-full">
                <span>Dress code summary</span>
                <textarea
                  name="dressCodeSummary"
                  rows={3}
                  defaultValue={settings.dressCodeSummary ?? ""}
                  placeholder="Upscale nightlife attire encouraged. No athletic wear, tank tops, or flip flops."
                />
              </label>

              <label className="field field-span-full">
                <span>Age policy summary</span>
                <textarea
                  name="agePolicySummary"
                  rows={2}
                  defaultValue={settings.agePolicySummary ?? ""}
                  placeholder="21+ with valid government-issued ID."
                />
              </label>

              <div className="field field-span-full">
                <span>Arrival logistics</span>
                <div className="detail-list">
                  <label className="detail-row detail-row-audit">
                    <div className="detail-row-copy">
                      <strong>Parking available</strong>
                      <small>Lets guests know whether they can park on-site or nearby.</small>
                    </div>
                    <input
                      type="checkbox"
                      name="hasParking"
                      checked={hasParking}
                      onChange={(event) => setHasParking(event.target.checked)}
                    />
                  </label>
                  <label className="detail-row detail-row-audit">
                    <div className="detail-row-copy">
                      <strong>Valet available</strong>
                      <small>Use this if the venue offers valet at any point during service.</small>
                    </div>
                    <input
                      type="checkbox"
                      name="hasValet"
                      checked={hasValet}
                      onChange={(event) => setHasValet(event.target.checked)}
                    />
                  </label>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="action-row">
          <button
            type="submit"
            className="operator-primary-action action-button"
            data-submit-kind="settings-save"
            disabled={isSaving}
          >
            <Save size={17} aria-hidden="true" />
            {isSaving ? "Saving..." : "Save venue settings"}
          </button>
        </div>
        {saveSuccess ? <p className="form-success">{saveSuccess}</p> : null}
        {staffInviteUrl ? (
          <div className="operator-invite-link-card">
            <span>Invite link</span>
            <code>{staffInviteUrl}</code>
            <button
              type="button"
              className="operator-secondary-action"
              onClick={() => navigator.clipboard?.writeText(staffInviteUrl)}
            >
              Copy link
            </button>
          </div>
        ) : null}
        {saveError ? <p className="form-error">{saveError}</p> : null}
      </form>

      {isHoursModalOpen ? (
        <div className="modal-scrim" role="presentation" onClick={() => setIsHoursModalOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="operator-hours-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="operator-panel-header">
              <div>
                <span className="panel-label">Operating hours</span>
                <h2 id="operator-hours-modal-title">Configure schedule</h2>
              </div>
              <button
                type="button"
                className="operator-icon-button"
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
                    <label className="operator-hours-day-toggle">
                      <input
                        type="checkbox"
                        checked={item.open}
                        onChange={(event) => updateHours(day.key, { open: event.target.checked })}
                      />
                      <span className="operator-hours-day-label">{day.label}</span>
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
                className="operator-primary-action"
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
