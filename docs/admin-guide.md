# CS Practice Room App — Staff & Admin Guide

**Web address:** [https://wwu-cspr.app](https://wwu-cspr.app)

This guide is for **student leaders and staff** who help run the practice room: answering support messages, managing the calendar, and understanding how people get access. It avoids technical jargon—think of it as “how the app behaves for someone with extra responsibility,” not “how servers work.”

---

## What “admin” means in this app

**Admins** (sometimes labeled **Staff** in messages) can:

- See **all support conversations** and reply as staff.
- **Cancel** calendar events when needed, even if the event belongs to someone else.
- **Block off** time so nobody can book it, and **remove** those blocks later.
- **Open** a **Friday afternoon** exception when the room should allow jams past the usual cutoff for a specific date.
- Add a **private color tag** to a practice or jam event for their own admin calendar view only.

Regular students see only their own support threads and can only cancel events the rules allow for their own bookings.

---

## How someone gets admin access

There are **two** ways the app can treat you as an admin:

1. **Leadership role in the official directory**  
   If your **role** in the student directory is set to **Leadership**, the app will recognize you as an admin after your profile syncs (usually shortly after you sign in, or when you refresh your profile).

2. **Staff email list**  
   Your campus IT contact or student leadership can add specific **Google email addresses** to an internal list used only by this app. If your email is on that list, you are an admin no matter which directory role you have.

**If you need access** and do not have it, ask whoever manages the practice room or campus IT. They can either add your email to the staff list or confirm your **Leadership** role in the directory.

---

## How you will know you are an admin

- The **account card** (top of the screen) shows a small **Admin** badge next to “Signed in,” and the card uses a **violet** color theme.
- When you open **Support**, the title **Support Inbox** shows an **Admin** pill.
- Reply buttons say **Reply as Staff** instead of a generic “Send.”

The screenshots in [`guide-screenshots`](guide-screenshots/) were taken **without** a staff login, so they show the public layout. After you sign in as an admin, you will see these extra labels and colors on the same pages.

---

## Keeping directory information in sync with the app

The app ties each person to a **record** in the **official student directory** (the same place roles, names, and emails are maintained).

### Automatic updates

When someone **changes** a person’s record in the directory—name, email, role, or other fields—those updates are **sent to the app automatically** in the background. You do **not** need to log into the app to “push” each change by hand.

**Practical guidance for leaders:**

- Keep the directory **accurate** (names, WWU emails, roles). The app uses that data to decide who can book practices, who counts as Leadership, and how to label people in support.
- After a big change, the person can sign in and use the **circular refresh** icon on their account card (or simply wait a short time) so their session shows the latest profile.

### Manual refresh (any signed-in user)

The **refresh** icon next to the pencil on the account card lets a user **pull the latest directory information** into the app. It is rate-limited (about once every 30 seconds) so people use it sparingly.

---

## Home

Same as for everyone: **Contact Us** and **Resources**. As staff, you may still use the contact form to test messages, but most replies happen in **Support**.

---

## Booking

If your directory role also allows **practice booking**, you will see the same embedded form as other eligible users. Admin status does **not** bypass booking rules—if you are not in an allowed role, you will see the same “no access” message as anyone else.

---

## Calendar — staff actions

### Viewing

Same as everyone: you see practices, jams, blocks, and closures in one place.

### Reserving jam time (as yourself)

If you are **signed in** as an individual, you can **drag** to select a time range and complete the **reservation** flow like any other student—unless you are intentionally blocking time instead (see below).

### Blocking time (admin)

When you **drag** across a range **as an admin**, the app opens **Block off time**, not a jam reservation:

- You confirm a **title** (for example “Practice Room Closed”).
- That time shows as **blocked** for everyone on the calendar.

**Removing a block:** Tap the blocked event. You can **remove** the block so the time becomes bookable again (you will confirm before it deletes).

### Friday afternoon restrictions

On **Fridays**, a red-tinted band may show **Practice Room Closed** for a time window when jams are not allowed past a certain time.

- **Students** only see that band as information.
- **Admins** can **tap** that band (or use keyboard **Enter** / **Space** when it is focused) to open a **dialog** asking whether to **open** the practice room for that Friday—allowing jams past the usual cutoff for that date. Confirm only when leadership has approved.

### Canceling events

Tap any event for details. **Admins** can cancel **jam** and **practice** events when policy allows, including events created by others—useful when someone asks for help or a booking was made in error.

### Private event color tags

Admins can add a **private calendar tag** inside the event details popup for **practice** and **jam** events:

- The tag uses a small preset color list.
- It is **only visible to the admin who set it**.
- It does **not** change the booking itself, the public calendar, other admins' views, or the event's Google/Notion details.

This is meant for personal workflow cues such as follow-up, staffing, or internal reminders. It is separate from the practice **Session Status** control so the two meanings do not get mixed together.

---

## Support — staff workflow

### Inbox

- You see **all** threads, not only your own.
- Each row shows the **student’s name** (or best available label) and **email** so you know who is writing.
- **Unread** indicators help you spot threads that need attention (separate from the student’s view).

### Replying

- Use **Reply as Staff** to send a message. It appears on the **staff** side of the conversation for the student.
- Keep messages **short and clear**; students can reply until the thread is closed (if your team uses closed threads).

### Deleting threads

Same controls as users: **right‑click** / **long‑press** on large screens, or the **trash** icon in the mobile chat header. Use **delete** only when your team’s policy says to remove a conversation (for example duplicate or mistaken threads).

---

## Keyboard shortcuts (desktop, wide window)

Same as the user guide: navigation **H / B / C / S**, **R** to refresh profile, **hold I** / **hold O** for sign-in / sign-out, and calendar **arrows / T / Escape** when not typing in a field. See the [User guide](user-guide.md#calendar-navigation-desktop-browser-wide-window) for the full table.

---

## Touch and mobile

Staff use the same **swipe**, **double-tap**, and **scroll** gestures on the calendar as students (scrolling over events won't accidentally open them). On **Support**, use the **back** arrow to move from a chat back to the full list on phones.

---

## Installing the app

Staff can install the app like anyone else—see **[Installing the app](user-guide.md#installing-the-app-optional-but-handy)** in the user guide.

---

## Regenerating screenshots

Screenshots in [`guide-screenshots`](guide-screenshots/) are generated with:

```bash
npm run screenshots:guide
```

To capture **admin-only** UI (violet cards, staff inbox labels), sign in as a staff account in a browser, then take your own screenshots or extend the automation—those states require a logged-in staff session.

---

*This document is meant for operational use. For technical deployment details, see internal developer documentation.*
