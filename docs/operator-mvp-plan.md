# Venue Operator MVP Plan

## Goal

Design the next TableCapture surface for venue operators: a venue-scoped app focused on live inquiry handling, inbox workflows, reservations, and venue-owned settings.

This plan is grounded in the current Prisma model and existing platform-admin app.

## What Already Exists In The Data Model

The current schema already supports most operator workflows:

- `Venue`: the natural tenant boundary for operators.
- `Inquiry`: the live booking thread record.
- `InquiryMessage`: the conversation timeline for each inquiry.
- `QuoteOption`: quoted inventory choices tied to an inquiry.
- `Reservation`: the booking outcome, deposit state, and confirmation code.
- `TableOption`: venue inventory that operators sell.
- `Alert`: operational issues and escalations.
- `ActivityLog`: audit trail for operator and system actions.

This means the operator MVP can be built mostly as a venue-scoped layer over existing entities instead of creating a parallel system.

## Product Boundary

### Platform Admin App

Keeps portfolio and system-level ownership:

- Create and activate venues
- Cross-venue alerts and analytics
- Platform-wide reports
- Platform user management
- Global AI controls and oversight

### Venue Operator App

Owns day-to-day execution within a single venue:

- Work the live inquiry inbox
- Take over conversations that need a human
- Send and manage quote options
- Convert inquiries into reservations
- Track deposit and confirmation progress
- Maintain venue-owned inventory and business settings
- Review venue-only alerts and activity

## Recommended Information Architecture

### Primary Navigation

- `Inbox`
- `Reservations`
- `Inventory`
- `Venue Settings`

### Secondary / Utility Navigation

- `Overview`
- `Alerts`
- `Activity`

### Why This IA Fits The Current Model

- `Inbox` maps to `Inquiry`, `InquiryMessage`, `QuoteOption`, and `Alert`.
- `Reservations` maps to `Reservation` joined through `Inquiry` and `TableOption`.
- `Inventory` maps directly to `TableOption`.
- `Venue Settings` maps to venue-owned fields already on `Venue`.
- `Alerts` and `Activity` already exist with `venueId`.

## Recommended Operator Roles

Add venue-scoped users rather than reusing `PlatformUser`.

### `VENUE_OWNER`

Full venue control.

- Manage venue staff accounts
- Update venue settings
- Update inventory
- Handle inbox and reservations
- Pause venue AI for their venue only
- View all venue activity

### `VENUE_MANAGER`

Operational lead for live bookings.

- Handle inbox and reservations
- Edit quote options and reservation status
- Update most venue settings
- Update inventory
- View alerts and activity
- Cannot manage staff accounts
- Cannot deactivate venue

### `VENUE_AGENT`

Frontline inbox operator.

- View and work assigned/open inquiries
- Send quotes
- Mark human takeover
- Update inquiry status
- Create or update reservations
- View inventory and read-only venue settings
- Cannot change staff, AI controls, or business policy

### Optional Later Role: `HOST_READONLY`

Useful later for door teams or concierge staff.

- View tonight’s reservations and inquiry summaries
- No write access

## Permission Model

Permissions should be venue-scoped first, role-scoped second.

### Inbox

- `VENUE_OWNER`: full access
- `VENUE_MANAGER`: full access
- `VENUE_AGENT`: full access except destructive admin actions

### Reservations

- `VENUE_OWNER`: full access
- `VENUE_MANAGER`: full access
- `VENUE_AGENT`: create/update status, but no policy changes

### Inventory

- `VENUE_OWNER`: full access
- `VENUE_MANAGER`: full access
- `VENUE_AGENT`: read-only

### Venue Settings

- `VENUE_OWNER`: full access
- `VENUE_MANAGER`: edit operational settings
- `VENUE_AGENT`: read-only

### Team / Staff Management

- `VENUE_OWNER`: full access
- `VENUE_MANAGER`: no
- `VENUE_AGENT`: no

### AI Controls

- `VENUE_OWNER`: pause/resume for own venue
- `VENUE_MANAGER`: optional pause/resume if desired
- `VENUE_AGENT`: no

