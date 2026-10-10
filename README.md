# The Prayer App

A daily prayer app with no login. It opens on today's prayer, and listeners can play any prayer posted so far this week. Audio keeps playing when the phone is on silent or locked, and this week's prayers are saved on the phone for offline listening.

## Posting prayers

Prayers are posted one day at a time from the private upload page (`admin/`), stored in Supabase, and downloaded by the app. See **SETUP.md** for the one-time connection steps.

Until the prayer service is connected, the app runs in demo mode with the sample audio in `assets/audio/`.

| Folder | What it is |
| --- | --- |
| `App.tsx`, `src/` | Listener app (iPhone and Android) |
| `admin/` | Upload page (web only), published to EAS Hosting |
| `supabase/schema.sql` | Database tables, security rules and audio storage |

## Pipeline

| Step | What happens |
| --- | --- |
| Push to `main` | GitHub Actions typechecks the listener app and the upload page |
| Upload page | Published to https://prayer-uploads-charleseluma.expo.app once Supabase is connected |
| Android test build | If the `EXPO_TOKEN` secret is set, Expo builds an installable APK. The install link is on expo.dev under the project's Builds page |
| iPhone test build | Added once the Apple Developer account exists (TestFlight) |
| Store release | Production builds, run only when the app is approved by the tester |

### One-time setup

See SETUP.md. GitHub needs the `EXPO_TOKEN` secret and the `SUPABASE_URL` and `SUPABASE_ANON_KEY` variables.

## For developers

```bash
npm ci
npx expo start                 # local development
npx tsc --noEmit               # typecheck
npx expo export --platform web --output-dir dist && node scripts/build-web-preview.mjs   # single-file browser preview
```
