# Agent Architecture Refactor

This document is the shared handoff source for refactoring TableCapture from a website-chat-centered assistant into a multi-tenant AI agent platform for venue customer operations.

Each implementation phase should be handled in its own thread. Before starting a phase, read this document first, implement the requested phase only, and update this document with completed work, key decisions, changed files, tests run, and notes for the next phase.

## North Star

The target product is an AI booking and customer operations agent for venues, with human-supervised autonomy.

In product language, each venue gets its own AI booking agent. In engineering terms, this should be a shared multi-tenant agent runtime with venue-scoped configuration, knowledge, permissions, memory, and auditability.

The system should evolve from:

```text
website chat widget -> website chat service -> website chat agent
```

to:

```text
channel adapter -> normalized conversation event -> shared agent runtime -> policy checks -> tool calls -> persisted state/actions -> channel response
```

## Architectural Principles

- Preserve current website chat behavior by default during the refactor.
- Introduce architecture gradually; avoid a risky rewrite.
- Keep website chat APIs and widget behavior compatible unless a phase explicitly changes them.
- Keep business actions behind explicit tools rather than embedding side effects in prompt/result handling.
- Let the LLM suggest intent, wording, and candidate actions; let policy code decide what is allowed.
- Make venue-specific behavior data/config driven, not copied into separate code paths.
- Log agent runs and tool calls so operators and platform admins can inspect what happened.
- Prefer structured controls for configuration UI over raw prompt editing.
- Treat human handoff as a first-class state, not just a text response.
- Keep tests focused on policy, state, tool permissions, and customer-facing behavior.

## Target Layers

### 1. Channel Layer

Thin adapters for customer entry points:

- Website chat
- SMS
- Instagram DM
- WhatsApp
- Email
- Voice, later if useful
- Operator dashboard messages

Channels should normalize inbound messages into a common internal event shape and should not own sales logic.

### 2. Conversation Orchestration Layer

Owns conversation state, customer intent, next best action, escalation decisions, and whether the AI or a human is allowed to respond.

Desired loop:

```text
Receive event
Load conversation, venue, customer, and agent config context
Classify intent/state
Plan next step
Check policy
Call tools as needed
Verify results
Generate response
Persist messages, state, tool calls, and follow-ups
Notify operator if needed
```

### 3. Tool Layer

Explicit business tools with stable contracts, validation, permissions, and logging.

Expected tools include:

- searchVenueKnowledge
- getTableOptions
- recommendPackage
- createQuote
- createReservation
- createDepositCheckout
- sendDepositLink
- scheduleFollowUp
- assignHumanOperator
- summarizeConversation
- updateCustomerProfile
- markLeadStatus

### 4. Memory And Customer Profile Layer

Long-term memory should be structured separately from chat transcripts.

Potential future data:

- Customer name
- Phone, email, social handles
- Past bookings
- Preferred nights or table types
- Average spend
- VIP status
- Objections
- No-show or payment history
- Communication preferences
- Consent status

### 5. Human Operations Layer

Operators should be able to supervise, take over, release back to AI, approve actions, edit quotes, and inspect the agent's reasoning/action trail.

## Venue Agent Model

There should be one shared agent runtime for the whole system, with one configured agent instance/persona per venue.

```text
Shared Agent Runtime
  -> Venue Agent Config: Blue Martini
  -> Venue Agent Config: Cuba Libre
  -> Venue Agent Config: Rooftop Lounge
```

Venue-scoped configuration should control:

- Agent name
- Brand voice
- Autonomy level
- Allowed actions
- Enabled channels
- Escalation rules
- Follow-up rules
- Table/package behavior
- Advanced instructions, if needed

## Autonomy Levels

The system should support increasing levels of venue trust:

```text
Level 0: Draft only, human must send
Level 1: Answer FAQs automatically
Level 2: Qualify leads and recommend packages
Level 3: Send approved quotes/deposit links
Level 4: Create reservations automatically
Level 5: Full autopilot except escalations
```

Exact enum names can be refined during implementation, but the architecture should allow venue-specific autonomy.

## Proposed Folder Direction

```text
src/lib/conversation/
  conversation-types.ts
  conversation-state.ts
  message-normalizer.ts

src/lib/agent/
  agent-runner.ts
  agent-types.ts
  agent-prompts.ts
  agent-policies.ts

src/lib/agent-tools/
  tool-types.ts
  venue-knowledge-tool.ts
  table-options-tool.ts
  quote-tool.ts
  reservation-tool.ts
  deposit-tool.ts
  handoff-tool.ts
  follow-up-tool.ts

src/lib/venue-agent/
  venue-agent-types.ts
  venue-agent-config-service.ts
```

This structure is directional, not sacred. Prefer the repo's existing patterns when implementation reveals a better fit.

## Current Important Files

- `src/lib/website-chat-agent.ts`
- `src/lib/website-chat-service.ts`
- `src/components/website-chat-widget.tsx`
- `src/app/api/public/chat/start/route.ts`
- `src/app/api/public/chat/sessions/[sessionToken]/messages/route.ts`
- `src/lib/venue-knowledge-service.ts`
- `src/lib/deposit-checkout.ts`
- `prisma/schema.prisma`
- `tests/integration/website-chat-service.test.ts`
- `tests/integration/website-chat-evals.test.ts`
- `tests/deployment/website-chat-evals-report.test.ts`

## Preserve During Refactor

- Website chat session creation
- Website chat message send/list APIs
- Origin/session access checks
- Duplicate AI reply protection
- Venue knowledge answers from configured data only
- Closed-night guardrails
- Configured table/package guardrails
- Draft quote creation when ready
- Reservation/deposit creation when ready
- Human handoff behavior
- Activity logging
- Existing eval intent where applicable

## Phase Checklist

### Phase 1: Architectural Boundaries

Create new folders and shared type modules without changing runtime behavior.

Target status: Completed on 2026-05-16.

### Phase 2: Extract Agent Tools

Move embedded business actions from `website-chat-agent.ts` into explicit `agent-tools` modules while preserving behavior.

Target status: Completed on 2026-05-16.

### Phase 3: Agent Run And Tool Call Logging

Add persistent `AgentRun` and `AgentToolCall` observability and instrument website chat agent execution.

Target status: Completed on 2026-05-16.

### Phase 4: Venue Agent Configuration

Add venue-scoped agent configuration with safe defaults and low-risk runtime integration.

Target status: Completed on 2026-05-16.

### Phase 5: Policy Layer

Move hardcoded safety/business rules into `agent-policies.ts` and enforce policy before side-effecting actions.

Target status: Completed on 2026-05-16.

### Phase 6: Website Chat As Channel Adapter

Route website chat through a shared normalized conversation event and agent runtime while preserving public API compatibility.

Target status: Completed on 2026-05-16.

### Phase 7: Conversation State Machine

Introduce shared conversation states and transition rules, initially compatible with existing inquiry statuses.

Target status: Completed on 2026-05-16.

### Phase 8: Agent Configuration UI

Build operator/admin UI for identity, autonomy, handoff rules, channel settings, and advanced instructions.

Target status: Completed on 2026-05-16.

### Phase 9: Follow-Up Workflows

Add workflow task infrastructure for unpaid deposit reminders, abandoned chat follow-up, operator alerts, and similar future work.

Target status: Completed on 2026-05-16.

