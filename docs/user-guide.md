# CS Practice Room App: User Guide

**Web address:** [https://wwu-cspr.app](https://wwu-cspr.app)

This guide is for **everyone** using the app: students, leaders, and staff. You do not need to know how the app is built. It explains what you see on screen, how to book and manage time, how to get help, and how to install the app on your phone or computer.

---

## What this app is for

The CS Practice Room app helps you:

- **Book ministry practices** through an embedded booking form (when your account is eligible).
- **View the shared practice-room calendar**, including practices, jam blocks, and closures.
- **Reserve jam time** on drums or keyboard by selecting a time range on the calendar (when signed in).
- **Message the team** through in-app support threads instead of hunting for the right email chain.

---

## Quick start

1. Open **[https://wwu-cspr.app](https://wwu-cspr.app)** in a modern browser (Chrome, Edge, Safari, or Firefox).
2. Use the top navigation: **Home**, **Booking**, **Calendar**, and **Support**.
3. Tap **Sign in with Google** on the account card (top area on large screens; it moves on smaller phones, see below) when you need features that require a login.

The first time you sign in, the app may ask you to confirm your **WWU email** so it can match you to the right records. Follow the on-screen steps. If something looks wrong, use **Contact Us** on the home page or open **Support** after signing in.

---

## Layout: phone vs computer

On a **narrow screen (typical phone)**, the header stacks: menu pills first, then the title **CS Practice Room**, then the sign-in card.

On a **wide screen (tablet landscape or desktop)**, the same pieces appear in one row: title on the left, **Home / Booking / Calendar / Support** in the center, and the account card on the right.

The **large welcome paragraph** on the home page (“Welcome to the NEW CS Practice Room App!”) only appears on **smaller tablets and larger**. On phones you still get **Contact Us** and **Resources** right away.

**Screenshots for review:** All images below live in the `[guide-screenshots](guide-screenshots/)` folder. They were captured with **automated browser tooling** at fixed sizes (**desktop:** 1440×900, **mobile:** 390×844) so you can compare layouts without resizing a window by hand.

> **Note:** The booking and support screenshots were taken **without signing in**. After you sign in, you will see your booking form or your conversations instead of the sign-in prompt.

---

## Installing the app (optional but handy)

The app can behave like a **normal app icon** on your device. That opens the app in its own window without the browser’s address bar clutter, similar to other apps you install from the web.

### Android (Chrome / Edge)

1. Visit the site in Chrome or Edge.
2. When you see **Install app** at the bottom of the screen, tap **Install**.
  If you dismissed it, use the browser menu: **Install app** or **Add to Home screen** (wording varies slightly).
3. Confirm. An icon named along the lines of **CS Practice Room** appears with your other apps.

### iPhone or iPad (Safari)

1. Open **[https://wwu-cspr.app](https://wwu-cspr.app)** in **Safari** (Apple’s browser).
2. Tap the **Share** button (square with an arrow).
3. Scroll and tap **Add to Home Screen**, then confirm.
4. The icon appears on your home screen. Tapping it opens the app in a full-screen style view.

### Computer (Chrome, Edge, Brave, etc.)

1. Open the site.
2. Look for an **install** icon in the address bar, or open the **⋮** / **⋯** menu and choose **Install CS Practice Room…** or **Install this site as an app**.
3. After installing, you can launch it from your Start menu, Applications folder, or taskbar like any other program.

**Install banner behavior:** A small “Install app” card may appear in the corner; it hides on its own after a short time or if you tap **Dismiss** (it may show again the next day). If you already opened the installed app, the banner usually stays hidden.

---

## Home

Home page: wide layout

Home page: narrow layout

The home page has:

- **Contact Us**: Send a message to the team. You must be **signed in** to send; otherwise you’ll see a prompt to sign in first. After sending, replies appear under **Support**.
- **Resources**: Links such as **Terms & Conditions**, **Meet with us**, and sometimes a group chat link (if your team has enabled it).

**Tip:** You can jump to the full support inbox with **View our replies…** under Contact Us.

---

## Signing in and your account card

The **account card** always shows either:

- **Signed out**: with a **Sign in with Google** button, or  
- **Signed in**: your status and a **Sign out** button.

When signed in, you may also see:

- **Pencil**: Edit your **WWU email** if it needs correcting (opens a small form).
- **Circular arrows**: **Refresh your profile** so the app pulls the latest directory information. You can only use this about once every 30 seconds; if you tap too often, a short countdown appears.

The card’s **color hints** at context (for example, booking-related messages may use different tones on the Booking page). None of this changes *how* you sign in. It only helps you notice where you are.

---

## Booking (practice room)

Booking: wide layout

Booking: narrow layout

Open **Booking** from the top menu.

### Who can use the booking form

Booking is only available if your **role** in the official student directory matches one of the roles that are allowed to book practices. If you are signed in but see a message that you **do not have access**, contact a student leader or the team. They may need to update your role or link your record.

### What you see when it works

The page shows an **embedded form** (from Fillout). Your **name and email** are passed in automatically when you are eligible, so you do not have to re-type everything.

**Mobile tip:** The form may take a moment to load. If the page feels slow to scroll at first, wait a second; the form becomes interactive after it loads.

---

## Calendar

Calendar: wide layout

Calendar: narrow layout

Open **Calendar** from the menu.

### Viewing (no login required)

Anyone can **browse** the calendar: practices, jam reservations, blocked times, and closures appear together. You do **not** need to sign in to **look**.

### Signing in to reserve

To **create a jam reservation** (drums or keyboard), sign in:

1. Drag **across** the time range you want on the grid (press, drag, release).
  On **touch devices**, drag with your finger the same way.
2. A **reservation** window opens. You may see a short **hold** countdown (about 30 seconds) while the slot is temporarily reserved for you, so complete the form before time runs out.
3. Enter your **first name** and choose an **instrument** (for example Drums), then confirm.

If you see a message that someone else is holding the slot, **try again** or pick a different time.

### Opening an event

**Tap or click** an existing event to see its **title**, **time**, and **details**. If you are allowed to cancel it, a **Cancel** option appears (with a confirmation step). Rules depend on the event type:

- **Jam reservations**: Usually you can cancel your own; staff can also cancel when needed.
- **Practice bookings**: Cancellation checks that you are listed on the booking and that your name matches what the calendar expects.

After an event’s **end time has passed**, cancel is no longer offered.

### Blocked time and “Practice Room Closed”

If time is **blocked**, you cannot book over it. A **Friday afternoon** band may show **Practice Room Closed**. That is normal when jams are not allowed past a certain time unless staff opens an exception.

### Calendar navigation (desktop browser, wide window)

When your window is **wide enough** (about 1152 pixels or more), the calendar listens for keyboard shortcuts **unless** you are typing in a text field or a modal is open:


| Key                 | Action                                                                             |
| ------------------- | ---------------------------------------------------------------------------------- |
| **←** (Left arrow)  | Previous week (in week view) or previous day (in day view)                         |
| **→** (Right arrow) | Next week or next day                                                              |
| **T**               | Jump to **today**                                                                  |
| **Escape**          | Close the topmost open dialog (reservation, cancel confirmation, or event details) |


**Navigation shortcuts (same wide window, not while typing in a field):**


| Key        | Action                                                   |
| ---------- | -------------------------------------------------------- |
| **H**      | Go to **Home**                                           |
| **B**      | Go to **Booking**                                        |
| **C**      | Go to **Calendar**                                       |
| **S**      | Go to **Support**                                        |
| **R**      | Refresh your profile (same as the circular-arrow button) |
| **Hold I** | Sign in (hold the **I** key about half a second)         |
| **Hold O** | Sign out (hold the **O** key about half a second)        |


These letter shortcuts are **disabled** on smaller windows and on phones.

### Calendar touch gestures (phone / tablet)


| Gesture                                | Action                               |
| -------------------------------------- | ------------------------------------ |
| **Swipe left / right** on the calendar | Move to the **previous or next day** |
| **Double-tap** the calendar            | Jump to **today**                    |
| **Scroll up / down** on the calendar   | Scroll to earlier or later times without accidentally opening an event your finger passes over |


---

## Support

Support: wide layout

Support: narrow layout

Open **Support** from the menu (you must be **signed in**).

### Threads

- The **left column** lists your conversations.  
- The **right side** shows messages for the thread you selected.

### Phone layout

On a **narrow screen**, you see **either** the list **or** the conversation:

1. Tap a thread → you move into the **chat** view.
2. Use the **back** arrow at the top to return to the **list**.

### Sending messages

- Type in the box at the bottom (up to **1200 characters** per message).
- Tap **Send** for a follow-up in your thread.

### Deleting a conversation

- On **large screens**, you can **right‑click** a thread in the list, or **press and hold** (about half a second) on a thread, then choose **Delete conversation**.
- On **phones**, open the conversation and use the **trash** icon in the header.

### Unread badge

The **Support** item in the top menu can show a **small dot** when there is new activity. Open Support to read and clear it.

---

## If something goes wrong

- **Refresh the page** (pull down on mobile, or use your browser refresh).
- **Sign out and sign in again** if your name or access seems wrong, then use the **circular refresh** on your account card.
- For **booking access** or **directory mistakes**, contact a leader or use **Contact Us** / **Support** so the team can fix your record.

---

## Regenerating the screenshots

Screenshots in `[guide-screenshots](guide-screenshots/)` are produced with **Playwright** at fixed viewport sizes (no manual window resizing). From the project folder:

```bash
npm run screenshots:guide
```

By default they target `https://wwu-cspr.app`. To use another URL:

```bash
GUIDE_BASE_URL=https://wwu-cspr.app npm run screenshots:guide
```

---

*Last updated to match the app behavior as of the documentation refresh; the live site may gain small visual tweaks over time.*