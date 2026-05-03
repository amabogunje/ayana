# Operator Cross-Platform Blueprint

## Goal

Build the venue operator product as one shared platform with three clients:

- web app
- native iOS app
- native Android app

The operator experience remains venue-scoped and focused on:

- live inquiry handling
- inbox workflows
- reservations
- venue-owned settings

## Core Recommendation

Do not build the operator product as a Next-only module first and “port it later.”

Instead, build it as:

1. one shared operator backend
2. one shared domain and API contract layer
3. one web client
4. one native mobile client for iOS and Android

That gives us three products without three different business logic stacks.

## What Changes From The Original Plan

The earlier operator plan assumed a web-first module inside the existing app. With iOS and Android added, the architecture should change in four important ways.

### 1. API-first instead of server-action-first

The current workspace leans on Next server-rendered pages and server actions for the admin app. That is fine for platform admin, but not enough for native apps.

For operator, the backend should expose a real API that all clients use.

### 2. Shared contracts become mandatory

We need shared definitions for:

- auth/session payloads
- roles and permissions
- inquiry list and detail shapes
- reservation list and detail shapes
- venue settings DTOs
- mutation payloads and validation

### 3. UX design splits by surface

The workflows stay the same, but the interface patterns differ:

- web: denser multi-pane inbox and faster batch scanning
- mobile: triage-first, thumb-friendly, fewer simultaneous panels

### 4. Auth must become cross-platform

The current cookie-based platform auth is not enough for native mobile. Operator auth should be venue-scoped and support:

- secure session tokens
- refresh flow
- device-friendly session persistence

## Recommended Product Architecture

## Layers

### Layer 1: Database and domain model

Keep Prisma and the current database as the source of truth.

Existing models already cover most operator needs:

- `Venue`
- `Inquiry`
- `InquiryMessage`
- `QuoteOption`
- `Reservation`
- `TableOption`
- `Alert`
- `ActivityLog`

Add venue-scoped auth models and a few workflow fields where needed.

### Layer 2: Operator application service layer

Create an operator service boundary that is independent of Next page rendering.

Examples:

- list inbox items
- get inquiry detail
- update inquiry status
- assign inquiry
- create quote options
- convert inquiry to reservation
- update reservation status
- list venue alerts
- update venue settings

This is the main shared business logic layer.

### Layer 3: Operator API

Expose the operator service layer through HTTP endpoints.

The web app and native apps should both call this API.

Recommended shape:

- REST is the simplest fit for the current codebase
- Zod validation shared between server and clients
- venue-scoped authorization enforced server-side on every request

### Layer 4: Clients

- web client in Next.js
- native mobile client in React Native / Expo for iOS and Android

## Recommended Monorepo Shape

The current workspace can evolve into this without a full rewrite.

```text
TableCapture/
  apps/
    admin-web/
    operator-web/
    operator-mobile/
  packages/
    domain/
    operator-api-types/
    auth/
    validation/
    ui-tokens/
    config/
  prisma/
  docs/
```

## Practical Adaptation For This Existing Workspace

To reduce migration risk, we can phase into that target instead of restructuring everything at once.

### Near-term structure

Keep the current app in place and introduce operator pieces incrementally:

```text
TableCapture/
  src/
    app/
      ...current admin app...
      operator/
        ...operator web routes...
      api/
        operator/
          inbox/
          inquiries/
          reservations/
          settings/
          alerts/
          activity/
    lib/
      operator-auth.ts
      operator-service.ts
      operator-permissions.ts
      operator-types.ts
      operator-api.ts
      validation/
        operator.ts
  mobile/
    operator-app/
```

### Medium-term structure

When the operator product proves out, split into `apps/` and `packages/`.

That way we do not block product momentum on a monorepo migration before we have working operator flows.

## Technology Recommendation

## Web

- `Next.js`
- App Router is fine
- server rendering for shell and initial page loads
- API-driven mutations for operator workflows

## Mobile

- `React Native`
- `Expo`

Reasons:

- one codebase for iOS and Android
- fast setup and iteration
- solid support for secure storage, notifications, and device APIs
- lower overhead than separate Swift and Kotlin apps at MVP stage