### Phase 10: Expanded Evals

Expand tests/evals around shared runtime, policy, state machine, venue config, permissions, duplicate prevention, and website chat compatibility.

Target status: Completed on 2026-05-16.

## Phase Handoff Template

At the end of each phase, update this section or append a new dated note.

```text
Phase:
Status:
Summary:
Key decisions:
Files changed:
Tests run:
Behavior preserved:
Behavior changed:
Known gaps:
Next phase notes:
```

```text
Phase: Phase 1 - Architectural Boundaries
Status: Completed on 2026-05-16
Summary: Added the initial shared conversation, agent, agent-tool, and venue-agent module boundaries as lightweight type-first scaffolding. The current website chat runtime remains untouched and continues to own production behavior.
Key decisions: Kept all new modules compile-safe and dependency-light; avoided Prisma/schema changes; avoided wiring the new runner into website chat; used compatibility helpers for current website chat concepts such as inquiry statuses, message roles, venue brand tone, and enabled website chat channel config.
Files changed:
- src/lib/conversation/conversation-types.ts
- src/lib/conversation/conversation-state.ts
- src/lib/conversation/message-normalizer.ts
- src/lib/agent/agent-types.ts
- src/lib/agent/agent-runner.ts
- src/lib/agent/agent-prompts.ts
- src/lib/agent/agent-policies.ts
- src/lib/agent-tools/tool-types.ts
- src/lib/venue-agent/venue-agent-types.ts
- src/lib/venue-agent/venue-agent-config-service.ts
- docs/agent-architecture-refactor.md
Tests run:
- npm run typecheck
- npm run lint
- npm run build
- npm run test:chat-evals:deploy
Behavior preserved: Website chat APIs, widget behavior, service flow, website-chat-agent execution, Prisma schema, quote/deposit creation, handoff behavior, duplicate reply protection, and activity logging were not changed.
Behavior changed: None intended.
Known gaps: New shared modules are not yet wired into runtime flow or persistent storage; tool modules are type contracts only; policy helpers are initial config checks and do not yet enforce the existing website-chat business rules.
Next phase notes: Phase 2 should extract embedded business actions from src/lib/website-chat-agent.ts into concrete agent-tools modules while preserving current behavior and tests. Start with stable contracts for venue knowledge lookup, table option selection, draft quote creation, reservation/deposit creation, and human handoff.
```

```text
Phase: Phase 2 - Extract Agent Tools
Status: Completed on 2026-05-16
Summary: Extracted the first concrete agent tool modules for venue knowledge lookup, table option qualification/recommendation, draft quote creation, reservation creation, deposit checkout creation, handoff next-action formatting, and website-chat agent activity/diagnostic logging. The website chat agent now calls these compatibility tools while preserving its existing planning, prompt, post-processing, persistence, and public API behavior.
Key decisions: Kept website-chat-agent.ts as the runtime orchestrator for this phase; avoided prompt redesigns and schema/model changes; used structural tool input types so current website chat context can call tools without a broad domain rewrite; left closed-night and configured-package guardrails in the agent but passed their result into quote/reservation tools to preserve behavior exactly.
Files changed:
- src/lib/website-chat-agent.ts
- src/lib/agent-tools/activity-log-tool.ts
- src/lib/agent-tools/deposit-tool.ts
- src/lib/agent-tools/handoff-tool.ts
- src/lib/agent-tools/quote-tool.ts
- src/lib/agent-tools/reservation-tool.ts
- src/lib/agent-tools/table-options-tool.ts
- src/lib/agent-tools/venue-knowledge-tool.ts
- docs/agent-architecture-refactor.md
Tests run:
- npm run typecheck
- npm run lint
- npm run test:chat-evals
- npm run test:db:push
- npx vitest run tests/integration/website-chat-service.test.ts
- npm run build
Behavior preserved: Website chat session APIs, widget behavior, duplicate AI reply protection, venue knowledge sourcing, package guardrails, closed-night quote/reservation prevention, draft quote creation, reservation/deposit checkout creation, handoff status/next-action behavior, and activity logging actions/summaries were preserved.
Behavior changed: None intended.
Known gaps: Tool calls are not yet persisted as AgentToolCall records; tools still use website-chat compatibility shapes rather than final shared runtime contracts; prompt generation and policy enforcement remain inside website-chat-agent.ts; deterministic reply helpers remain local until a later runtime/channel extraction phase.
Next phase notes: Phase 3 should add AgentRun and AgentToolCall persistence/observability around these extracted tool calls without changing behavior. Use the new tool module boundaries as instrumentation points, and keep logging resilient if observability writes fail.
```

```text
Phase: Phase 3 - Agent Run And Tool Call Logging
Status: Completed on 2026-05-16
Summary: Added persistent AgentRun and AgentToolCall Prisma models, generated the Prisma client, pushed the updated schema to the test database, and instrumented website chat agent execution with resilient run/tool-call logging. Runs now record website chat source/channel, model, status, intent/objective/mode, confidence, final action, result summary, errors, timestamps, and duration. Tool calls now record the extracted tool name, input/output summaries, status/error, timestamps, and duration.
Key decisions: Used two models only and skipped AgentStep for now; stored summaries instead of raw prompts, payment details, checkout URLs, API keys, or secrets; made observability writes best-effort so logging failures are reported to server logs but do not block the customer-facing agent flow; treated no-op tool outcomes as SKIPPED where appropriate.
Files changed:
- prisma/schema.prisma
- src/lib/agent/agent-observability.ts
- src/lib/website-chat-agent.ts
- tests/helpers/db.ts
- tests/integration/website-chat-agent-observability.test.ts
- docs/agent-architecture-refactor.md
Tests run:
- npx prisma generate
- npm run test:db:push
- npm run typecheck
- npm run lint
- npx vitest run tests/integration/website-chat-agent-observability.test.ts
- npx vitest run tests/integration/website-chat-service.test.ts
- npm run test:chat-evals
- npm run build
Behavior preserved: Website chat replies, session APIs, duplicate reply protection, fallback behavior, quote/reservation/deposit side effects, handoff behavior, and existing ActivityLog writes remain in place.
Behavior changed: New AgentRun and AgentToolCall rows are written for website chat agent execution, including skipped duplicate runs and skipped no-op tools.
Known gaps: Observability is not yet exposed in an operator/admin UI; tool input/output data is intentionally summarized rather than fully replayable; createDepositCheckout is logged as a safe checkout outcome around the reservation/deposit result rather than storing payment-provider details.
Next phase notes: Phase 4 should introduce venue-scoped agent configuration with safe defaults and can attach config identifiers or snapshots to AgentRun later if needed. Keep future config logging summary-based and avoid raw advanced prompt leakage.
```

