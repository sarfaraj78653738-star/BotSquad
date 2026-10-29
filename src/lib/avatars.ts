// Cute avatar variants, drawn in code (no image assets, no AI
// images). Each variant is a face colour + ear style + blush flag.
// The user picks one per bot, and one for Main Chat; nothing here is
// a default forced on them — the picker is the only way a variant is
// chosen, and bots without a pick fall back to a stable variant from
// their id so old bots still show a face.
export type AvatarVariant = { id: string; name: string; bg: string; ears: 'none' | 'round' | 'cat' | 'antenna'; blush: boolean };

export const AVATAR_VARIANTS: AvatarVariant[] = [
  { id: 'peach', name: 'Peach', bg: '#F2C9A0', ears: 'round', blush: true },
  { id: 'mint', name: 'Mint', bg: '#BFE3C6', ears: 'none', blush: false },
  { id: 'sky', name: 'Sky', bg: '#BFD9EA', ears: 'antenna', blush: true },
  { id: 'berry', name: 'Berry', bg: '#D9B8D6', ears: 'cat', blush: true },
  { id: 'sunny', name: 'Sunny', bg: '#F2D98C', ears: 'round', blush: false },
  { id: 'lilac', name: 'Lilac', bg: '#C9BFE8', ears: 'none', blush: true },
  { id: 'coral', name: 'Coral', bg: '#F0A898', ears: 'cat', blush: false },
  { id: 'slate', name: 'Slate', bg: '#C9CED6', ears: 'antenna', blush: false },
];

export const MAIN_CHAT_AVATAR_DEFAULT = 'sunny';

export function avatarFor(seed: string | undefined, explicit?: string): AvatarVariant {
  const found = AVATAR_VARIANTS.find((v) => v.id === explicit);
  if (found) return found;
  if (!seed) return AVATAR_VARIANTS[0]!;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_VARIANTS[hash % AVATAR_VARIANTS.length]!;
}