If by “native” you mean fully separate Swift and Kotlin codebases, that is possible, but I would not recommend it for this stage. Expo/React Native still ships true native apps and is the highest-leverage path for this product.

## Shared packages

### `packages/domain`

Contains:

- enums
- role definitions
- permission helpers
- shared business constants
- workflow labels

### `packages/operator-api-types`

Contains:

- request/response DTOs
- list item shapes
- detail page shapes

### `packages/validation`

Contains:

- shared Zod schemas
- mutation payload validation
- query parameter validation

### `packages/auth`

Contains:

- token/session helpers
- auth types
- permission checks

### `packages/ui-tokens`

Contains:

- color tokens
- spacing
- typography scales
- semantic status colors

This should be tokens and primitives, not an attempt to fully share web and mobile components.

## Auth And Identity Model

## New models needed

Add:

- `VenueUser`
- `VenueSession`
- `VenueRole`

Recommended roles:

- `VENUE_OWNER`
- `VENUE_MANAGER`
- `VENUE_AGENT`

Suggested model:

### `VenueUser`

- `id`
- `venueId`
- `email`
- `fullName`
- `role`
- `passwordHash`
- `isActive`
- `createdAt`
- `updatedAt`

### `VenueSession`

- `id`
- `token`
- `userId`
- `expiresAt`
- `createdAt`
- optional device metadata later

## Session strategy

### Web

- httpOnly secure cookies

### Mobile

- short-lived access token
- refresh token
- secure token storage using device keychain/keystore

If we want to keep implementation simpler initially, we can still use bearer session tokens for mobile and cookie sessions for web, as long as the server uses the same underlying session model.

## Authorization rules

Every operator request must verify:

1. authenticated venue user exists
2. user is active
3. requested resource belongs to `user.venueId`
4. user role can perform the action

This venue boundary is the most important security rule in the whole operator product.

## Data Model Changes Beyond Auth

The current schema is already strong, but a few additions will help all clients.

### Recommended additions on `Inquiry`

- `assignedVenueUserId` nullable
- `lastInboundAt` nullable
- `lastOutboundAt` nullable
- optional `priority` later

### Recommended additions on `InquiryMessage`

- optional `messageType`
- optional `deliveryStatus`

Not mandatory for MVP, but helpful for cross-channel and mobile notification readiness.

### Recommended additions on `Reservation`

- `notes` nullable
- optional `confirmedAt`
- optional `cancelledAt`

## Operator API Surface

Start with a narrow API focused on the first real workflows.

## Auth

- `POST /api/operator/auth/login`
- `POST /api/operator/auth/logout`
- `POST /api/operator/auth/refresh`
- `GET /api/operator/me`

## Inbox

- `GET /api/operator/inbox`
- `GET /api/operator/inquiries/:id`
- `POST /api/operator/inquiries/:id/assign`
- `POST /api/operator/inquiries/:id/status`
- `POST /api/operator/inquiries/:id/takeover`
- `POST /api/operator/inquiries/:id/messages`

## Quotes

- `POST /api/operator/inquiries/:id/quotes`
- `POST /api/operator/quotes/:id/send`

## Reservations

- `GET /api/operator/reservations`
- `GET /api/operator/reservations/:id`
- `POST /api/operator/inquiries/:id/reservations`
- `POST /api/operator/reservations/:id/status`
- `POST /api/operator/reservations/:id/deposit`

## Venue settings

- `GET /api/operator/settings`
- `POST /api/operator/settings/profile`
- `POST /api/operator/settings/ai`

## Inventory

- `GET /api/operator/inventory`
- `POST /api/operator/inventory`
- `POST /api/operator/inventory/:id`
- `POST /api/operator/inventory/:id/archive`

## Alerts and activity

- `GET /api/operator/alerts`
- `GET /api/operator/activity`

## Cross-Platform Screen Strategy

The workflows should match across clients, but the layouts should not be forced to be identical.

## Web app screens

### 1. Login

- venue operator auth

### 2. Inbox

- multi-pane layout
- list + conversation + action rail

### 3. Inquiry detail

- dedicated route for focused work

### 4. Reservations list

- sortable, filterable operational table

### 5. Reservation detail

- deposit and confirmation management