```text
Phase: Phase 4 - Venue Agent Configuration
Status: Completed on 2026-05-16
Summary: Added a persistent VenueAgentConfig model and expanded the venue-agent config service so each venue can have scoped AI agent settings with compatibility defaults. Website chat now loads the venue agent config, uses its brandVoice as the runtime tone fallback, and checks safe permissions before quote/reservation/deposit side effects.
Schema changes:
- Added Venue.agentConfig relation.
- Added VenueAgentConfig with venueId, enabled, agentName, brandVoice, autonomyLevel, action permission booleans, confidenceThreshold, escalationRules JSON, followUpRules JSON, advancedInstructions, enabledChannels, and timestamps.
Config defaults:
- enabled=true when Venue.aiEnabled is true or unset.
- agentName="{Venue name} Concierge".
- brandVoice=Venue.brandTone, falling back to "polished, concise, and helpful".
- autonomyLevel=5 to preserve current website chat quote/reservation/deposit behavior.
- canAnswerFaqs/canQualifyLeads/canRecommendPackages/canCreateQuotes/canSendDepositLinks/canCreateReservations all default true.
- confidenceThreshold=0.5, matching existing escalation prompt guidance.
- enabledChannels includes WEBSITE_CHAT when website chat is enabled.
- escalationRules preserve the current low-confidence/VIP/unavailable/oversized escalation assumptions.
- followUpRules default disabled.
Files changed:
- prisma/schema.prisma
- src/lib/venue-agent/venue-agent-types.ts
- src/lib/venue-agent/venue-agent-config-service.ts
- src/lib/website-chat-agent.ts
- tests/helpers/db.ts
- tests/integration/venue-agent-config-service.test.ts
- docs/agent-architecture-refactor.md
Tests run:
- npx prisma generate
- npm run test:db:push
- npm run typecheck
- npm run lint
- npx vitest run tests/integration/venue-agent-config-service.test.ts
- npx vitest run tests/integration/website-chat-agent-observability.test.ts tests/integration/website-chat-service.test.ts
- npm run test:chat-evals
- npm run build
Behavior preserved: Existing venues without a persisted VenueAgentConfig continue to use current website chat behavior, including FAQ answers, lead qualification, package recommendations, draft quotes, deposit links, and reservation creation.
Behavior changed: Persisted venue configs can now disable website chat automation or block quote/reservation/deposit actions; defaults do not change current behavior.
Known gaps: No UI exists for editing VenueAgentConfig; enabledChannels is stored as a comma-separated string for now; escalationRules/followUpRules are persisted but not deeply enforced yet; advancedInstructions is stored but not injected into prompts in this phase.
Next phase notes: Phase 5 should move policy decisions into agent-policies.ts and enforce the new VenueAgentConfig controls more centrally before side-effecting tools. Consider logging config id or config summary on AgentRun once policy enforcement is consolidated.
```

```text
Phase: Phase 5 - Policy Layer
Status: Completed on 2026-05-16
Summary: Expanded src/lib/agent/agent-policies.ts into a structured policy layer and wired website chat agent execution through policy decisions before recommendation, quote, reservation, deposit, and escalation-sensitive response actions. The LLM/fallback can still suggest intent and wording, but policy now decides whether the action is allowed, blocked, or escalated.
Policies moved into code:
- No booking or quote creation for closed nights.
- No quote-ready unconfigured package recommendations.
- Possible invented discounts/comps/deals are blocked and rewritten back to configured package framing.
- Configured capacity limits are checked before action.
- Parties larger than configured capacity escalate to a human.
- Explicit human requests escalate to a human.
- Low confidence escalates using VenueAgentConfig.confidenceThreshold.
- Phone is required before reservation/deposit link creation.
- VenueAgentConfig autonomy/tool permissions gate package, quote, reservation, and deposit actions.
- Enabled channel checks gate website chat response/tool actions.
Files changed:
- src/lib/agent/agent-policies.ts
- src/lib/website-chat-agent.ts
- tests/integration/agent-policies.test.ts
- docs/agent-architecture-refactor.md
Tests run:
- npm run typecheck
- npm run lint
- npx vitest run tests/integration/agent-policies.test.ts
- npx vitest run tests/integration/website-chat-agent-observability.test.ts tests/integration/website-chat-service.test.ts tests/integration/venue-agent-config-service.test.ts
- npm run test:chat-evals
- npm run build
Behavior preserved: Default venue config still allows existing website chat behavior, including configured knowledge answers, package recommendations, draft quote creation, reservation/deposit creation when qualified, duplicate protection, and handoff behavior.
Behavior changed: Safety/business blocks now come from policy decisions before side-effecting tools. Low-confidence model output below the configured threshold now escalates even if the prompt did not set handoff.
Remaining prompt-only rules: Tone/style guidance, concise reply shape, "answer latest question first," and some sales sequencing instructions still live in the prompt/reply post-processing and should move gradually as the runtime/channel layers mature.
Known gaps: Policy decisions are summarized in tool-call input strings but not yet stored as first-class policy audit rows; discount detection is regex-based and conservative; follow-up policy and advanced instruction policy are not enforced yet; some reply repair helpers remain local to website-chat-agent.ts.
Next phase notes: Phase 6 should turn website chat into a channel adapter by normalizing inbound messages into shared conversation events and routing through the shared agent runtime while preserving public API compatibility. Carry the policy layer forward as the runtime enforcement point.
```

```text
Phase: Phase 6 - Website Chat As Channel Adapter
Status: Completed on 2026-05-16
Summary: Website chat guest messages now flow through shared conversation normalization and the shared agent runtime entrypoint before reaching the existing website-chat-compatible executor. This creates the channel adapter boundary without changing public API responses, widget behavior, or the proven website chat agent internals.
New flow:
- Website chat API/service keeps origin/session/rate-limit checks.
- Guest message is persisted exactly as before.
- Website chat service builds a normalized website_chat ConversationEvent and ConversationSnapshot.
- runSharedAgentRuntime receives the normalized event.
- For website_chat/message_received, the shared runtime delegates to the existing website chat executor with inquiryId and guestMessageId.
- Existing website chat persistence, duplicate reply protection, policy checks, tool calls, AgentRun/AgentToolCall logging, and response updates remain intact.
API compatibility notes: start/list/send response shapes are unchanged; the widget still polls and renders the same message records; origin/session checks remain in website-chat-service; duplicate reply protection remains in website-chat-agent and is preserved by passing guestMessageId through event metadata.
Files changed:
- src/lib/conversation/message-normalizer.ts
- src/lib/agent/agent-types.ts
- src/lib/agent/agent-runner.ts
- src/lib/website-chat-service.ts
- tests/integration/conversation-runtime-adapter.test.ts
- docs/agent-architecture-refactor.md
Tests run:
- npm run typecheck
- npm run lint
- npx vitest run tests/integration/conversation-runtime-adapter.test.ts
- npx vitest run tests/integration/website-chat-agent-observability.test.ts tests/integration/website-chat-service.test.ts tests/integration/venue-agent-config-service.test.ts tests/integration/agent-policies.test.ts
- npm run test:chat-evals
- npm run build
Behavior preserved: Website chat API contracts, widget behavior, session creation, message send/list, origin/session access checks, duplicate reply protection, venue knowledge answers, quote/deposit/reservation behavior, handoff behavior, policy enforcement, and observability logging are preserved.
Behavior changed: None intended for website chat users; internally, addWebsiteChatGuestMessage now routes through normalized events and runSharedAgentRuntime.
Known gaps: The shared runtime still delegates website_chat to the compatibility executor rather than owning all planning/persistence directly; non-website channels remain blocked/no-op; ConversationSnapshot is built from current Inquiry fields and does not yet have its own durable conversation table; start-session opening messages are not yet routed through the shared runtime.
Next phase notes: Phase 7 should introduce the shared conversation state machine and transition rules, initially mapping current InquiryStatus values and website chat transitions into explicit conversation lifecycle decisions.
```

