# Deploying PL Predictions — Vercel + Supabase

Complete step-by-step guide to deploy the app.

---

## Step 1: Create a Supabase Project

1. Go to **https://supabase.com** and sign up / log in
2. Click **"New Project"**
3. Fill in:
   - **Name**: `pl-predictions`
   - **Database Password**: pick a strong password (save it somewhere safe)
   - **Region**: choose the closest to your users (e.g. `West EU` or `East US`)
4. Click **"Create new project"** — wait ~2 minutes for it to provision

## Step 2: Create the Database Tables

1. In your Supabase dashboard, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Open the file `supabase-migration.sql` from your project folder
4. Copy the **entire contents** and paste it into the SQL Editor
5. Click **"Run"** (the green play button)
6. You should see "Success. No rows returned" — that means all 11 tables + indexes were created

### Verify:
- Click **"Table Editor"** in the left sidebar
- You should see these tables: `users`, `predictions`, `doublers`, `leagues`, `league_members`, `user_badges`, `user_streaks`, `weekly_winners`, `h2h_challenges`, `notifications`, `push_subscriptions`, `subscriptions`

## Step 3: Get Your Supabase Keys

1. In Supabase dashboard, go to **Settings** (gear icon) → **API**
2. Copy these two values:
   - **Project URL** → looks like `https://abcdefgh.supabase.co`
   - **service_role key** (under "Project API keys") → starts with `eyJhbGci...`

> ⚠️ The `service_role` key has full access to your database. Never expose it in frontend code — it's only used server-side.

## Step 4: Get a Football Data API Key

1. Go to **https://www.football-data.org/**
2. Sign up for a free account
3. After verifying your email, go to your **Account** page
4. Copy your **API Token**

> Free tier: 10 requests/minute. The app's cache only uses ~1 request every 3 minutes, so you're well within limits.

## Step 5: Generate VAPID Keys (Push Notifications)

Open a terminal in your project folder and run:

```
npx web-push generate-vapid-keys
```

This outputs two keys:
```
Public Key:  BLxxxxxxx...
Private Key: xxxxxxx...
```

Save both — you'll need them in the next step.

## Step 6: Push Code to GitHub

1. If you haven't already, create a GitHub repo:
   ```
   cd PL-Predictions
   git init
   git add .
   git commit -m "Initial commit - ready for deployment"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/PL-Predictions.git
   git push -u origin main
   ```

> The `.gitignore` already excludes `node_modules/`, `.env`, and `predictions.db`.

## Step 7: Deploy on Vercel

1. Go to **https://vercel.com** and sign up / log in (use your GitHub account)
2. Click **"Add New..."** → **"Project"**
3. Select your **PL-Predictions** repository from the list
4. In the **Configure Project** screen:
   - **Framework Preset**: select `Other`
   - **Build Command**: leave as `npm run vercel-build`
   - **Output Directory**: leave empty
   - **Install Command**: leave as `npm install`
5. Expand **"Environment Variables"** and add these one by one:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://your-project.supabase.co` (from Step 3) |
| `SUPABASE_SERVICE_KEY` | Your service_role key (from Step 3) |
| `JWT_SECRET` | Any random string — e.g. run `openssl rand -hex 32` to generate one |
| `FOOTBALL_API_KEY` | Your API token (from Step 4) |
| `VAPID_PUBLIC_KEY` | Public key (from Step 5) |
| `VAPID_PRIVATE_KEY` | Private key (from Step 5) |
| `VAPID_EMAIL` | `mailto:your-email@example.com` |
| `CRON_SECRET` | Any random string — protects your cron endpoints |

6. Click **"Deploy"**
7. Wait ~1-2 minutes for the build to complete

## Step 8: Verify Deployment

1. Vercel gives you a URL like `https://pl-predictions-xxxxx.vercel.app`
2. Open it in your browser — you should see the app's login/register page
3. Register a new account and test:
   - Browse gameweeks and matches
   - Submit a prediction
   - Check the leaderboard

## Step 9: Set Up a Custom Domain (Optional)

1. In Vercel dashboard → your project → **Settings** → **Domains**
2. Add your domain (e.g. `plpredictions.com`)
3. Follow Vercel's instructions to update your DNS records
4. HTTPS is automatic

---

## How It Works in Production

| Feature | How it runs on Vercel |
|---|---|
| **API endpoints** | Each `/api/*` request is a serverless function |
| **Static files** | `public/` served directly by Vercel's CDN |
| **Match cache** | Refreshed every 3 min via Vercel Cron (`/api/cron/refresh-cache`) |
| **Notifications** | Checked every 1 min via Vercel Cron (`/api/cron/notifications`) |
| **Database** | Supabase PostgreSQL (auto-selected when `SUPABASE_URL` is set) |
| **Socket.IO** | Limited on serverless — app uses polling fallback for real-time features |

---

## Troubleshooting

**Build fails with "sqlite3" error**
- This is expected on Vercel — sqlite3 is only used locally. When `SUPABASE_URL` is set, the app uses `database-supabase.js` instead. If the build fails, ensure sqlite3 is in `dependencies` (not `devDependencies`) or add it to the Vercel ignore list.

**"Push notifications not configured" error**
- Make sure `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are set in Vercel env vars.

**Cron jobs not running**
- Vercel Cron is available on the **Hobby plan** (free) with up to 2 cron jobs. Check your Vercel dashboard → project → **Settings** → **Crons** to see if they're active.

**API returns empty matches**
- Check that `FOOTBALL_API_KEY` is set correctly. The app falls back to mock data if the key is missing.

**Database connection fails**
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are correct. The URL should end with `.supabase.co` and the key should start with `eyJ`.

---

## Updating the App

After making changes locally:
```
git add .
git commit -m "your changes"
git push
```

Vercel auto-deploys on every push to `main`.
