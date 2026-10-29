import { requireNativeModule } from 'expo-modules-core';

// Android home-screen shortcut ("Add to home"): a pinned shortcut
// that opens one exact chat when tapped from the phone's home screen.
// Android only shows a system confirmation dialog — the app never pins
// silently. The native module lives in modules/chat-shortcut; if it is
// absent (e.g. an older build), this reports 'unavailable' instead of
// crashing. The deep link is handled in app/_layout.tsx.
type ChatShortcutNative = {
  requestPinShortcut: (label: string, uri: string) => Promise<boolean>;
};

export async function addChatToHome(label: string, uri: string): Promise<'added' | 'unavailable' | 'failed'> {
  try {
    const mod = requireNativeModule<ChatShortcutNative>('ChatShortcut');
    const ok = await mod.requestPinShortcut(label.slice(0, 40), uri);
    return ok ? 'added' : 'failed';
  } catch {
    return 'unavailable';
  }
}

export function shortcutUri(kind: 'main' | 'bot' | 'group', id: string): string {
  if (kind === 'main') return `teambots://open?kind=main&chatId=${encodeURIComponent(id)}`;
  if (kind === 'bot') return `teambots://open?kind=bot&botId=${encodeURIComponent(id)}`;
  return `teambots://open?kind=group&threadId=${encodeURIComponent(id)}`;
}