```text
Phase: Phase 7 - Conversation State Machine
Status: Completed on 2026-05-16
Summary: Introduced a shared conversation state machine in src/lib/conversation/conversation-state.ts, expanded the shared conversation state enum to the new lifecycle, mapped legacy Inquiry.status values into the new model, and routed website chat post-message status decisions through the shared compatibility state machine before persisting legacy inquiry statuses.
Key decisions:
- Kept database changes at zero for this phase; no dedicated conversation-state column was added yet.
- Treated the new state machine as the shared runtime source of truth while continuing to persist the existing Inquiry.status values for operator/admin compatibility.
- Used uppercase shared states to align with the requested target states and existing Prisma enum style.
- Added compatibility mapping so legacy Inquiry.status values continue to drive current operator pages and reports:
  - NEW -> NEW
  - QUALIFYING -> QUALIFYING
  - QUOTED -> QUOTED
  - DEPOSIT_SENT -> DEPOSIT_PENDING
  - CONFIRMED -> BOOKED
  - NEEDS_HUMAN -> NEEDS_HUMAN
  - LOST -> LOST
- Added compatibility mapping back to persisted inquiry statuses:
  - DEPOSIT_PENDING -> DEPOSIT_SENT
  - BOOKED -> CONFIRMED
  - HUMAN_ACTIVE -> NEEDS_HUMAN
  - FOLLOW_UP_SCHEDULED -> preserves current persisted inquiry status
  - CLOSED -> preserves terminal persisted status when possible
- Wired the website chat agent to derive the next conversation state through deriveConversationStateAfterAgentTurn rather than hardcoding next inquiry statuses inline.
Files changed:
- src/lib/conversation/conversation-types.ts
- src/lib/conversation/conversation-state.ts
- src/lib/website-chat-agent.ts
- tests/integration/conversation-runtime-adapter.test.ts
- tests/unit/conversation-state.test.ts
- docs/agent-architecture-refactor.md
Tests run:
- npm run typecheck
- npm run lint
- npm run build
- Attempted: npx vitest run tests/unit/conversation-state.test.ts tests/integration/conversation-runtime-adapter.test.ts
Known gaps:
- Vitest could not be executed in this Codex Windows environment because Vite config startup hit a spawn EPERM process error.
- HUMAN_ACTIVE, FOLLOW_UP_SCHEDULED, LOST->CLOSED, and CLOSED recovery transitions are defined in the shared state machine but are not yet actively driven by channel runtimes or UI flows.
- The shared conversation state is not yet persisted separately from Inquiry.status, so some richer lifecycle nuance still collapses back into legacy persisted statuses for compatibility.
- AgentRun observability does not yet store final shared conversation state as a dedicated field.
Next phase notes:
- Phase 8 should expose operator/admin configuration for autonomy, handoff, and channel behavior without depending on a DB migration for shared conversation state yet.
- When follow-up workflows arrive in Phase 9, FOLLOW_UP_SCHEDULED should become an actively used runtime state with durable workflow linkage.
- Phase 10 should add broader eval coverage for state-machine-driven runtime outcomes, especially around handoff, deposit pending, booked, and closed-loop recovery behavior.
```

```text
Phase: Phase 8 - Agent Configuration UI
Status: Completed on 2026-05-16
Summary: Added an operator-facing AI agent settings page that lets venue owners/managers configure identity, brand voice, autonomy level, allowed actions, handoff rules, website chat channel access, advanced instructions, save, reset defaults, and a lightweight preview/test panel.
Routes added:
- /operator/settings/agent
Config fields supported:
- enabled
- agentName
- brandVoice
- autonomyLevel
- canAnswerFaqs
- canQualifyLeads
- canRecommendPackages
- canCreateQuotes
- canSendDepositLinks
- canCreateReservations
- confidenceThreshold
- escalationRules.escalateOnLowConfidence
- escalationRules.escalateForVipRequests
- escalationRules.escalateForUnavailableInventory
- escalationRules.escalateForOversizedParty
- escalationRules.partySizeThreshold
- enabledChannels for WEBSITE_CHAT
- advancedInstructions
Key decisions:
- Used the existing operator settings/auth patterns and gated the page/actions with ai:control.
- Kept the UI structured and operator-focused; advanced instructions are available but not the primary interaction.
- Reused the existing VenueAgentConfig model rather than adding schema changes.
- Added server-side validation in operator-service before writing config values.
- Added a minimal conversation-state compatibility allowance for same-turn website-chat quote/deposit progress so existing chat eval behavior remains intact after Phase 7.
Files changed:
- src/app/operator/settings/agent/page.tsx
- src/components/operator-agent-settings-form.tsx
- src/app/operator/settings/page.tsx
- src/app/operator/actions.ts
- src/lib/operator-service.ts
- src/lib/operator-types.ts
- src/lib/venue-agent/venue-agent-types.ts
- src/lib/venue-agent/venue-agent-config-service.ts
- src/lib/conversation/conversation-state.ts
- src/app/globals.css
- tests/integration/operator-service.test.ts
- tests/unit/conversation-state.test.ts
- docs/agent-architecture-refactor.md
Tests run:
- npm run typecheck
- npm run lint
- npx vitest run tests/integration/operator-service.test.ts tests/integration/venue-agent-config-service.test.ts
- npx vitest run tests/unit/conversation-state.test.ts tests/integration/operator-service.test.ts tests/integration/venue-agent-config-service.test.ts
- npm run test:chat-evals
- npm run build
Behavior preserved:
- Existing website chat public API, widget behavior, defaults, action permissions, policy checks, and observability behavior remain unchanged by default.
- Existing venues without custom config continue to receive compatibility defaults.
Behavior changed:
- Operators with ai:control can now persist venue agent configuration from /operator/settings/agent.
- The main operator settings page links to the AI agent settings page for users with ai:control.
- Conversation state transitions now allow same-turn NEW->QUOTED and direct deposit-pending progress when the website chat agent qualifies and prepares an action in one turn.
Known gaps:
- No system-admin venue-level agent page was added in this phase.
- The preview panel is static plus an optional website chat test-page link; it does not run a sandboxed agent simulation yet.
- Follow-up rules remain stored as defaults and are not editable in this UI.
- The party size threshold is persisted in escalationRules for future policy/runtime use, but the current policy still primarily relies on configured table/package capacity.
- Lint still reports pre-existing warnings in operator-settings-form.tsx and website-chat-agent.ts.
Next phase notes:
- Phase 9 should add durable follow-up workflow tasks and can extend this UI with follow-up controls once the workflow model exists.
- A later observability/admin phase should expose AgentRun/AgentToolCall inspection near this configuration surface.
```

