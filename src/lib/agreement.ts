// First-run Terms + age gate (user order 2026-10-31): before Main
// Chat, a signed-in user must (1) confirm they are 18 or older via
// a birthdate check and (2) agree to the Terms of Use + Privacy
// Policy. The birthdate itself is NEVER stored — only the fact and
// time of verification. The record lives in the settings table, so
// Delete account wipes it (a re-sign-in gates again). Bump
// TERMS_VERSION when the terms change to re-gate everyone.
import { getSetting, setSetting } from './db';

export const TERMS_VERSION = '2026-10-31';
const KEY = 'terms_age_agreed';

export type Agreement = { version: string; agreedAt: string; ageVerifiedAt: string };

export async function getAgreement(): Promise<Agreement | null> {
  try {
    const raw = await getSetting(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Agreement;
    if (parsed.version !== TERMS_VERSION || !parsed.agreedAt || !parsed.ageVerifiedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setAgreement(): Promise<void> {
  const now = new Date().toISOString();
  await setSetting(KEY, JSON.stringify({ version: TERMS_VERSION, agreedAt: now, ageVerifiedAt: now }));
}

// Parses DD/MM/YYYY (slashes or dashes) and returns the age in years,
// or null for an invalid date. Calendar-checked (31 Feb is invalid).
export function ageFromDob(input: string): number | null {
  const m = input.trim().replace(/-/g, '/').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null;
  const dob = new Date(year, month - 1, day);
  if (dob.getFullYear() !== year || dob.getMonth() !== month - 1 || dob.getDate() !== day) return null;
  const now = new Date();
  let age = now.getFullYear() - year;
  if (now.getMonth() < month - 1 || (now.getMonth() === month - 1 && now.getDate() < day)) age -= 1;
  return age;
}
