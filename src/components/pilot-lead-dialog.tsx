"use client";

import { ChangeEvent, FormEvent, useEffect, useId, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";

const roleOptions = [
  { value: "owner", label: "Owner" },
  { value: "manager", label: "Manager" },
  { value: "promoter", label: "Promoter" },
  { value: "other", label: "Other" },
];

type SubmissionState = "idle" | "submitting" | "success" | "error";

export function PilotLeadDialog() {
  const titleId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.body.classList.add("lead-dialog-open");
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("lead-dialog-open");
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function openDialog() {
    setIsOpen(true);
    setSubmissionState("idle");
    setErrorMessage("");
    setPhone("");
  }

  function formatPhoneNumber(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    const areaCode = digits.slice(0, 3);
    const prefix = digits.slice(3, 6);
    const lineNumber = digits.slice(6, 10);

    if (digits.length > 6) {
      return `(${areaCode}) ${prefix}-${lineNumber}`;
    }

    if (digits.length > 3) {
      return `(${areaCode}) ${prefix}`;
    }

    if (digits.length > 0) {
      return `(${areaCode}`;
    }

    return "";
  }

  function handlePhoneChange(event: ChangeEvent<HTMLInputElement>) {
    setPhone(formatPhoneNumber(event.target.value));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmissionState("submitting");
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/public/pilot-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: formData.get("fullName"),
          email: formData.get("email"),
          phone: formData.get("phone"),
          venueName: formData.get("venueName"),
          role: formData.get("role"),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Unable to submit pilot request.");
      }

      setSubmissionState("success");
    } catch (error) {
      setSubmissionState("error");
      setErrorMessage(error instanceof Error ? error.message : "Unable to submit pilot request.");
    }
  }

  return (
    <>
      <button type="button" className="landing-button landing-button-primary landing-pilot-cta" onClick={openDialog}>
        Start a 30-day pilot
        <ArrowRight size={18} />
      </button>

      {isOpen ? (
        <div className="lead-dialog-backdrop" role="presentation">
          <section className="lead-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <button type="button" className="lead-dialog-close" aria-label="Close pilot request form" onClick={() => setIsOpen(false)}>
              <X size={20} />
            </button>

            <div className="lead-dialog-header">
              <h2 id={titleId}>Start your 30-day Ayana pilot</h2>
              <p>Share a few details and we&apos;ll help you start the process.</p>
              <span>Response within 48 hours</span>
            </div>

            {submissionState === "success" ? (
              <div className="lead-dialog-success">
                <span className="lead-dialog-success-icon">
                  <Check size={30} />
                </span>
                <h3>Thanks! We&apos;ll follow up within 48 hours.</h3>
                <p>Keep an eye on your inbox.</p>
              </div>
            ) : (
              <form className="lead-dialog-form" onSubmit={handleSubmit}>
                <label>
                  <span>Full name <strong>*</strong></span>
                  <input name="fullName" type="text" autoComplete="name" required minLength={2} />
                </label>

                <label>
                  <span>Email <strong>*</strong></span>
                  <input name="email" type="email" autoComplete="email" required />
                </label>

                <label>
                  <span>Phone number <em>optional</em></span>
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="(555) 123-4567"
                    value={phone}
                    onChange={handlePhoneChange}
                  />
                </label>

                <label>
                  <span>Company or venue name</span>
                  <input name="venueName" type="text" autoComplete="organization" />
                </label>

                <label>
                  <span>Role</span>
                  <select name="role" defaultValue="">
                    <option value="">
                      Select your role
                    </option>
                    {roleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {submissionState === "error" ? <p className="lead-dialog-error">{errorMessage}</p> : null}

                <button type="submit" className="landing-button landing-button-primary" disabled={submissionState === "submitting"}>
                  {submissionState === "submitting" ? "Submitting..." : "Submit"}
                </button>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
