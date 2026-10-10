# The Prayer App

A daily prayer app with no login. It opens on today's prayer, and listeners can play any of the seven daily prayers at any time. Audio keeps playing when the phone is on silent or locked.

## Changing the prayers

1. Replace the audio file for a day in `assets/audio/` (`sunday.mp3` … `saturday.mp3`). Keep the same file name.
2. Edit the title, theme and description for that day in `src/content/prayers.ts`.
3. Push to `main`. A new test build starts automatically.

The audio in this repo is placeholder tone, not real prayers.

## Pipeline

| Step | What happens |
| --- | --- |
| Push to `main` | GitHub Actions typechecks the app and builds the web bundle |
| Android test build | If the `EXPO_TOKEN` secret is set, Expo builds an installable APK. The install link is on expo.dev under the project's Builds page |
| iPhone test build | Added once the Apple Developer account exists (TestFlight) |
| Store release | Production builds, run only when the app is approved by the tester |

### One-time setup

- `EXPO_TOKEN`: create at expo.dev → Account settings → Access tokens, then add it in GitHub → Settings → Secrets and variables → Actions → New repository secret.

## For developers

```bash
npm ci
npx expo start                 # local development
npx tsc --noEmit               # typecheck
npx expo export --platform web --output-dir dist && node scripts/build-web-preview.mjs   # single-file browser preview
```
