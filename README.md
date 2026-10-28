# TeamBots — Phase 1 (placeholder brand, NOT final)

Clean-room, original code and copy. No affiliation with any other AI product.
No login, no server. Your chats stay on your device; your API keys stay in
the device secure store and are sent only to the provider you chose.

## What Phase 1 does
- Bot team: create/edit/delete bots. Each bot has name, role, avatar, task,
  personality, instructions, boundaries, provider, model.
- Task-as-personality: a bot's system prompt is built from role + task +
  personality + boundaries + memory notes (+ enabled skills). Out-of-task
  requests get a redirect hint, not a general answer.
- Chat per bot, persisted locally in SQLite, with search, archive, and
  draft approval (nothing is sent/published/bought/deleted externally).
- BYOK: OpenAI-compatible, Anthropic, Gemini adapters. No key = a clear
  "add your key" error, never a fake reply. Invalid key / 429 / no network
  surface plainly, with no retry loop.
- Inbuilt browser: Browser tab (WebView) + bot page fetch for public pages
  only, with source links in the work log. No login, no paywall/CAPTCHA bypass.
- Skills, routines (draft on open), auto-improve memory notes (visible,
  editable, deletable; boundaries always win; the model is NOT fine-tuned).
- Connections, plugins (definitions only, no code execution), MCP over
  HTTP/SSE only with per-tool enablement and approval-gated calls.
- Universal GitHub install: paste a repo URL, see detected type, what will
  install, what runs on phone vs needs a host, and permissions/tools — then
  approve. Instruction repos run on the phone; code MCP servers do NOT run
  on the phone (connect a hosted HTTP/SSE URL, or install as "needs a host").
- Group chat (Group tab): pick 2+ bots, send one message, each bot replies
  in turn with its own task/personality and provider/model, then a summary.
  Stored locally in SQLite (group_threads / group_members / group_messages).
  A bot with no key gets a clear status note, never a fake reply. Replies
  stay drafts until you approve them.
- Voice input (chat screen, built APK only): mic button using
  @react-native-voice/voice 3.2.4 with its Expo config plugin, which adds
  RECORD_AUDIO to the Android manifest. It does NOT work in Expo Go
  (custom native code) — there it shows a clear "built APK needed" message
  and inserts nothing. Transcripts are inserted into the input box for you
  to check; nothing is sent automatically. Note: that library is deprecated
  upstream in favour of expo-speech-recognition — that is the right swap
  when this app upgrades to a newer Expo SDK.
- Ads + premium (PLACEHOLDER): ad slot in free mode; Remove Ads screen with
  a clearly labelled placeholder purchase. Premium removes ads ONLY.
  TODO in `src/lib/ads.ts`: replace with real AdMob IDs and a real Play
  Billing product ID before any Play release. No real IDs are shipped here.

## Run it (on a real machine with Android Studio / Expo Go)
```bash
cd ~/workspace/grok-bot-replica/app
npm install   # if npm fails with EPERM chown in this sandbox, use: bun install
npx tsc --noEmit
npx expo start
# then press `a` for Android, or scan the QR code in Expo Go.
# NOTE: voice input does NOT work in Expo Go (native module). For a real
# device build with voice: npx expo run:android (needs Android SDK + JDK 17)
# or, after prebuild:
#   CI=1 npx expo prebuild --platform android
#   cd android && ./gradlew assembleRelease
#   # APK at: android/app/build/outputs/apk/release/app-release.apk
#   # (debug APK, no signing needed for sideload testing:
#   #  ./gradlew assembleDebug -> app/build/outputs/apk/debug/app-debug.apk)
```

## What is NOT verified here
- No Play build / APK was produced in this sandbox (see build log below).
  `expo prebuild` DID succeed here and generated android/ (including
  RECORD_AUDIO in the manifest), but a Gradle build needs JDK + Android SDK,
  which this sandbox does not have — see the APK section in the build log.
- Real AdMob / Play Billing, real provider calls, real MCP servers, and
  real GitHub installs need a device + the user's own keys/URLs to test.

## Files
- `app/` — Expo Router routes: (tabs)/team, connect, routines, browser,
  settings; chat/[id]; bot/[id]; index redirect.
- `src/lib/` — tokens, types, db (SQLite), keys (SecureStore), prompt,
  providers, ads (placeholder), connections, mcp, github (universal detector).
- `src/components/ui.tsx` — token-only primitives.
