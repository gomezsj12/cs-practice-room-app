# UI Look Book

This document is an exhaustive record of every UI state, page, and interaction in the CS Practice Room app. It serves as the visual "source of truth" so future changes can be compared against the established baseline.

**Screenshots** are stored in `docs/screenshots/`.

**When to update:** After any intentional UI change, add a new subsection under the relevant page/component marking the previous design as "Previous" and describing the new design. See the documentation protocol in `.cursor/rules/documentation-protocol.mdc`.

---

## Global elements

### Site header

The header appears on every page via `app/layout.tsx` → `components/SiteHeader.tsx`.

**Layout:**
- Top-level navigation bar with pill-shaped links: **Home**, **Booking Form**, **Jam Reservations**, **Support**
- Active page link has a highlighted border/background
- Below the nav: large **"CS Practice Room"** heading with subtitle **"Booking, Jam Reservations, and Student Support."**

**States:**

| State | Appearance |
| --- | --- |
| **Signed out** | Auth card shows "Sign in with Google" button. Nav links still visible. |
| **Signed in** | Auth card shows "Signed in" label with context text (varies by page), "Sign out" button. User email visible in auth card context. |
| **Loading** | Auth card shows "Loading sign-in status..." text. |

**Responsive behavior:**
- On mobile (<768px): Header and nav pills stack vertically; same content, tighter padding
- On desktop: Horizontal layout with nav pills in a row

**Screenshots:**
- Desktop (1440×900): [desktop-homepage-top.png](screenshots/desktop-homepage-top.png) — header, nav pills inline, auth card right-aligned
- Mobile (390×844): [mobile-homepage-top.png](screenshots/mobile-homepage-top.png) — nav pills wrap, auth card stacks below heading

### Auth card (per-page context)

The auth card below the header changes its helper text depending on the current page:

| Page | Signed-in text | Signed-out text |
| --- | --- | --- |
| `/` (Home) | "Booking, jam scheduler, and future tools share this Google account." | "Sign in with Google" |
| `/booking` | "Fillout below; jam scheduling shares this Google account." | "Sign in with Google" |
| `/jam` | "Drag-select on the calendar below to reserve or cancel jams." | "Sign in with Google" |
| `/support` | "Booking, jam scheduler, and future tools share this Google account." | "Sign in with Google" |

### Toast notifications

`components/Toast.tsx` — Fixed position, bottom-right corner.

**Types:**

| Type | Appearance |
| --- | --- |
| **Success** | Green-tinted background, success message |
| **Error** | Red-tinted background, error message |
| **Info** | Blue/neutral-tinted background, informational message |

**Behavior:** Auto-dismisses after ~3.5 seconds. Appears on top of all other content (high z-index).

### PWA install prompt

`components/InstallPrompt.tsx` — Appears at the bottom of the screen.

**States:**

| State | Appearance |
| --- | --- |
| **Chromium (beforeinstallprompt)** | Banner with "Install" button; clicking triggers the native install dialog |
| **iOS Safari** | Banner with hint text: "Share → Add to Home Screen" |
| **Already installed (standalone)** | Hidden |
| **Dismissed** | Hidden for the rest of the local day (persisted in localStorage) |
| **Auto-hidden** | Disappears after 15 seconds per app session |

---

## Page: Homepage (`/`)

**Route:** `app/page.tsx`

**Screenshots:**
- Desktop: [desktop-homepage-top.png](screenshots/desktop-homepage-top.png) — full page fits in viewport; hero, contact card, and helpful-links card visible side-by-side
- Mobile top: [mobile-homepage-top.png](screenshots/mobile-homepage-top.png) — header, auth card, hero, contact form
- Mobile bottom: [mobile-homepage-bottom.png](screenshots/mobile-homepage-bottom.png) — contact form (cont.), helpful-links card with stacked buttons

### Layout

The homepage is the portal's front door, organized in vertical card sections:

1. **Header + auth card** (see Global elements above)
2. **Hero section**: Large heading "One home for room booking, jam reservations, and student support." with descriptive subtitle
3. **Contact card**: "Get help or ask a question" heading, contact support form
4. **Helpful links card**: "Practice room resources" heading, links to booking form, jam calendar, and Telegram group

### Contact support form (`ContactSupportForm.tsx`)

**States:**

