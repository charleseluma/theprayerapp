# Prayer App setup guide

## Already done

- Supabase project, database and your administrator sign-in (`elumacharles@gmail.com`).
- GitHub settings: `EXPO_TOKEN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

## New: one more GitHub secret (about 3 minutes)

The pipeline now updates the database and the account service itself, so you never need to paste SQL again. It needs a Supabase access token for that.

1. Go to **supabase.com/dashboard/account/tokens** (or click your profile picture at the top right in Supabase → **Account preferences** → **Access Tokens**).
2. Click **Generate new token**, name it `github-theprayerapp`, and copy it. Supabase shows it only once.
3. In GitHub, open `theprayerapp` → **Settings → Secrets and variables → Actions** → **Secrets** tab → **New repository secret**.
4. Name it exactly `SUPABASE_ACCESS_TOKEN`, paste the token, and click **Add secret**. It belongs under **Repository secrets**, like `EXPO_TOKEN`.
5. Open the **Actions** tab → **Test build** → **Run workflow**.

When the run is green:
- **Admin Console:** https://prayer-admin-charleseluma.expo.app (sign in with your usual email and password)
- **Prayer Warriors (web):** https://prayer-uploads-charleseluma.expo.app (this replaces the old upload page)
- **Prayer Warriors (Android):** a new build appears on expo.dev under the **theprayerapp-admin** project → **Builds**

## Email for self sign-up (Gmail)

Self sign-up needs an email account that sends confirmation, password-reset and approval emails. Until it's set up, the "Create an account" button tells people sign-ups aren't open yet, and invite links keep working.

1. Create a new Gmail account just for the app (for example `theprayerapp.team@gmail.com`).
2. Turn on 2-Step Verification: myaccount.google.com → Security → 2-Step Verification.
3. Create an app password: myaccount.google.com/apppasswords → name it `Prayer App` → copy the 16-character password.
4. In GitHub → Settings → Secrets and variables → Actions → **Repository secrets**, add:
   - `SMTP_USER` = the Gmail address
   - `SMTP_PASSWORD` = the app password
5. Run **Actions → Test build → Run workflow**. The "Check the code" step should say *Email sending is set up*.

Gmail sends up to about 500 emails a day. To send from your own domain later (for example with Resend), only these settings change.

## How self sign-up works

1. In the Prayer Warriors app, a person taps **Create an account** and fills in their name, email, password, phone, church, who referred them, and an optional note.
2. They confirm their email with the link they receive.
3. They can sign in right away, but recording is locked. They can practice recording, read the guide, listen to prayers and edit their profile.
4. In the Admin Console → **Requests**, approve them (and pick their days) or decline with a note. They get an email either way and see the result in the app.

## Adding a Prayer Warrior yourself

1. In the Admin Console, open **Prayer Warriors** → **Add a Prayer Warrior**.
2. Enter their name and email, pick their days (optional), and click **Create sign-up link**.
3. Copy the link and send it to them by text, WhatsApp or email. It works once and expires after 24 hours.
4. They open it, choose a password, then sign in to the Prayer Warriors app on their phone.

If a link expires or someone forgets their password, click **New sign-in link** on their card.

## Reviewing prayers

New submissions appear under **Review**, with a count on the tab. Listen, then **Approve**, or **Ask for changes** with a short note. The Prayer Warrior sees your note in their app.

## Testing it yourself

Administrators can't post prayers, so add yourself as a Prayer Warrior with a second email address. A Gmail "plus" address works, for example `elumacharles+warrior@gmail.com`. Nothing is emailed, so any address you control is fine.

## Making someone else an administrator

Ask Claude, or in Supabase → SQL Editor run (with their email), after they have a sign-in:

```sql
insert into public.admins (email) values ('their@email.com') on conflict do nothing;
```

The next pipeline run gives them administrator access.
