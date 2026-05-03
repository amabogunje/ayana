import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(input: {
  appUrl: string;
  widgetKey?: string | null;
  venueName?: string | null;
}) {
  const appUrl = input.appUrl.replace(/\/+$/, "");
  const title = input.widgetKey ? `${input.venueName ?? "Venue"} Website Chat Test` : "Website Chat Test Setup";
  const snippet = input.widgetKey
    ? `<script async src="${appUrl}/api/widget.js?v=2" data-widget-key="${input.widgetKey}"></script>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f3f4f6;
        --card: #ffffff;
        --ink: #111827;
        --muted: #4b5563;
        --line: #d1d5db;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Georgia, "Times New Roman", serif;
        background:
          radial-gradient(circle at top left, rgba(251, 191, 36, 0.18), transparent 28%),
          linear-gradient(180deg, #f8fafc 0%, var(--bg) 100%);
        color: var(--ink);
      }
      main {
        max-width: 760px;
        margin: 0 auto;
        padding: 72px 24px 120px;
      }
      .card {
        background: var(--card);
        border: 1px solid rgba(17, 24, 39, 0.08);
        border-radius: 24px;
        padding: 28px;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
      }
      h1 {
        margin: 0 0 12px;
        font-size: clamp(2.2rem, 6vw, 4.8rem);
        line-height: 0.95;
        letter-spacing: -0.04em;
      }
      p {
        margin: 0 0 16px;
        font-size: 18px;
        line-height: 1.6;
        color: var(--muted);
      }
      code, pre {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      pre {
        margin: 18px 0 0;
        padding: 16px;
        border-radius: 16px;
        overflow: auto;
        background: #111827;
        color: #f9fafb;
        font-size: 13px;
        line-height: 1.6;
      }
      .eyebrow {
        display: inline-block;
        margin-bottom: 18px;
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #92400e;
      }
      .meta {
        margin-top: 18px;
        padding-top: 18px;
        border-top: 1px solid var(--line);
        font-size: 14px;
        color: var(--muted);
      }
      a { color: #111827; }
    </style>
    ${snippet}
  </head>
  <body>
    <main>
      <section class="card">
        <span class="eyebrow">Website Chat Test</span>
        <h1>${escapeHtml(title)}</h1>
        ${
          input.widgetKey
            ? `<p>This page is intentionally simple and acts like a mock venue landing page. The website chat snippet is already installed here, so you should see the floating chat launcher in the lower-right corner.</p>
        <p>Use this to test the end-to-end guest intake path without touching a real venue site yet.</p>
        <div class="meta">
          <div><strong>Venue:</strong> ${escapeHtml(input.venueName ?? "Unknown")}</div>
          <div><strong>Widget key:</strong> <code>${escapeHtml(input.widgetKey)}</code></div>
        </div>
        <pre>${escapeHtml(snippet)}</pre>`
            : `<p>No enabled website chat widget key was found automatically.</p>
        <p>Enable website chat in operator settings for a venue, then reload this page or pass a widget key manually with <code>?widgetKey=wc_...</code>.</p>
        <div class="meta">
          <div><strong>Example:</strong> <code>${escapeHtml(`${appUrl}/api/test/website-chat-page?widgetKey=wc_example`)}</code></div>
        </div>`
        }
      </section>
    </main>
  </body>
</html>`;
}

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const requestedWidgetKey = request.nextUrl.searchParams.get("widgetKey");

  const configuredVenue = requestedWidgetKey
    ? await prisma.venue.findFirst({
        where: {
          websiteChatWidgetKey: requestedWidgetKey,
        },
        select: {
          name: true,
          websiteChatWidgetKey: true,
        },
      })
    : await prisma.venue.findFirst({
        where: {
          websiteChatEnabled: true,
          websiteChatWidgetKey: {
            not: null,
          },
          status: {
            in: ["PILOT", "ACTIVE"],
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
        select: {
          name: true,
          websiteChatWidgetKey: true,
        },
      });

  const html = buildHtml({
    appUrl,
    widgetKey: configuredVenue?.websiteChatWidgetKey ?? requestedWidgetKey,
    venueName: configuredVenue?.name,
  });

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