```text
Phase: Phase 9 - Follow-Up Workflows
Status: Completed on 2026-05-16
Summary: Added durable workflow task infrastructure for future agent-driven follow-ups, including unpaid deposit reminders, abandoned chat follow-ups, operator alerts, stale quote expiration, and post-booking confirmation. The website chat agent now schedules unpaid deposit reminder tasks only when the venue's followUpRules explicitly enable reminders.
Workflow model/service changes:
- Added WorkflowTaskType enum with UNPAID_DEPOSIT_REMINDER, ABANDONED_CHAT_FOLLOW_UP, OPERATOR_ALERT, STALE_QUOTE_EXPIRATION, and POST_BOOKING_CONFIRMATION.
- Added WorkflowTaskStatus enum with PENDING, COMPLETED, CANCELLED, and FAILED.
- Added WorkflowTask with venueId, inquiryId, customerId, type, status, scheduledFor, payload, attempts, lastError, completedAt, cancelledAt, createdAt, and updatedAt.
- Added workflow service functions to create, cancel, bulk-cancel pending inquiry tasks, complete, fail, schedule unpaid deposit reminders, schedule abandoned chat follow-ups, and process due tasks.
- Added an agent follow-up tool adapter around the workflow service.
- Added a conservative worker function that creates operator-visible ActivityLog and Alert records for due tasks instead of sending external customer messages.
- Added deposit-success cleanup so pending unpaid deposit reminders are cancelled when a deposit is paid before the reminder is due.
Key decisions:
- Follow-up scheduling is disabled by default through VenueAgentConfig.followUpRules, preserving current website chat behavior.
- Due task processing is explicit and not cron-wired yet; no background process sends messages automatically.
- The unpaid deposit worker checks reservation payment status before alerting, avoiding stale operator noise.
- Workflow payloads store summaries and business identifiers, not payment details or secrets.
Files changed:
- prisma/schema.prisma
- src/lib/workflow-tasks.ts
- src/lib/agent-tools/follow-up-tool.ts
- src/lib/website-chat-agent.ts
- src/app/api/public/deposits/[reservationId]/success/route.ts
- tests/helpers/db.ts
- tests/integration/workflow-tasks.test.ts
- tests/integration/website-chat-agent-observability.test.ts
- docs/agent-architecture-refactor.md
Tests run:
- npx prisma generate
- npm run test:db:push
- npm run typecheck
- npm run lint
- npx vitest run tests/integration/workflow-tasks.test.ts tests/integration/venue-agent-config-service.test.ts tests/integration/website-chat-agent-observability.test.ts
- npx vitest run tests/integration/website-chat-agent-observability.test.ts tests/integration/workflow-tasks.test.ts
- npm run test:chat-evals
- npm run build
Behavior preserved:
- Existing venues do not schedule follow-up tasks by default because followUpRules.enabled remains false.
- Website chat response shapes, widget behavior, duplicate reply protection, quote/reservation/deposit behavior, and existing eval outcomes remain compatible.
Behavior changed:
- Venues with persisted followUpRules.enabled=true and unpaidDepositReminderHours set now get a pending UNPAID_DEPOSIT_REMINDER WorkflowTask after a deposit checkout link is created.
- Completed deposit payments cancel pending unpaid deposit reminder workflow tasks for that inquiry.
Known gaps:
- No production cron/queue endpoint is wired to processDueWorkflowTasks yet.
- Worker processing creates operator-visible alerts/logs only; it does not send SMS/email/DM reminders to customers.
- Abandoned chat follow-up scheduling is available as a service/tool function but is not automatically triggered by inactivity yet.
- Follow-up rules are not editable in the Phase 8 UI yet.
- No dedicated operator WorkflowTask inbox exists; tasks surface through alerts/activity when processed.
- npm run lint still reports pre-existing warnings in operator-settings-form.tsx and website-chat-agent.ts.
Next phase notes:
- Phase 10 should add broader eval coverage for workflow scheduling defaults, enabled reminder behavior, and due-task processing.
- A future workflow phase should add a cron/API runner, operator task UI, and customer-message delivery adapters with consent/rate-limit safeguards.
```

```text
Phase: Phase 10 - Expanded Evals
Status: Completed on 2026-05-16
Summary: Expanded deterministic coverage around the shared website-chat runtime, policy layer, venue config defaults, tool permissions, duplicate prevention, eval scoring, and report generation. The website chat eval harness continues to exercise the public website chat service path, which now routes through the shared conversation normalizer and agent runner.
Coverage added:
- Added architecture-flow integration coverage for website chat API compatibility through the shared runtime, configured package recommendation, no invented pricing/discount language, phone-required-before-deposit behavior, closed-night refusal, duplicate AI reply prevention, and duplicate quote/reservation prevention.
- Added policy tests for VIP/custom escalation and deposit blocking when venue config or tool permissions disable deposit-link actions.
- Added venue config tests for disabled website chat channel defaults and venue-specific config differences.
- Added eval scoring for invented discounts/comps/waived fees and asserted that the report includes the new no_invented_discount check.
- Added deploy-report coverage with a longer timeout that matches the shared runtime and observability work now exercised by the report path.
Key decisions:
- Kept evals deterministic by using scripted guest turns and deterministic fallback behavior unless explicit OpenAI eval flags are enabled.
- Kept website chat evals routed through startWebsiteChatSession/addWebsiteChatGuestMessage/listWebsiteChatMessages so they verify public API compatibility and the shared runtime path together.
- Tightened closed-night response enforcement for booking messages that include a phone number, while preserving venue-knowledge answers for standalone info questions.
- Kept duplicate protections as behavior assertions rather than snapshots.
Files changed:
- src/lib/agent/agent-policies.ts
- src/lib/agent/agent-runner.ts
- src/lib/chat-evals/scoring.ts
- src/lib/website-chat-agent.ts
- tests/deployment/website-chat-evals-report.test.ts
- tests/integration/agent-policies.test.ts
- tests/integration/venue-agent-config-service.test.ts
- tests/integration/website-chat-architecture-flows.test.ts
- tests/integration/website-chat-evals.test.ts
- reports/chat-evals/latest.json
- docs/agent-architecture-refactor.md
Tests run:
- npx vitest run tests/integration/agent-policies.test.ts tests/integration/venue-agent-config-service.test.ts tests/integration/website-chat-architecture-flows.test.ts
- npx vitest run tests/unit/conversation-state.test.ts tests/integration/conversation-runtime-adapter.test.ts tests/integration/website-chat-service.test.ts tests/integration/website-chat-agent-observability.test.ts tests/integration/workflow-tasks.test.ts
- npm run typecheck
- npm run test:chat-evals
- npm run lint
- npm run build
- npm run test:chat-evals:deploy
Behavior preserved:
- Public website chat API response shapes and widget-facing behavior remain compatible.
- Duplicate reply protection and duplicate quote/reservation prevention remain in place.
- Existing venues keep default permissions and config behavior unless a venue-specific config changes them.
Behavior changed:
- Closed-night booking messages that include a phone number now persist a closed-night refusal reply instead of a deposit-close reply, matching the already-enforced quote/reservation policy.
- Eval reports now include a no_invented_discount check.
Known gaps:
- Current scripted eval report passes 5 of 13 scenarios with an average score of 80; several lower-scoring scenarios remain useful product-quality targets rather than architecture blockers.
- LLM-backed guest and judge eval modes are still opt-in via environment flags.
- Workflow-task eval coverage remains focused on service behavior; abandoned-chat inactivity scheduling still needs production trigger coverage once cron/queue wiring exists.
- npm run lint still reports pre-existing warnings in operator-settings-form.tsx and website-chat-agent.ts.
Recommended next work:
- Improve the failing scripted eval scenarios with targeted conversational behavior fixes, especially hesitation, handoff, and recovery flows.
- Add operator-facing inspection for AgentRun, AgentToolCall, and WorkflowTask records so failures found by evals are easier to debug.
- Add production cron/API wiring for due workflow tasks before enabling customer-facing follow-up delivery.
```

