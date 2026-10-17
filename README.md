# The Prayer App

Three apps share one Supabase project:

| App | Folder | Who uses it | Where |
| --- | --- | --- | --- |
| **The Prayer App** | `App.tsx`, `src/` | Listeners, no account | iPhone and Android |
| **Prayer Warriors** | `warriors/` | Prayer Warriors record and submit prayers | iPhone, Android and web: https://prayer-uploads-charleseluma.expo.app |
| **Admin Console** | `console/` | Administrators add and remove Prayer Warriors, approve prayers, see activity | Web: https://prayer-admin-charleseluma.expo.app |

## How a prayer gets to listeners

1. An administrator adds a Prayer Warrior in the Admin Console and assigns their days. The console creates a private sign-up link to send them.
2. The Prayer Warrior opens the link, chooses a password, and signs in to the Prayer Warriors app.
3. They record a prayer with the phone's microphone (or choose an audio file) for their day or any open day, then submit it.
4. The prayer waits for review. An administrator listens in the Admin Console and approves it, or asks for changes with a note.
5. Approved prayers appear in The Prayer App on their day. Listeners can play this week and last week; older prayers are kept for a future paid archive.

Rules, enforced by the database (`supabase/schema.sql`):
- Administrators manage people and review prayers; they cannot post or change prayers.
- A Prayer Warrior can post on their assigned days and on days no one is assigned to, and cannot overwrite a day someone else has filled.
- Any change to a prayer sends it back for review.
- Removing a Prayer Warrior blocks their sign-in immediately; their prayers stay.
- Every sign-in, submission, review and account change is recorded in the activity log.

| Folder | What it is |
| --- | --- |
| `supabase/schema.sql` | Tables, security rules, activity triggers and audio storage. Applied automatically by the pipeline. |
| `supabase/functions/team-admin/` | Account service: invite, new sign-in link, remove, restore (needs the service role, so it runs on Supabase). |

## Pipeline

Every push to `main` runs `.github/workflows/build.yml`:

| Step | What happens |
| --- | --- |
| Check | Typechecks all three apps. Fails if a required setting is missing. |
| Backend | Applies `supabase/schema.sql`, updates sign-in settings, deploys the account service. |
| Web apps | Publishes Prayer Warriors (web) and the Admin Console. |
| Android test builds | Builds whichever phone app changed. Install links are on expo.dev → Projects → Builds. |

Settings (GitHub → Settings → Secrets and variables → Actions): secrets `EXPO_TOKEN`, `SUPABASE_ACCESS_TOKEN`; variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`. See SETUP.md.

## For developers

```bash
npm ci && npx tsc --noEmit                      # listener app
(cd warriors && npm ci && npx tsc --noEmit)     # Prayer Warriors
(cd console && npm ci && npx tsc --noEmit)      # Admin Console
npx expo export --platform web --output-dir dist && node scripts/build-web-preview.mjs   # listener browser preview
```
