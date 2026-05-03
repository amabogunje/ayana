# Website Chat MVP Plan

## Why this shape

Website chat should be the first real intake channel because it is the lowest-cost, fastest, and most controllable channel we can launch. The core system should remain inquiry-centric and channel-agnostic, with website chat implemented as the first public adapter into the existing operator inbox.

## Current architecture fit

- `Inquiry` is already the shared work object for intake, qualification, quote, deposit, and reservation.
- `InquiryMessage` is already the shared message timeline used in operator inquiry detail.
- `operator-service.ts` already provides one venue-scoped inbox, quote workflow, reservation workflow, alerts, and activity logging.
- The missing layer is channel session/config state for a live website conversation.

## Minimum schema changes

### `Channel`

Add `WEBSITE_CHAT` so website leads enter the same inquiry pipeline as all other channels.

### `Venue`

Add only the config needed to turn website chat on for a specific venue:

- `websiteChatEnabled`
- `websiteChatWidgetKey`
- `websiteChatAllowedOrigins`
- `websiteChatWelcomeMessage`
- `websiteChatPromptPlaceholder`

This keeps configuration venue-scoped without introducing a heavier generic channel-config system too early.

### `WebsiteChatSession`

Add a new session table for the live web conversation:

- `venueId`
- `inquiryId` as a unique 1:1 mapping for MVP
- `sessionToken`
- guest contact fields
- origin metadata
- timestamps

This is the only new runtime table needed to support live website messaging.

## End-to-end intake flow

1. Venue enables website chat in operator settings and installs the hosted script snippet on their site.
2. The snippet loads a hosted iframe widget from TableCapture using the venue widget key.
3. The widget fetches public venue chat config.
4. The guest completes a lightweight intake form inside the widget:
   - name
   - phone
   - requested date/night
   - party size
   - spend intent
   - optional occasion
   - first message
5. `POST /api/public/chat/start` creates:
   - one `Inquiry` with `channel=WEBSITE_CHAT`
   - one initial `InquiryMessage`
   - one `WebsiteChatSession`
6. The inquiry appears immediately in the existing operator inbox.
7. The operator works the inquiry in the same detail page, quote flow, reservation flow, and alert system already used for other channels.
8. Operator replies continue to create `InquiryMessage` rows.
9. The widget polls `GET /api/public/chat/sessions/[token]/messages` and renders new operator messages back into the live website chat.

## Inquiry and message mapping

- One website chat session maps to one inquiry in the MVP.
- All guest and operator messages remain `InquiryMessage` rows.
- `WebsiteChatSession` only stores transport/session metadata, not a second message system.

That preserves one shared pipeline and avoids a parallel chat product.

## Widget architecture

Hosted widget model:

- Install snippet: `/api/widget.js`
- Hosted iframe UI: `/widget/[widgetKey]`
- Public config API: `/api/public/widget/[widgetKey]`
- Public session start API: `/api/public/chat/start`
- Public session message API:
  - `GET /api/public/chat/sessions/[sessionToken]/messages`
  - `POST /api/public/chat/sessions/[sessionToken]/messages`

Why hosted iframe first:

- cheapest to ship
- easiest to control and update centrally
- avoids venue-specific frontend integration work
- isolates widget UI and API behavior from customer sites

## Install and configuration model

Venue config lives in operator settings:

- enable/disable website chat
- allowed website origins
- welcome message
- input placeholder
- generated install snippet

Install step for venues:

```html
<script async src="https://your-tablecapture-app.com/api/widget.js" data-widget-key="wc_..." ></script>
```

## Operator reply delivery

For MVP, operator replies are delivered through polling:

- operator sends a reply in the existing inquiry detail screen
- reply is stored as an `InquiryMessage`
- website widget polls every few seconds
- new operator messages appear in the chat thread

This is the fastest viable loop. We can later upgrade the transport to SSE or websockets without changing the inquiry model.

## Public API surface

- `GET /api/public/widget/[widgetKey]`
- `POST /api/public/chat/start`
- `GET /api/public/chat/sessions/[sessionToken]/messages`
- `POST /api/public/chat/sessions/[sessionToken]/messages`
- `GET /api/widget.js`
- `GET /widget/[widgetKey]`

## MVP build order

1. Add schema support for `WEBSITE_CHAT`, venue config, and website chat sessions.
2. Add public config, session start, and message APIs.
3. Reuse the existing operator inbox and inquiry detail for website chat inquiries.
4. Add venue settings UI for enablement, origins, and install snippet.
5. Ship hosted iframe widget with structured intake + polling replies.
6. Add follow-up improvements only after end-to-end flow works:
   - transcript metadata
   - better qualification prompts
   - realtime delivery
   - contact capture refinements

## Deliberate MVP non-goals

- WhatsApp
- Instagram
- SMS
- Voice
- generic channel framework abstraction beyond what website chat actually needs today
- full realtime infra on day one
- AI-driven freeform extraction before basic structured intake is live