```text
Phase: Hardening Phase 11 - Runtime Enforcement For Venue Agent Configuration
Status: Completed on 2026-05-16
Summary: Hardened venue agent configuration so persisted UI controls now map directly to runtime policy and tool behavior. Empty persisted enabledChannels remain disabled, autonomy level now gates tool permissions, action toggles are enforced by policy, FAQ/qualification/package/quote/deposit/reservation behavior is blocked or escalated when disabled, and partySizeThreshold is enforced in addition to configured table capacity.
Key decisions:
- Kept behavior-preserving defaults for venues without a persisted VenueAgentConfig.
- Centralized autonomy/tool derivation in venue-agent-config-service.ts and action decisions in agent-policies.ts.
- Treated disabled FAQ/qualification/customer-reply settings as safe handoff conditions instead of request failures.
- Kept Level 3 deposit-link permission distinct from Level 4 reservation permission, while the current website-chat combined reservation/deposit action still requires reservation permission before it can create a checkout-backed reservation.
- Tightened website chat policy classification so booking messages containing phone/number are not treated as FAQ-only questions.
Files changed:
- src/lib/venue-agent/venue-agent-config-service.ts
- src/lib/agent/agent-policies.ts
- src/lib/website-chat-agent.ts
- tests/integration/venue-agent-config-service.test.ts
- tests/integration/agent-policies.test.ts
- tests/integration/website-chat-architecture-flows.test.ts
- docs/agent-architecture-refactor.md
Tests run:
- npm run typecheck
- npx vitest run tests/integration/agent-policies.test.ts tests/integration/venue-agent-config-service.test.ts tests/integration/website-chat-architecture-flows.test.ts
- npm run test:chat-evals
- npx vitest run tests/unit/conversation-state.test.ts tests/integration/conversation-runtime-adapter.test.ts tests/integration/website-chat-service.test.ts tests/integration/website-chat-agent-observability.test.ts tests/integration/workflow-tasks.test.ts
- npm run lint
- npm run build
Behavior preserved:
- Default venue configs still allow existing website chat behavior, quote creation, reservation/deposit creation, package recommendations, and FAQ answering.
- Public website chat API and widget response shapes remain compatible.
- Disabled or blocked controls now produce handoff/no-action behavior rather than runtime errors.
Behavior changed:
- Persisted enabledChannels="" now means no enabled channels instead of silently falling back to website_chat.
- Autonomy Level 0 blocks autonomous customer replies and routes to human handoff.
- Autonomy Level 1 allows FAQ-style response only; non-FAQ lead qualification is handed off.
- Autonomy Level 2 allows qualification/package recommendation but blocks quote/deposit/reservation actions.
- Autonomy Level 3 allows quote and deposit-link permissions, but website chat's current combined reservation/deposit action still cannot create a checkout reservation unless reservation creation is also allowed.
- Autonomy Level 4+ allows reservation creation when all other safety policies pass.
- canAnswerFaqs, canQualifyLeads, canRecommendPackages, canCreateQuotes, canSendDepositLinks, and canCreateReservations now materially affect runtime policy decisions.
- escalationRules.partySizeThreshold now escalates oversized parties even when configured table capacity is higher.
Known gaps:
- The current website chat reservation/deposit tool is still a combined action, so Level 3 cannot send a deposit link without also creating a reservation record. A future tool split should separate quote approval, deposit-link generation, and reservation creation if Level 3 is meant to operate without reservation creation.
- Operator UI copy may need to clarify that Level 3 deposit-link behavior is constrained by the current reservation-backed checkout implementation.
- npm run lint still reports pre-existing warnings in operator-settings-form.tsx and website-chat-agent.ts.
Next phase notes:
- Split createReservationDeposit into separate createReservation and createDepositCheckout/sendDepositLink execution paths if the product wants Level 3 deposit links without autonomous reservation creation.
- Add an operator/admin inspection surface for blocked policy decisions so venues can understand why a config setting caused handoff.
- Consider adding dedicated eval scenarios for each autonomy level once the Level 3 deposit/reservation distinction is clarified.
```

```text
Phase: Hardening Phase 12 - Truthful Agent Configuration UI
Status: Completed on 2026-05-16
Summary: Updated the operator AI agent settings UI so visible controls accurately describe the Phase 11 runtime behavior. The page now distinguishes venue-level website chat availability from agent website chat permission, shows autonomy as the runtime ceiling, labels action toggles with their required autonomy levels and effective status, and marks advanced instructions as stored but inactive.
Key decisions:
- Kept action toggles editable even when autonomy currently limits them, but made the UI explicit that autonomy wins at runtime.
- Showed effective action chips in the preview rather than raw persisted permission booleans.
- Clarified that Level 3 deposit links are permitted by config but website chat checkout still depends on the current reservation-backed implementation.
- Kept advancedInstructions visible as stored data but disabled the textarea and submitted a hidden field so existing stored text is preserved on save.
- Did not build observability/run-inspection UI in this phase.
Files changed:
- src/components/operator-agent-settings-form.tsx
- src/app/globals.css
- tests/unit/operator-agent-settings-form.test.tsx
- docs/agent-architecture-refactor.md
Tests run:
- npm run typecheck
- npx vitest run tests/unit/operator-agent-settings-form.test.tsx tests/integration/operator-service.test.ts
- npx vitest run tests/unit/operator-agent-settings-form.test.tsx tests/integration/operator-service.test.ts tests/integration/venue-agent-config-service.test.ts tests/integration/agent-policies.test.ts
- npm run lint
- npm run build
Behavior preserved:
- Save/reset routes and server-side validation remain unchanged.
- Editable identity, brand voice, autonomy, action permissions, handoff rules, confidence threshold, party size threshold, and agent website chat permission continue to persist through the existing operator actions.
- Existing advancedInstructions values are preserved on save even though the field is not editable from the UI while inactive.
Behavior changed:
- The settings preview now reports effective runtime actions instead of raw checked permissions.
- The channel section now explicitly shows the distinction between the venue website chat channel and the agent's website chat permission.
- Advanced instructions are disabled and labeled as not active yet instead of appearing to influence runtime prompts.
- Action controls now show required autonomy levels and statuses such as Active, Off, Paused, or Limited by Level N.
Known gaps:
- The autonomy/action status text is server-rendered from the saved config; it does not dynamically recompute before submit when an operator changes the autonomy select client-side.
- Advanced instructions remain persisted but unused by prompts/policy.
- No observability UI exists for explaining specific policy blocks.
- npm run lint still reports pre-existing warnings in operator-settings-form.tsx and website-chat-agent.ts.
Next phase notes:
- Add client-side progressive enhancement for live autonomy/action dependency previews if operators find the static saved-state guidance too subtle.
- Split reservation/deposit tools so Level 3 deposit-link UI semantics can become fully independent from Level 4 reservation creation.
- Add policy-decision inspection near the agent settings page once observability UI work begins.
```

