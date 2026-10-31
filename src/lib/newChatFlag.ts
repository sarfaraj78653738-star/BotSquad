// In-memory "start a fresh chat" flag (fix 2026-11-01 — the fresh=1
// URL param could also arrive from an external deep link, which
// created a thread row with no user tap). Only the drawer's New-chat
// control writes this flag; chat/[id].tsx consumes it once on mount,
// so a URL param alone never creates a row. In-memory on purpose: a
// flag written to disk could survive a restart and spawn a row the
// user never asked for.
let freshChatRequested = false;

export function requestFreshChat(): void {
  freshChatRequested = true;
}

export function consumeFreshChat(): boolean {
  const fresh = freshChatRequested;
  freshChatRequested = false;
  return fresh;
}
