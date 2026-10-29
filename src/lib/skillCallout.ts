import { Skill } from './types';

// Skill callouts (user order 2026-10-29): skills are NOT pre-enabled
// per bot anymore. The Skills screen is just the saved-skills library.
// To use one, the user calls it out at the START of the chat message:
// "/ponytail audit this repo" or "ponytail skill, audit this repo".
// This parses that callout and returns the skill plus the message
// with the callout stripped, for this turn only. Anything that is not
// a callout passes through unchanged, so ordinary chat never breaks.
const norm = (s: string) => s.toLowerCase().replace(/[\s\-_]+/g, '');

export function parseSkillCallout(text: string, skills: Skill[]): { skill: Skill | null; cleanText: string } {
  const trimmed = text.trim();
  if (!trimmed) return { skill: null, cleanText: trimmed };

  // Slash form: /name rest...
  const slash = trimmed.match(/^\/(\S+)\s*([\s\S]*)$/);
  if (slash) {
    const token = norm(slash[1]);
    const exact = skills.find((s) => norm(s.name) === token);
    const prefix = skills
      .filter((s) => norm(s.name).startsWith(token))
      .sort((a, b) => norm(a.name).length - norm(b.name).length);
    const skill = exact ?? prefix[0] ?? null;
    if (skill) return { skill, cleanText: slash[2].trim() || 'Use this skill.' };
    return { skill: null, cleanText: trimmed };
  }

  // Name-prefix form: "Skill Name, rest..." — longest name wins, so
  // "ponytail skill" beats "ponytail" when both exist.
  const lower = trimmed.toLowerCase();
  const ordered = [...skills].sort((a, b) => b.name.length - a.name.length);
  for (const s of ordered) {
    const name = s.name.toLowerCase();
    if (lower === name) return { skill: s, cleanText: 'Use this skill.' };
    if (lower.startsWith(name)) {
      const next = trimmed[name.length];
      if (next === ' ' || next === ',' || next === ':' || next === '\n') {
        const rest = trimmed.slice(name.length).replace(/^[\s,:]+/, '').trim();
        return { skill: s, cleanText: rest || 'Use this skill.' };
      }
    }
  }
  return { skill: null, cleanText: trimmed };
}
