# Connecting the prayer service

About 15 minutes, one time. After this you post prayers from the upload page and they appear in the app.

## 1. Create the Supabase project

1. Sign in at supabase.com and choose **New project**.
2. Name it `theprayerapp`, pick the region closest to most listeners (for example *East US*), and create a database password. Save the password in your password manager; you won't need it day to day.
3. Wait for the project to finish setting up (about two minutes).

## 2. Create the database

1. In the left menu open **SQL Editor** and choose **New query**.
2. Open `supabase/schema.sql` from the GitHub repo, copy all of it, and paste it in.
3. If you'll sign in to the upload page with a different email than `elumacharles@gmail.com`, change the address on the last line.
4. Press **Run**. You should see "Success. No rows returned."

## 3. Create your upload-page sign-in

1. Open **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up". Only you need an account.
2. Open **Authentication → Users → Add user → Create new user**. Enter your email and a strong password, keep **Auto Confirm User** checked, and create it.

## 4. Give GitHub the connection details

1. In Supabase open **Project Settings → API Keys** (or **Data API**). Copy the **Project URL** and the **anon / publishable** key. Never copy the `service_role` or secret key.
2. In GitHub open the `theprayerapp` repository → **Settings → Secrets and variables → Actions**.
3. On the **Variables** tab add:
   - `SUPABASE_URL` = the Project URL
   - `SUPABASE_ANON_KEY` = the anon / publishable key
4. On the **Secrets** tab make sure `EXPO_TOKEN` exists (from expo.dev → Account settings → Access tokens).
5. Open the **Actions** tab, choose **Test build**, and press **Run workflow**.

When the run finishes:
- The upload page is live at **https://prayer-uploads-charleseluma.expo.app**
- A new Android test build appears on expo.dev under **theprayerapp → Builds**

## Posting a prayer

1. Open the upload page and sign in.
2. Pick the day, choose the audio file, add a title (theme and description are optional).
3. Press **Publish prayer**. Listeners get it the next time they open the app or pull down to refresh.

A prayer for a future day is saved as **Scheduled** and appears on its day. Turning off **Visible to listeners** hides a prayer without deleting it. Past prayers are kept for the future paid archive.