```text
Phase: Hardening Phase 13 - Agent Run Observability UI
Status: Completed on 2026-05-16
Summary: Added a platform-admin observability surface for inspecting AgentRun and AgentToolCall records. Admins can now review recent agent runs, filter by venue, inquiry, status, and time window, inspect run metadata and result summaries, and expand tool-call summaries without exposing raw prompts, API keys, payment secrets, or sensitive payloads.
Routes added:
- /system/agent-runs
Fields exposed:
- Agent run status, channel, source, model, intent, objective, conversationMode, confidence, finalAction, resultSummary, errorMessage, startedAt, and duration.
- Tool call toolName, status, inputSummary, outputSummary, errorMessage, startedAt ordering, and duration.
- Venue name/slug link and inquiry id/guest/status context where available.
Key decisions:
- Chose a system-admin global page because existing /system/evals already uses requirePlatformUser and supports global diagnostic views.
- Kept operator access out of this phase to avoid cross-venue leakage; an operator-scoped inquiry panel can reuse the service pattern later with venueId enforced.
- Used only persisted summaries from AgentRun and AgentToolCall, not raw prompts, checkout URLs, API keys, or provider payloads.
- Added a discoverability link from the platform settings QA card.
Files changed:
- src/lib/agent/agent-run-inspection-service.ts
- src/app/system/agent-runs/page.tsx
- src/app/settings/page.tsx
- src/app/globals.css
- tests/integration/agent-run-inspection-service.test.ts
- docs/agent-architecture-refactor.md
Tests run:
- npm run typecheck
- npx vitest run tests/integration/agent-run-inspection-service.test.ts
- npx vitest run tests/integration/agent-run-inspection-service.test.ts tests/integration/website-chat-agent-observability.test.ts tests/integration/operator-service.test.ts
- npm run lint
- npm run build
Behavior preserved:
- Agent runtime, logging behavior, website chat behavior, and operator venue-scoped views were not changed.
- Existing AgentRun and AgentToolCall storage remains summary-based and resilient.
Behavior changed:
- Platform admins can now inspect recent agent run/tool-call summaries at /system/agent-runs.
- Platform settings now links to the agent run inspection page.
Known gaps:
- No operator-scoped inquiry detail panel is included yet.
- The inquiry link on the system page filters by inquiry id within /system/agent-runs rather than opening an operator conversation detail, because platform admin pages do not currently have a dedicated global inquiry detail route.
- No pagination beyond the latest 50 runs; filters cover practical triage but not deep historical search.
- npm run lint still reports pre-existing warnings in operator-settings-form.tsx and website-chat-agent.ts.
Next phase notes:
- Add a venue-scoped operator inquiry panel for AgentRun/AgentToolCall history with strict venueId filtering.
- Add pagination/export for system-wide audit workflows if run volume grows.
- Consider storing a policy-decision summary on AgentRun so blocked settings can be explained without digging through individual tool calls.
```

```text
Phase: Hardening Phase 14 - Shared Runtime Orchestration Slice
Status: Completed on 2026-05-16
Summary: Moved the website-chat AgentRun lifecycle for service-routed guest messages into the shared agent runtime. The runtime now starts the run, passes the run id into the website chat adapter, receives structured completion metadata, and completes or fails the run while preserving website chat response persistence and duplicate reply protection.
New flow:
- Website chat service normalizes the guest message event and calls runSharedAgentRuntime.
- runSharedAgentRuntime starts an AgentRun with source=shared_agent_runtime for website_chat/message_received events.
- runWebsiteChatAgentForRuntime handles website-chat-specific planning, tool execution, message formatting, duplicate reply protection, and persistence while attaching tool calls to the shared run id.
- runSharedAgentRuntime completes the shared AgentRun from the adapter's structured completion result.
API compatibility notes:
- Public website chat API response shapes and widget behavior are unchanged.
- Direct runWebsiteChatAgent callers remain compatible through a wrapper that still returns the reply message and owns its own legacy AgentRun lifecycle.
- Duplicate AI reply protection remains inside the website chat adapter where message persistence is still channel-specific.
Behavior preserved:
- Default venue config behavior, policy outcomes, tool execution, response persistence, inquiry status transitions, and activity logging remain compatible.
- Tool calls continue to be logged against the active AgentRun.
Behavior changed:
- Website chat runs reached through the shared runtime are now logged with source=shared_agent_runtime and are completed by agent-runner.ts instead of website-chat-agent.ts.
- Direct website-chat-agent calls still log source=website_chat_agent and complete their own run for backwards compatibility.
Files changed:
- src/lib/agent/agent-runner.ts
- src/lib/website-chat-agent.ts
- tests/integration/website-chat-architecture-flows.test.ts
- docs/agent-architecture-refactor.md
Tests run:
- npm run typecheck
- npx vitest run tests/integration/website-chat-architecture-flows.test.ts tests/integration/website-chat-agent-observability.test.ts tests/integration/conversation-runtime-adapter.test.ts
- npx vitest run tests/integration/website-chat-service.test.ts tests/unit/conversation-state.test.ts tests/integration/conversation-runtime-adapter.test.ts tests/integration/website-chat-agent-observability.test.ts
- npm run test:chat-evals
- npm run lint
- npm run build
Known gaps:
- Policy evaluation, tool execution, conversation state transition, activity logging, and response persistence still mostly live in website-chat-agent.ts.
- The shared runtime owns only the AgentRun orchestration slice for website-chat message events in this phase.
- Existing direct tests still exercise runWebsiteChatAgent directly through the compatibility wrapper.
- npm run lint still reports pre-existing warnings in operator-settings-form.tsx and website-chat-agent.ts.
Next phase notes:
- Move one additional slice at a time into the shared runtime, starting with policy decision orchestration or tool execution dispatch.
- Introduce a website-chat persistence adapter interface before moving response persistence out of website-chat-agent.ts.
- Add run-level policy decision summaries once policy orchestration is centralized.
```

```text
Phase: Hardening Phase 15 - Conservative Workflow Task Processing
Status: Completed on 2026-05-16
Summary: Productionized workflow task processing without enabling customer-facing outbound messages. Due tasks can now be processed through a cron-compatible server route, each task is atomically claimed before execution, stale processing locks can be returned to pending, and operators can inspect pending/recent workflow tasks from the existing alerts page.
Runner added:
- Added /api/workflows/process as a nodejs/dynamic route with GET and POST support.
- The route requires Authorization: Bearer $CRON_SECRET when CRON_SECRET is configured; production without CRON_SECRET rejects requests.
- vercel.json now includes a 15-minute cron entry for /api/workflows/process.
- The route reports customerMessagingEnabled=false and outboundMessagesSent=0 to make the conservative behavior explicit.
Locking and idempotency:
- Added WorkflowTaskStatus.PROCESSING and WorkflowTask.processingStartedAt.
- processDueWorkflowTasks now requeues stale PROCESSING locks, claims PENDING due tasks with an atomic status transition, increments attempts on claim, and only processes claimed tasks.
- Completion, cancellation, and failure helpers now use guarded status transitions so completed/cancelled tasks are not mutated by a second runner.
Operator visibility:
- /operator/alerts now includes a workflow task queue showing pending, processing, failed, and recent completed tasks for the operator's venue.
- Processed tasks still create operator-visible alerts/activity logs; no SMS, email, or external customer messaging was added.
Behavior preserved:
- Default follow-up behavior remains conservative because follow-up scheduling still depends on venue config.
- Deposit-paid success handling still cancels pending unpaid deposit reminder tasks before they are processed.
- Existing operator alerts/activity behavior is preserved; the workflow queue is an additional panel on the alerts page.
Files changed:
- prisma/schema.prisma
- src/lib/workflow-tasks.ts
- src/app/api/workflows/process/route.ts
- vercel.json
- src/lib/operator-service.ts
- src/lib/operator-types.ts
- src/app/operator/alerts/page.tsx
- tests/integration/workflow-tasks.test.ts
- docs/agent-architecture-refactor.md
Tests and commands run:
- npx prisma format
- npx prisma generate
- npm run test:db:push
- npx vitest run tests/integration/workflow-tasks.test.ts
- npm run typecheck
- npm run lint
- npx vitest run tests/integration/operator-service.test.ts tests/integration/workflow-tasks.test.ts
- npm run build
Known gaps:
- No external messaging adapters were added; due tasks create operator-visible alerts/logs only.
- There is no dedicated workflow inbox route yet; the queue is embedded in /operator/alerts.
- Stale processing recovery is time-based and intentionally simple for serverless cron; it is not a full distributed job queue.
- npm run lint still reports pre-existing warnings in operator-settings-form.tsx and website-chat-agent.ts.
Next phase notes:
- Add a dedicated operator workflow/task page with filters and task actions if operators need more than the alerts-page queue.
- Add a manual retry/cancel action for failed workflow tasks.
- Only add customer-facing message delivery after consent, rate limiting, templates, and channel adapters exist.
```

