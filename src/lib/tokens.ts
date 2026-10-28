// TeamBots design tokens — original values, no borrowed brand colours.
// Components must use these tokens, never raw hex values.
export const tokens = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF2F7',
  border: '#D9E2EC',
  text: '#0F172A',
  textMuted: '#5B6B7F',
  accent: '#2563EB',
  accentSoft: '#DBEAFE',
  onAccent: '#FFFFFF',
  danger: '#DC2626',
  success: '#15803D',
  warning: '#B45309',
  radius: { sm: 8, md: 14, lg: 20 },
  space: { xs: 6, sm: 10, md: 16, lg: 24 },
  font: { sm: 13, md: 15, lg: 18, xl: 24 },
} as const;

export type AvatarColor = string;
export const AVATAR_COLORS = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#DB2777', '#0891B2'] as const;
export const AVATAR_ICONS = ['◆', '●', '▲', '■', '★', '⬢'] as const;
