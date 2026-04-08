## CS Practice Room App

This project is a new portal app for the CS Practice Room. It keeps the existing jam reservation flow, adds a dedicated booking-form page, and creates a homepage for student navigation and future support tools.

## Getting Started

1. Copy environment variables into `.env.local`.
2. Add the new public URLs when you have them:
   - `NEXT_PUBLIC_FILLOUT_URL`
   - `NEXT_PUBLIC_TELEGRAM_CONTACT_URL`
   - `NEXT_PUBLIC_TELEGRAM_GROUP_URL`
3. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Main Routes

- `/` homepage and navigation hub
- `/booking` embedded practice-room booking form
- `/jam` jam reservation calendar

## Important Context

- Jam scheduler architecture and integration notes are retained in `docs/ARCHITECTURE.md`
- Agent collaboration guidance is retained in `AGENTS.md` and `.cursor/rules/`
- Use `.env.example` as the safe checklist for new environments