```text
Phase: Hardening Phase 16 - Eval Quality and Conversational Behavior
Status: Completed on 2026-05-16
Summary: Improved deterministic website chat eval quality and conversational behavior without changing the shared architecture. The scripted eval report improved from 5/13 passing with an average score of 80 to 13/13 passing with an average score of 100.
Behavior improvements:
- The eval runner no longer stops a scripted scenario just because the agent asks for a deposit link; it only stops early for an actual URL or when no scripted guest turns remain.
- One-digit party-size replies after a table recommendation are no longer misclassified as invalid phone numbers unless the agent had already asked for a phone number.
- Mixed venue-knowledge-plus-booking questions now answer the factual part and keep the package recommendation moving in the same reply.
- Clarified headcount language such as "let's say 5" is treated as the current party size.
- Package comparison recovery now describes the configured starting/main fit clearly even when there is no larger configured option for that party size.
Eval updates:
- Adjusted the ambiguity scorer to recognize the natural phrase "what headcount should I lock in".
- Adjusted the VIP/custom scenario scoring so a correct immediate human escalation does not fail just because no table package was mentioned before handoff.
- Updated reports/chat-evals/latest.json through the established chat eval report path.
Behavior preserved:
- Venue-config policy enforcement, handoff policy, no-invented-discount checks, duplicate reply prevention, and website chat API behavior remain in place.
- Customer-facing behavior remains deterministic by default unless OpenAI eval flags are explicitly enabled.
Files changed:
- src/lib/chat-evals/runner.ts
- src/lib/chat-evals/scoring.ts
- src/lib/website-chat-agent.ts
- reports/chat-evals/latest.json
- docs/agent-architecture-refactor.md
Tests and commands run:
- npm run test:chat-evals
- npm run test:chat-evals:deploy
- npm run typecheck
- npm run lint
- npm run build
Remaining gaps:
- The 13/13 result is for the scripted deterministic eval suite; LLM-guest and LLM-judge modes remain opt-in and can still surface softer product-quality issues.
- Package-value answers pass the current deterministic check, but future evals should verify richer package-description language once venues have more detailed package metadata.
- npm run lint still reports pre-existing warnings in operator-settings-form.tsx and website-chat-agent.ts.
Next phase notes:
- Add closed-night recovery and objection-specific scenarios if product wants more coverage beyond the current 13 scripted cases.
- Add richer package metadata to improve "what do I get" answers without inventing inclusions.
- Consider scenario-level score thresholds instead of all-or-nothing pass checks as the eval suite expands.
```

```text
Phase: Hardening Phase 17 - Multi-Channel Schema and Runtime Preparation
Status: Completed on 2026-05-16
Summary: Prepared the conversation schema and runtime boundaries for future multi-channel agents without adding SMS, Instagram, WhatsApp, email, or voice integrations. Website chat behavior remains unchanged while future channels now have explicit persisted enum values, mapping helpers, and placeholder adapter contracts.
Schema and mapping decisions:
- Added WHATSAPP, EMAIL, VOICE, and OPERATOR_DASHBOARD to the Prisma Channel enum.
- Kept existing SMS, INSTAGRAM_DM, PHONE, MANUAL, and WEBSITE_CHAT values intact for compatibility with existing inquiries and reports.
- Added a centralized conversation-to-Prisma channel mapping layer.
- Mapped legacy persisted PHONE to shared conversation channel voice.
- Mapped legacy persisted MANUAL to shared conversation channel operator_dashboard.
Runtime and adapter prep:
- AgentRun observability now accepts the Prisma Channel type instead of only WEBSITE_CHAT.
- Added future channel adapter interfaces for SMS, Instagram DM, WhatsApp, email, voice, and operator dashboard.
- Future adapters are explicitly registered as implemented=false placeholders; they do not send, receive, or sync external messages.
- The shared runtime still executes website_chat only and returns blocked/no-op results for unimplemented future channels with clearer diagnostics.
Behavior preserved:
- Website chat runtime, API responses, widget behavior, duplicate reply protection, inquiry channel values, and reports remain compatible.
- No external channel integrations or outbound messaging were added.
Files changed:
- prisma/schema.prisma
- src/lib/conversation/channel-mapping.ts
- src/lib/conversation/channel-adapters.ts
- src/lib/agent/agent-observability.ts
- src/lib/agent/agent-runner.ts
- tests/unit/conversation-channel-mapping.test.ts
- tests/integration/conversation-runtime-adapter.test.ts
- docs/agent-architecture-refactor.md
Tests and commands run:
- npx prisma format
- npx prisma generate
- npm run test:db:push
- npx vitest run tests/unit/conversation-channel-mapping.test.ts tests/integration/conversation-runtime-adapter.test.ts
- npm run typecheck
- npm run build
- npm run lint
Known gaps:
- No SMS, Instagram, WhatsApp, email, voice, or operator-dashboard adapter implementation exists yet.
- Inquiry creation and UI flows still primarily use the existing WEBSITE_CHAT/SMS/INSTAGRAM_DM/PHONE/MANUAL paths.
- AgentRun records can represent future channels, but the shared runtime does not start real non-website agent runs until a channel adapter is implemented.
- npm run lint still reports pre-existing warnings in operator-settings-form.tsx and website-chat-agent.ts.
Next phase notes:
- Implement one channel adapter at a time behind explicit venue config and consent/rate-limit controls.
- Add per-channel persistence adapters before allowing outbound messages outside website chat.
- Add operator-facing diagnostics for blocked future-channel events once real channel ingest exists.
```

## Implementation Notes

- Keep DB migrations conservative and phase-specific.
- Do not expose raw prompts as the primary venue configuration experience.
- Do not let model output directly bypass policy or tool validation.
- Logging should be resilient and must not leak secrets, API keys, or raw payment details.
- Where LLM output is nondeterministic, tests should mock or exercise deterministic fallback paths.
- Prefer small compatibility wrappers over broad rewrites.
