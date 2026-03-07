# Oracle Tracker

Time tracking platform for **Exergy Designs** — monitor freelancer hours, activity, and screenshots in 10-minute blocks.

🔗 Live site: **[hiengineer.app](https://hiengineer.app)**

---

## Features

- ⏱ 10-minute block timer with activity tracking (keyboard + mouse sampling)
- 📸 Screen capture per block, uploaded to Supabase Storage
- 👥 Team overview — see who's tracking in real-time
- 📋 Admin time review — approve or dispute freelancer blocks
- 📊 Weekly reports — hours and cost by team member
- 💳 Yoco payment integration for invoices
- 🔥 Fireflies.ai meeting transcript proxy
- 📅 Google Calendar proxy

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS, HTML, CSS (no framework) |
| Auth & DB | [Supabase](https://supabase.com) |
| Hosting | [Netlify](https://netlify.com) |
| Serverless | Netlify Functions (Node.js) |
| Charts | Chart.js |
| Payments | Yoco |

---

## Local Dev Setup

```bash
# 1. Clone
git clone https://github.com/Exer-G/oracle-tracker.git
cd oracle-tracker

# 2. Serve locally
npx serve .
# Opens at http://localhost:3000
```

No build step required — it's a static site.

### Environment Variables

For Netlify Functions to work locally, install the Netlify CLI and create a `.env` file:

```bash
npm install -g netlify-cli
netlify dev   # reads .env and proxies functions
```

**`.env` file:**

```env
# Yoco payment processing
YOCO_SECRET_KEY=your_yoco_secret_key

# Fireflies meeting transcripts
FIREFLIES_API_KEY=your_fireflies_api_key

# Netlify sets this automatically in production
URL=https://hiengineer.app
```

> ⚠️ Never commit `.env` to git. It is already in `.gitignore`.

---

## Database Setup (Supabase)

The app requires the following tables in your Supabase project:

| Table | Purpose |
|---|---|
| `tt_team_members` | Team member profiles, roles, hourly rates |
| `tt_time_blocks` | All tracked time blocks |
| `projects` | Active project list |

Team members and projects **must be configured in the DB**. The `config.js` fallback arrays (`TT_TEAM`, `TT_PROJECTS`) are intentionally empty in production.

### Storage Bucket

Create a bucket named `tt-screenshots` in Supabase Storage with public read access for screenshot URLs.

---

## Deployment

The site is deployed on Netlify with continuous deployment from the `main` branch.

- **Site:** [hiengineer.app](https://hiengineer.app)
- Push to `main` → auto-deploy
- Set the env vars listed above in **Netlify → Site settings → Environment variables**

---

## Debugging

In the browser console, run:

```js
window.TT_DEBUG = true
```

This enables verbose `[App]`, `[Timer]`, `[Sync]` etc. log output.

---

## Project Structure

```
oracle-tracker/
├── index.html              # Single-page app shell
├── config.js               # Supabase credentials, TT_CONFIG, fallback data
├── app.js                  # Core app: auth, navigation, data, freelancer views
├── admin.js                # Admin dashboard: team overview, time review, reports
├── timer.js                # 10-minute block timer engine
├── screenshot.js           # Screen Capture API wrapper
├── activity.js             # Keyboard/mouse activity sampler
├── task-allocation.js      # Task assignment and onboarding
├── styles.css              # App styles
├── netlify.toml            # Netlify config, headers, redirects
├── netlify/functions/
│   ├── calendar-proxy.js   # Google Calendar API proxy
│   ├── fireflies-proxy.js  # Fireflies GraphQL proxy
│   ├── yoco-checkout.js    # Yoco checkout session creator
│   └── yoco-payments.js    # Yoco payment history fetcher
└── seed-data.js            # Dev-only: seed localStorage with sample data
```