## Recommended Schema Additions

The current schema is missing venue-scoped authentication and richer assignment state.

### Required For MVP

Add:

- `VenueUser`
- `VenueSession`
- `VenueRole` enum

Suggested shape:

- `VenueUser.id`
- `VenueUser.venueId`
- `VenueUser.email`
- `VenueUser.fullName`
- `VenueUser.role`
- `VenueUser.passwordHash`
- `VenueUser.isActive`
- timestamps

And:

- `VenueSession.id`
- `VenueSession.token`
- `VenueSession.userId`
- `VenueSession.expiresAt`
- timestamps

### Strongly Recommended Small Additions

On `Inquiry`:

- `assignedVenueUserId` nullable
- `lastInboundAt` nullable
- `lastOutboundAt` nullable

On `Reservation`:

- `notes` nullable

These are not strictly required to launch screens, but they make inbox ownership and reservation workflow much better.

## First MVP Screens

### 1. Operator Login

Purpose:

- Separate venue users from platform users
- Route user into their venue-scoped app

Key elements:

- Email/password
- Venue branding lockup
- Session creation for venue users

Notes:

- Reuse current auth approach, but create venue-specific session helpers and middleware checks.

### 2. Overview

Purpose:

- Lightweight start page for the venue team

Key modules:

- Open inquiries
- Needs human
- Deposits pending
- Confirmed this week
- Quick links into inbox and reservations

Data sources:

- `Inquiry.status`
- `Inquiry.aiConfidence`
- `Reservation.status`
- `Alert`

### 3. Inbox

Purpose:

- Primary workspace for live inquiry handling

Layout:

- Left rail: inquiry list with filters
- Main pane: selected conversation
- Right rail: guest details, recommended actions, quote/reservation tools

Core filters:

- All open
- Needs human
- New
- Awaiting quote
- Deposit pending
- Confirmed
- Lost

List row fields:

- Guest name
- Channel
- Requested date label
- Party size
- Spend intent
- Status
- AI confidence / escalation badge
- Assigned owner if available

Conversation pane:

- Message timeline from `InquiryMessage`
- Internal summary from `Inquiry.nextAction`
- Human takeover state

Action rail:

- Update inquiry status
- Mark/unmark human takeover
- Add/send quote options
- Create reservation from selected quote
- Update next action

### 4. Inquiry Detail

Purpose:

- Dedicated deep-work page for a single inquiry

Why still needed if Inbox exists:

- Better for shareable URLs, focused work, and future mobile/tablet usage

Sections:

- Guest profile
- Conversation transcript
- Quote history
- Reservation state
- Venue alerts related to this thread

### 5. Reservations List

Purpose:

- Operational list of pending and confirmed bookings

Core filters:

- Pending
- Deposit pending
- Confirmed
- Cancelled
- Arrival date / tonight / upcoming

Columns:

- Guest
- Arrival time label
- Table option
- Deposit due
- Deposit paid
- Status
- Confirmation code

Primary actions:

- Confirm deposit received
- Cancel reservation
- Open source inquiry

### 6. Reservation Detail

Purpose:

- Clean booking record operators can action without digging through the inbox

Sections:

- Booking summary
- Guest and source inquiry
- Deposit tracking
- Table allocation
- Notes / operational remarks

### 7. Inventory

Purpose:

- Venue-owned table and pricing management

Data source:

- `TableOption`

Capabilities:

- Add/edit/deactivate table options
- View capacity, min spend, deposit, quantity

This can largely reuse the current venue inventory admin components, but moved into operator scope.

### 8. Venue Settings

Purpose:

- Give venue teams ownership over their local operating configuration

MVP sections:

- Business profile
- Contact info
- Operating hours summary
- Channel summary
- Brand tone
- Deposit policy
- Primary operator contact
- AI live/pause toggle for venue owner/manager only

Data source:

- `Venue`

### 9. Alerts

Purpose:

- Venue-only exception queue

Show:

- Low confidence inquiries
- Needs-human threads
- Deposit pending reminders
- Venue setup/config gaps that still matter post-launch

This is a filtered version of the existing alert model, scoped to one venue.

### 10. Activity

Purpose:

- Local audit trail for operator actions

Show:

- Inquiry status changes
- Quote creation/sending
- Reservation changes
- Inventory edits
- Settings changes

Data source:

- `ActivityLog` filtered by `venueId`

## MVP Screen Priority

Build in this order:

1. Operator auth shell
2. Inbox
3. Inquiry detail
4. Reservations list
5. Venue settings
6. Inventory
7. Overview
8. Alerts
9. Activity

Why:

- Inbox and reservations are the real daily operating system.
- Settings and inventory are necessary because operators need to own what they sell.
- Overview, alerts, and activity are useful but can be thinner initially.

## Operator App URL Structure

Recommended routes:

- `/operator/login`
- `/operator`
- `/operator/inbox`
- `/operator/inbox/[inquiryId]`
- `/operator/reservations`
- `/operator/reservations/[reservationId]`
- `/operator/inventory`
- `/operator/settings`
- `/operator/alerts`
- `/operator/activity`

This keeps the operator app clearly separated from platform admin routes.

## View Model Recommendations

Create a new operator service layer rather than overloading `admin-service.ts`.

Suggested files:

- `src/lib/operator-auth.ts`
- `src/lib/operator-service.ts`
- `src/lib/operator-types.ts`

Suggested query helpers:

- `getOperatorOverview(venueId)`
- `listOperatorInbox(venueId, filters)`
- `getOperatorInquiry(venueId, inquiryId)`
- `listOperatorReservations(venueId, filters)`
- `getOperatorReservation(venueId, reservationId)`
- `getOperatorVenueSettings(venueId)`
- `listOperatorAlerts(venueId)`
- `listOperatorActivity(venueId)`

## UI Reuse Opportunities

Reuse from the existing admin app where possible:

- panel, table, stat, and chip styles
- form patterns
- inventory editing logic
- venue profile editing logic
- alert list structure
- activity feed structure

Do not reuse:

- platform top nav labels
- cross-venue KPIs
- global reports framing
- platform user management

## Key Product Decisions

### 1. Single-venue context by default

Operator users should sign into one venue context, not a venue switcher.

Reason:

- Cleaner permissions
- Lower cognitive load
- Better for true venue ownership

Multi-venue operators can be a later enhancement if needed.

### 2. Inbox-first workflow

The operator app should open into active work, not analytics.

Reason:

- The core job is responding to demand in real time.

### 3. Venue settings should be operational, not platform-administrative

Operators should own business inputs that change how live booking works, but not platform lifecycle state like deactivation.

### 4. Reservations need their own surface

Even though reservations originate from inquiries, operators need a booking-centric list for nightly execution and deposit follow-up.

## Implementation Notes

### Phase 1: Foundation

- Add venue auth models and migration
- Seed at least one `VenueUser` per venue
- Add operator middleware and session handling
- Create operator layout and nav

### Phase 2: Core workflows

- Build inbox list and inquiry detail
- Add inquiry status update actions
- Add quote creation/update actions
- Add reservation create/update actions

### Phase 3: Venue operations

- Build reservations list
- Build venue settings page
- Reuse/refactor inventory management into operator scope

### Phase 4: Support surfaces

- Add overview
- Add alerts
- Add activity

## Biggest Gaps In The Current Model

These are the main things the current schema does not yet express well:

- venue-scoped users
- ownership / assignment of inquiries to a staff member
- richer reservation notes / ops metadata
- explicit quote send state beyond `sentAt`

None of these block an MVP, but venue users are the one must-have addition.

## Recommended MVP Definition

The operator MVP is successful when a venue team can:

- sign into a venue-only app
- see all live inquiries for that venue
- take over and work conversations needing human action
- send table options
- convert inquiries into reservations
- monitor deposit and confirmation progress
- edit their venue’s inventory and operating settings
- review venue-only alerts and activity