### 6. Inventory

- denser forms and tables

### 7. Settings

- venue profile and operating config

### 8. Alerts

- venue-only exception queue

### 9. Activity

- local audit log

## Mobile app screens

### 1. Login

- same auth, mobile-native form flow

### 2. Inbox list

- compact triage list
- filter chips
- unread/needs-human emphasis

### 3. Inquiry detail

- conversation first
- sticky action bar for status, quote, reservation

### 4. Reservation list

- upcoming and deposit-pending centered

### 5. Reservation detail

- quick operational summary for on-the-floor use

### 6. Alerts

- actionable exception queue

### 7. Settings

- lighter than web
- only high-frequency settings at first

Inventory editing can launch on web first if needed, while mobile stays read-only there in MVP.

## Push Notifications

Native mobile changes the urgency model.

We should plan for notifications early even if we do not fully implement them in phase 1.

Useful notifications:

- inquiry marked `NEEDS_HUMAN`
- new high-value inquiry
- deposit pending aging reminder
- reservation confirmed

For MVP:

- architect for notifications
- implement after inbox and reservation basics are stable

## Offline And Sync Strategy

Do not promise full offline editing in v1.

Instead:

- support cached lists and last-viewed detail
- gracefully recover from temporary disconnects
- queueing/offline write sync can come later

This keeps scope realistic while still making mobile resilient enough.

## Shared UI Strategy

Do not try to share full React components between Next and React Native.

Share:

- design tokens
- copy patterns
- status semantics
- validation
- DTOs

Keep actual UI implementation separate per surface.

That avoids expensive abstraction mistakes.

## Recommended Build Order

## Phase 0: Architecture and contracts

Deliverables:

- operator roles and permissions
- API contract doc
- schema additions
- route map
- screen map

This document covers that phase at a high level.

## Phase 1: Backend foundation

Build:

- `VenueUser`, `VenueSession`, `VenueRole`
- operator auth helpers
- operator permission helpers
- operator API endpoints
- shared validation layer

This is the most important phase.

## Phase 2: Operator web MVP

Build first:

- login
- inbox
- inquiry detail
- reservations list
- settings

Reason:

- fastest place to validate the operator workflow
- easiest to debug against the current stack
- fastest feedback loop for data shaping

## Phase 3: Operator mobile MVP

Build next in React Native / Expo:

- login
- inbox list
- inquiry detail
- reservations list
- alerts

This gets the most valuable mobile workflows into users’ hands quickly.

## Phase 4: Secondary surfaces

Add:

- reservation detail
- activity
- inventory
- richer settings
- notifications

## Why Start With Web First If Mobile Is Required

Because web is the fastest proving ground for:

- permissions
- data contracts
- list/detail shapes
- reservation workflow
- error handling

Then mobile consumes a cleaner backend and more stable contracts.

This does not mean web is the “main product.” It means web is the fastest way to stabilize the shared core.

## What I Can Build

Yes, I can help build all three:

- operator backend and API
- operator web app
- operator mobile app for iOS and Android using React Native / Expo

I can also help structure the repo so shared code stays sane instead of becoming duplicated across clients.

## Recommended Starting Point In This Workspace

Start here:

1. add venue-scoped auth models to Prisma
2. create `operator-auth.ts`, `operator-permissions.ts`, and `operator-service.ts`
3. add `/api/operator/*` endpoints for inbox, inquiry detail, reservations, and settings
4. build `/operator` web routes against those APIs
5. after those flows are stable, create `mobile/operator-app` with Expo and connect it to the same API

## Immediate Next Deliverable

The best next implementation step is not the mobile shell yet.

It is:

- schema additions
- operator auth
- operator API contract

That gives us the foundation both web and mobile need.

## Recommended First MVP Scope Across Surfaces

### Shared backend scope

- venue login
- me/session endpoint
- inbox list
- inquiry detail
- inquiry status update
- human takeover toggle
- reservation creation
- reservation status update
- venue settings read/update

### Web MVP scope

- full inbox
- inquiry detail
- reservations list
- settings

### Mobile MVP scope

- inbox list
- inquiry detail
- alerts
- reservations list

This is the highest-leverage cross-platform slice.
