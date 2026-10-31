// Process-version shim (2026-10-31 launch-crash fix, belt and
// braces alongside the lazy gitDownload import in agent.ts).
// React Native's process shim has no `version`, but browserify
// stream shims read process.version.slice(0, 5) at require time
// (readable-stream 2.3.8, pulled in by isomorphic-git). Loading
// that chain without this field throws before any UI renders.
// Only the missing field is filled; the existing shim (env,
// nextTick, browser flag) is preserved untouched.
const p = (globalThis as any).process ?? {};
if (typeof p.version !== 'string') p.version = 'v20.0.0';
(globalThis as any).process = p;
