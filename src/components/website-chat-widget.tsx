"use client";

import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  authorRole: string;
  content: string;
  createdAt: string;
};

type WidgetConfig = {
  venueName: string;
  welcomeMessage: string;
  promptPlaceholder: string;
  introPrompt: string;
};

function storageKey(widgetKey: string) {
  return `tablecapture:website-chat:${widgetKey}`;
}

function dedupeMessages(items: ChatMessage[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

type MessageAsset = {
  url: string;
  label: string;
};

function extractMessageAssets(content: string): MessageAsset[] {
  const urlMatches = content.match(/(?:https?:\/\/[^\s]+|\/uploads\/venue-assets\/[^\s]+)/g) ?? [];
  return urlMatches.map((url) => ({
    url,
    label:
      /bottle/i.test(content) ? "View bottle menu"
      : /food/i.test(content) ? "View food menu"
      : /hookah/i.test(content) ? "View hookah menu"
      : /flyer|event/i.test(content) ? "View event flyer"
      : "Open attachment",
  }));
}

function stripAssetUrls(content: string) {
  return content.replace(/(?:https?:\/\/[^\s]+|\/uploads\/venue-assets\/[^\s]+)/g, "").replace(/\s{2,}/g, " ").trim();
}

export function WebsiteChatWidget({
  widgetKey,
  origin,
}: {
  widgetKey: string;
  origin?: string;
}) {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.sessionStorage.getItem(storageKey(widgetKey)),
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [assistantPending, setAssistantPending] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [composer, setComposer] = useState("");
  const threadRef = useRef<HTMLDivElement | null>(null);
  const sendInFlightRef = useRef(false);
  const startInFlightRef = useRef(false);

  const querySuffix = useMemo(
    () => (origin ? `?origin=${encodeURIComponent(origin)}` : ""),
    [origin],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const response = await fetch(`/api/public/widget/${widgetKey}${querySuffix}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load website chat.");
        }

        if (!cancelled) {
          setConfig(payload.config);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load website chat.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadConfig();
    return () => {
      cancelled = true;
    };
  }, [widgetKey, querySuffix]);

  useEffect(() => {
    if (!sessionToken) {
      return;
    }

    let cancelled = false;

    async function loadMessages() {
      try {
        const response = await fetch(`/api/public/chat/sessions/${sessionToken}/messages${querySuffix}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load messages.");
        }

        if (!cancelled) {
          setMessages(dedupeMessages(payload.session.messages));
          setAssistantPending(false);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load messages.");
        }
      }
    }

    loadMessages();
    const interval = window.setInterval(loadMessages, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [sessionToken, querySuffix]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;

    thread.scrollTo({
      top: thread.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, assistantPending]);

  async function refreshMessages(token: string) {
    const response = await fetch(`/api/public/chat/sessions/${token}/messages${querySuffix}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to refresh messages.");
    }

    setMessages(dedupeMessages(payload.session.messages));
    setAssistantPending(false);
  }

  async function startChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!guestName.trim() || sending || startInFlightRef.current) {
      return;
    }

    startInFlightRef.current = true;
    setSending(true);
    setError(null);

    try {
      const response = await fetch("/api/public/chat/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          widgetKey,
          origin,
          guestName: guestName.trim(),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to start chat.");
      }

      window.sessionStorage.setItem(storageKey(widgetKey), payload.session.sessionToken);
      setSessionToken(payload.session.sessionToken);
      setMessages(dedupeMessages(payload.session.messages));
      setComposer("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to start chat.");
    } finally {
      startInFlightRef.current = false;
      setSending(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionToken || !composer.trim() || sending || assistantPending || sendInFlightRef.current) {
      return;
    }

    const content = composer.trim();
    sendInFlightRef.current = true;
    setSending(true);
    setComposer("");
    setAssistantPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/public/chat/sessions/${sessionToken}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          origin,
          content,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to send message.");
      }

      await refreshMessages(sessionToken);
    } catch (submitError) {
      setComposer(content);
      setAssistantPending(false);
      setError(submitError instanceof Error ? submitError.message : "Unable to send message.");
    } finally {
      sendInFlightRef.current = false;
      setSending(false);
    }
  }

  function resetChat() {
    window.sessionStorage.removeItem(storageKey(widgetKey));
    setSessionToken(null);
    setMessages([]);
    setComposer("");
    setAssistantPending(false);
  }

  return (
    <main style={styles.shell}>
      <section style={styles.card}>
        <header style={styles.header}>
          <div>
            <strong style={styles.title}>{config?.venueName ?? "Venue chat"}</strong>
            <p style={styles.subtitle}>{config?.welcomeMessage ?? "Loading chat..."}</p>
          </div>
          {sessionToken ? (
            <button type="button" style={styles.resetButton} onClick={resetChat}>
              New chat
            </button>
          ) : null}
        </header>

        {loading ? <p style={styles.state}>Loading chat...</p> : null}
        {error ? <p style={{ ...styles.state, color: "#b91c1c" }}>{error}</p> : null}

        {!loading && !sessionToken && config ? (
          <section style={styles.startPanel}>
            <div style={styles.heroCopy}>
              <p style={styles.kicker}>Start the conversation</p>
              <h1 style={styles.heroTitle}>Chat with {config.venueName}</h1>
              <p style={styles.heroText}>
                We’ll help with tables, availability, pricing, and next steps. Start with your name and the chat will take it from there.
              </p>
            </div>

            <form onSubmit={startChat} style={styles.form}>
              <input
                style={styles.input}
                placeholder="Your name"
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                required
              />
              <button style={styles.button} type="submit" disabled={sending}>
                {sending ? "Starting..." : "Start chat"}
              </button>
            </form>
          </section>
        ) : null}

        {!loading && sessionToken ? (
          <>
            <div ref={threadRef} style={styles.thread}>
              {messages.map((message) => (
                (() => {
                  const assets = extractMessageAssets(message.content);
                  const textContent = stripAssetUrls(message.content);

                  return (
                    <article
                      key={message.id}
                      style={{
                        ...styles.message,
                        ...(message.authorRole === "guest" ? styles.guestMessage : styles.operatorMessage),
                      }}
                    >
                      <strong style={styles.messageLabel}>
                        {message.authorRole === "guest" ? "You" : config?.venueName ?? "Venue"}
                      </strong>
                      {textContent ? <p style={styles.messageCopy}>{textContent}</p> : null}
                      {assets.length > 0 ? (
                        <div style={styles.assetList}>
                          {assets.map((asset) => (
                            <a
                              key={`${message.id}-${asset.url}`}
                              href={asset.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                ...styles.assetButton,
                                ...(message.authorRole === "guest" ? styles.guestAssetButton : styles.operatorAssetButton),
                              }}
                            >
                              {asset.label}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })()
              ))}
              {assistantPending ? (
                <article style={{ ...styles.message, ...styles.operatorMessage, ...styles.pendingMessage }}>
                  <strong style={styles.messageLabel}>{config?.venueName ?? "Venue"}</strong>
                  <p style={styles.messageCopy}>
                    {sending ? "Sending your message..." : "One moment, checking the venue packages..."}
                  </p>
                </article>
              ) : null}
            </div>

            <form onSubmit={sendMessage} style={styles.composer}>
              <textarea
                style={styles.textarea}
                placeholder={
                  config?.promptPlaceholder ??
                  "Tell us the date, group size, and vibe you’re looking for"
                }
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                disabled={sending || assistantPending}
              />
              <button
                style={{
                  ...styles.button,
                  ...(sending || assistantPending || !composer.trim() ? styles.disabledButton : {}),
                }}
                type="submit"
                disabled={sending || assistantPending || !composer.trim()}
              >
                {sending ? "Sending..." : assistantPending ? "Waiting..." : "Send"}
              </button>
            </form>
          </>
        ) : null}
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    margin: 0,
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, rgba(248, 113, 113, 0.18), transparent 28%), linear-gradient(180deg, #fff7ed 0%, #f8fafc 100%)",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    color: "#111827",
  },
  card: {
    display: "flex",
    minHeight: "100vh",
    flexDirection: "column",
    background: "rgba(255,255,255,0.96)",
    backdropFilter: "blur(12px)",
  },
  header: {
    padding: "18px 18px 16px",
    borderBottom: "1px solid #e5e7eb",
    background: "#111827",
    color: "#ffffff",
    display: "flex",
    gap: "12px",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: {
    display: "block",
    fontSize: "16px",
    fontWeight: 700,
  },
  subtitle: {
    margin: "6px 0 0",
    fontSize: "13px",
    lineHeight: 1.5,
    color: "#e5e7eb",
  },
  resetButton: {
    border: "1px solid rgba(255,255,255,0.24)",
    borderRadius: "999px",
    padding: "8px 10px",
    background: "rgba(255,255,255,0.08)",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: "12px",
    whiteSpace: "nowrap",
  },
  state: {
    padding: "20px",
    fontSize: "14px",
  },
  startPanel: {
    display: "grid",
    gap: "24px",
    padding: "24px 20px 28px",
    alignContent: "center",
    flex: 1,
  },
  heroCopy: {
    display: "grid",
    gap: "10px",
  },
  kicker: {
    margin: 0,
    fontSize: "12px",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#9a3412",
  },
  heroTitle: {
    margin: 0,
    fontSize: "32px",
    lineHeight: 1,
    letterSpacing: "-0.04em",
  },
  heroText: {
    margin: 0,
    fontSize: "15px",
    lineHeight: 1.6,
    color: "#4b5563",
  },
  form: {
    display: "grid",
    gap: "12px",
  },
  input: {
    width: "100%",
    border: "1px solid #d1d5db",
    borderRadius: "14px",
    padding: "14px 16px",
    fontSize: "15px",
    background: "#ffffff",
  },
  textarea: {
    width: "100%",
    minHeight: "88px",
    border: "1px solid #d1d5db",
    borderRadius: "14px",
    padding: "12px 14px",
    fontSize: "14px",
    resize: "vertical",
    background: "#ffffff",
  },
  button: {
    border: 0,
    borderRadius: "14px",
    padding: "13px 16px",
    background: "#111827",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  disabledButton: {
    cursor: "not-allowed",
    opacity: 0.62,
  },
  thread: {
    display: "grid",
    gap: "12px",
    padding: "18px",
    alignContent: "start",
    flex: 1,
    overflowY: "auto",
    background: "linear-gradient(180deg, #fff7ed 0%, #f9fafb 35%)",
  },
  message: {
    maxWidth: "90%",
    borderRadius: "18px",
    padding: "12px 14px",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
  },
  guestMessage: {
    justifySelf: "end",
    background: "#111827",
    color: "#ffffff",
  },
  operatorMessage: {
    justifySelf: "start",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
  },
  pendingMessage: {
    opacity: 0.82,
    fontStyle: "italic",
  },
  messageLabel: {
    display: "block",
    marginBottom: "6px",
    fontSize: "12px",
    color: "inherit",
    opacity: 0.7,
  },
  messageCopy: {
    margin: 0,
    whiteSpace: "pre-wrap",
    lineHeight: 1.5,
    fontSize: "14px",
  },
  assetList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginTop: "10px",
  },
  assetButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    padding: "8px 12px",
    textDecoration: "none",
    fontSize: "13px",
    fontWeight: 700,
  },
  operatorAssetButton: {
    background: "#fff7ed",
    border: "1px solid #fdba74",
    color: "#9a3412",
  },
  guestAssetButton: {
    background: "rgba(255,255,255,0.14)",
    border: "1px solid rgba(255,255,255,0.24)",
    color: "#ffffff",
  },
  composer: {
    display: "grid",
    gap: "12px",
    padding: "14px 18px 18px",
    borderTop: "1px solid #e5e7eb",
    background: "rgba(255,255,255,0.96)",
  },
};