| State | Appearance |
| --- | --- |
| **Signed in** | Shows "Sending as [User Name]", textarea placeholder "What do you need help with?", character counter (0/1200), blue "Send support request" button, link to support inbox |
| **Signed out** | Shows "Sign in to send a support request" message |
| **Submitting** | Button disabled with loading indicator |
| **Success** | Toast: support request created |
| **Error** | Red error message below the form |

**Interactions:**
- Textarea has 1200 character limit with live counter
- Hitting limit triggers info toast: "Message limit reached (1200 characters)."
- "View replies in your support inbox" link navigates to `/support`

### Helpful links section

Three link cards (only visible when URLs are configured in env):
- **Practice room booking form** → `/booking`
- **Jam reservation calendar** → `/jam`
- **CS Practice Room group chat** → External Telegram group URL

Each card has an icon, title, and short description.

---

## Page: Booking Form (`/booking`)

**Route:** `app/booking/page.tsx`

**Screenshots:**
- Desktop: [desktop-booking-page.png](screenshots/desktop-booking-page.png) — header inline, Fillout embed with "Open in browser" link, full form visible
- Mobile top: [mobile-booking-top.png](screenshots/mobile-booking-top.png) — header stacked, auth card, top of Fillout embed with logo
- Mobile bottom: [mobile-booking-bottom.png](screenshots/mobile-booking-bottom.png) — Fillout form title, description, and Login button

### Layout

1. **Header + auth card** (context: "Fillout below; jam scheduling shares this Google account.")
2. **Fillout embed**: Full-width iframe containing the external Fillout form
3. **"Open in browser"** link: Opens the Fillout form in a new tab

### States

| State | Appearance |
| --- | --- |
| **Form loaded** | Fillout iframe fills the card area; "Open in browser" link in top-right corner |
| **No Fillout URL configured** | Empty card (iframe src is empty) |

### Responsive behavior
- The iframe fills the available width
- On mobile: full-width card with no horizontal padding

---

## Page: Jam Reservations (`/jam`)

**Route:** `app/jam/page.tsx` → `components/CalendarView.tsx`

**Screenshots:**
- Desktop top: [desktop-jam-page-top.png](screenshots/desktop-jam-page-top.png) — 7-day week view header, legend, Prev/Today/Next, date range "Apr 5–11, 2026", top of time grid with events
- Desktop bottom: [desktop-jam-page-bottom.png](screenshots/desktop-jam-page-bottom.png) — evening time slots (3 PM–11:30 PM) with multiple events across different days
- Mobile top: [mobile-jam-page-top.png](screenshots/mobile-jam-page-top.png) — single-day view header, legend with "Temporary hold", nav buttons, day column "Thu, 4/9"
- Mobile mid: [mobile-jam-page-mid.png](screenshots/mobile-jam-page-mid.png) — time grid 12 PM–8:30 PM, now indicator (red line), events for the day
- Mobile bottom: [mobile-jam-page-bottom.png](screenshots/mobile-jam-page-bottom.png) — evening time slots (3 PM–11:30 PM) with remaining events

### Layout

1. **Header + auth card** (context: "Drag-select on the calendar below to reserve or cancel jams.")
2. **Calendar info card**:
   - "CS PRACTICE ROOM" label (small caps, tracking)
   - "Jam Reservations" heading
   - Description text
   - Legend: Practice booking (gray dot), Jam reservation (blue dot), Temporary hold (dashed circle)
   - Navigation: **Prev** / **Today** (blue) / **Next** buttons
   - "Room availability" label with current date range (desktop only)
3. **Calendar grid**: FullCalendar time grid

### Calendar grid

**Desktop (>=768px):** Week view (`timeGridWeek`) showing 7 days
**Mobile (<768px):** Day view (`timeGridDay`) showing 1 day

