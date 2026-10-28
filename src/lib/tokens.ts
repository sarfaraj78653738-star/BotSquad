// TeamBots design tokens — warm paper palette, original TeamBots design.
// Components must use these tokens, never raw hex values.
export const tokens = {
  bg: '#FAF9F5',
  surface: '#FFFFFF',
  surfaceMuted: '#F1EEE6',
  border: '#E5E0D5',
  text: '#211D18',
  textMuted: '#6E675C',
  accent: '#2B2620',
  accentSoft: '#EFEAE0',
  onAccent: '#FAF9F5',
  danger: '#B3261E',
  success: '#2E7D4F',
  warning: '#9A6700',
  radius: { sm: 8, md: 10, lg: 12 },
  space: { xs: 6, sm: 10, md: 16, lg: 24 },
  font: { sm: 14, md: 16, lg: 19, xl: 28 },
} as const;

export type AvatarColor = string;
// Soft warm tints for new bots; the Avatar renders the bot's initial on a
// translucent tint, so older stored colours still read cleanly too.
export const AVATAR_COLORS = ['#E7DCC8', '#DDE7DC', '#E3DDE8', '#F0DCD2', '#DDE6E6', '#E9E2D0'] as const;
// Legacy field only: stored on every bot for database compatibility.
// The UI no longer renders this value — avatars show the bot's initial.
export const AVATAR_ICONS = ['◆', '●', '▲', '■', 'T', '⬢'] as const;