**Time axis:**
- Left column: 132px wide (104px on mobile)
- Time labels at 30-minute intervals (e.g., "12:00 PM", "12:30 PM")
- Dark background (#0d0d0d) with vertical separator line

**Grid cells:**
- 48px tall per 30-minute slot
- Dark background (#111111)
- Subtle grid lines (#232323)
- Past days dimmed (#0c0c0c background, muted header text)

**Now indicator:** Custom overlay (not FullCalendar's default):
- Thin red hairline across all day columns (week view)
- Thick red bar (4px) on today's column
- Red arrow pointing right at the left edge of today's column

### Event blocks

| Event type | Color | Border | Other |
| --- | --- | --- | --- |
| **Practice booking** | Gray/neutral (#6b7280) | None | Solid rounded block |
| **Jam reservation** | Blue (#3f56c9) | None | Solid rounded block |
| **Temporary hold** | Semi-transparent white | 2px dashed | Glass-like backdrop blur |
| **Past events** | Same base color, dimmed | opacity: 0.5, desaturated | |

**Event content** (inside each block):
- Time range (e.g., "2:00 - 3:30 PM") — top line, smaller text
- Title (e.g., "Sam - Drums") — second line, bold
- Hold events show time only (no title)

### Drag-select interaction (signed-in users only)

**Desktop (mouse/pen):**
1. Click and drag on empty time grid space
2. Drag mirror overlay appears immediately: dashed border, glass-like background, time range label
3. Release: selection is validated and hold flow begins

**Mobile (touch):**
1. Long-press (~220ms) on empty time grid space to arm drag mode
2. Drag to extend selection (scrolling prevented once armed)
3. Release: selection is validated and hold flow begins
4. If finger moves >10px before arming, drag is cancelled (normal scroll continues)

**Validation toasts** (when drag target is invalid):
- "That time is already booked. Try another spot." — clicked on an existing event
- "You can't reserve time on past days." — selected a past day
- "That time has already passed for booking. Pick a later slot." — selected past time on today
- "There isn't 30 minutes of open time before the next booking here. Try another spot or time." — insufficient gap

### Navigation gestures

**Desktop keyboard:**
- `ArrowLeft` / `ArrowRight` — navigate prev/next week
- `T` — jump to today
- `Escape` — close any open modal

**Mobile touch:**
- Horizontal swipe (>50px) — navigate prev/next day
- Double-tap — jump to today

### Reserve modal (`ReserveModal.tsx`)

Opens after a valid drag-select completes.

**Modes:**

| Mode | Appearance |
| --- | --- |
| **Securing** | Shows "Securing your time slot..." with disabled form inputs. Date/time range displayed. |
| **Hold** | Shows countdown ("N seconds remaining"), form enabled. Hold card gets red border/background tint in last 10 seconds. Date/time range displayed. |
| **Fallback** | Shows "Temporary hold unavailable. Continuing with standard booking flow." Form enabled. Date/time range displayed. |

**Form fields:**
- **First name** (text input, pre-filled with Google account first name if available)
- **Instrument** (select: Drums / Piano / Other)
- **Reserve** button (blue, disabled while securing or submitting)

**Close behavior:** Clicking outside or pressing Escape releases any active hold and closes the modal.

### Event details modal (`EventDetailsModal.tsx`)

Opens when clicking on a calendar event (practice or jam).

**Layout:**
- Event type badge ("Practice booking" or "Jam reservation")
- Event title
- Date/time range
- For jam events where user is owner or admin: red "Cancel" button

**States:**
- **Practice event**: View-only, no cancel button
- **Jam event (can cancel)**: Cancel button visible
- **Jam event (cannot cancel)**: No cancel button (not the owner or admin)

### Cancel confirmation modal (`ConfirmModal.tsx`)

Opens when clicking "Cancel" on a jam event.

**Content:**
- Title: "Cancel reservation?"
- Message: "This will remove the jam reservation from the calendar and mark it as cancelled in Notion."
- Buttons: "Keep reservation" (neutral) / "Cancel reservation" (red/destructive)
- While cancelling: destructive button shows loading state

---

## Page: Support Inbox (`/support`)

**Route:** `app/support/page.tsx` → `components/SupportInbox.tsx`

**Screenshots:**
- Desktop inbox: [desktop-support-inbox.png](screenshots/desktop-support-inbox.png) — two-column layout, thread list left, conversation right (first thread selected), input at bottom
- Desktop conversation: [desktop-support-conversation.png](screenshots/desktop-support-conversation.png) — second thread selected showing staff reply and long user message, split panel
- Mobile threads: [mobile-support-threads.png](screenshots/mobile-support-threads.png) — full-width thread list, no conversation panel
- Mobile conversation top: [mobile-support-conversation-top.png](screenshots/mobile-support-conversation-top.png) — back arrow, thread header, beginning of long message
- Mobile conversation bottom: [mobile-support-conversation-bottom.png](screenshots/mobile-support-conversation-bottom.png) — end of message, "Write a message..." input with Send button

### Layout

**Desktop (>=1024px):** Two-column grid layout
- **Left column (300px):** Thread list sidebar
- **Right column:** Conversation view

**Mobile (<1024px):** Single column, toggles between list and chat views

### Thread list sidebar

**Header:** "Your support inbox" with subtitle "Pick a conversation and reply to staff directly here."

**Thread items:** Each thread shows:
- User initials avatar (circle, e.g., "SG")
- Thread name: "Issue [date, time]" (based on creation date)
- Latest message preview (truncated)
- Status badge: "Open" (green) or "Closed" (red)
- Message count: "You N • Staff N"
- Unread indicator: amber dot (when admin has sent unread messages)

**Interactions:**
- Click: Select thread and load conversation
- Right-click or long-press (mobile): Context menu with "Delete conversation" option
- Selected thread has highlighted border/background

### Conversation view

**Header (mobile only):**
- Back arrow button to return to thread list
- Thread name and status badge
- Message counts

**Messages:**
- **User messages**: Right-aligned, darker background (bg-black/30), "YOU" label
- **Staff messages**: Left-aligned, lighter background (bg-white/5), "STAFF REPLY" label
- Each message shows: author label, message body (whitespace-pre-wrap), timestamp
- Messages sorted chronologically (oldest at top)

**Composer:**
- Textarea: "Write a message..." placeholder, 1200 character max
- Auto-resizing textarea (up to 4 lines, then scrollable)
- Send button (blue, disabled when empty or loading)
- When conversation is loading: spinner replaces send button

**Empty state:** "Select a conversation to view messages."

### States

| State | Appearance |
| --- | --- |
| **Loading** | "Loading support thread..." in a bordered card |
| **Not signed in** | "Sign in to view your support inbox." dashed-border card |
| **Error** | Red error card with error message |
| **No threads** | "No support thread yet. Submit your first request on the homepage." |
| **Thread loaded** | Thread list + conversation view |
| **Reply submitting** | Send button shows "..." |
| **Reply error** | Red error card below composer |
| **Delete confirmation** | Browser native `window.confirm()` dialog |
| **Character limit reached** | Info toast: "Message limit reached (1200 characters)." |

### Context menu

Appears on right-click (desktop) or long-press (550ms, mobile) on a thread item:
- Dark backdrop-blur card
- "Delete conversation" button (red text)
- Clicking outside dismisses the menu

### Support nav link badge (`SupportNavLink.tsx`)

The "Support" link in the header shows an unread indicator (amber dot) when any thread has unread admin messages. Polls via `GET /api/support/unread`.

---

## Color palette

| Usage | Color |
| --- | --- |
| Page background | `#030303` |
| Card background | `#080808` |
| Card borders | `rgba(255, 255, 255, 0.1)` |
| Primary text | `#ffffff` |
| Secondary text | `#a3a3a3` (neutral-400) |
| Tertiary text | `#737373` (neutral-500) |
| Primary button (Today, Send, etc.) | `#3b82f6` (blue-500) |
| Jam event color | `#3f56c9` |
| Practice event color | `#6b7280` |
| Calendar grid background | `#111111` |
| Calendar time axis | `#0d0d0d` |
| Grid lines | `#232323` |
| Now indicator | `#ef4444` (red-500) |
| Open status badge | `emerald-500/20` bg, `emerald-200` text |
| Closed status badge | `red-500/20` bg, `red-200` text |
| Unread indicator | `amber-400` |

---

## Typography

- **Font family:** system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif
- **Page headings:** text-3xl to text-4xl, font-semibold, white
- **Section labels:** text-xs, uppercase, tracking-[0.22em], neutral-500
- **Body text:** text-sm to text-base, neutral-300 to neutral-400
- **Calendar time labels:** 0.95rem, font-weight 500
- **Event time text:** 0.86rem, font-weight 500
- **Event title text:** 0.98rem, font-weight 700

---

## Responsive breakpoints

| Breakpoint | Behavior |
| --- | --- |
| `< 768px` (mobile) | Calendar: day view. Header: vertical stack. Time axis: 104px. Touch gestures active. |
| `>= 768px` (tablet/desktop) | Calendar: week view. Header: horizontal. Time axis: 132px. |
| `>= 1024px` (lg) | Support: two-column layout (thread list + conversation). |

---

## Change history

*When UI changes are made, add an entry below with the date, what changed, and a reference to the new screenshot if applicable.*

| Date | Change | Screenshot |
| --- | --- | --- |
| 2026-04-09 | Initial look book created — baseline of all current UI states | (original screenshots) |
| 2026-04-09 | Added desktop (1440×900) and mobile (390×844) screenshots with full-page scrolling for all pages | `desktop-*` and `mobile-*` in `docs/screenshots/` |
