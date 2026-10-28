// Automatic skill saving — pattern-based, on-device only, NO approval
// prompt, NO extra model call, NO external send.
//
// Shafy's order: when the AI itself judges something skill-worthy, it
// saves it itself without asking. This module is the honest version of
// that: it does NOT call a model to "judge" anything (that would cost
// the user's provider tokens on every reply and would be unreliable).
// Instead it matches clear, explicit signals in the user's own words in
// the just-finished exchange. Anything subtler is simply not saved —
// the user can still add a skill manually on the Skills page.
//
// A detected skill is saved to the same local skills store shown on the
// Skills page, where the user can see, edit, enable, or delete it. It is
// NEVER enabled for any bot automatically, so it cannot change any bot's
// behaviour until the user reviews it and enables it. Saved skills are
// notes/definitions only: they never override hard boundaries, never
// send anything externally, and never execute code (the prompt builder
// already treats enabled skills as untrusted data under the boundaries).

// Anything that looks like an attempt to override instructions, reveal
// credentials, or drive an external send is never auto-saved.
const BLOCKED = /ignore|disregard|override|jailbreak|system prompt|reveal (your|the) (key|password|prompt|instructions)|send (it|this|that|the) to|publish (it|this|that|the)/i;

// Clear skill-worthy signals in the user's own message.
const STANDING_INSTRUCTION = /\b(always|never)\b|from now on|\bremember\b|keep (it|this) (like )?(this|that)|do it like (this|that)|use .* instead/i;
const CORRECTION = /^(no,|no |not that|wrong|incorrect)|instead|don't do that again|don't .* again|next time/i;
const PREFERENCE = /\bi (prefer|like|want)\b|my preference/i;

export function detectAutoSkill(userText: string, assistantText: string): { name: string; instruction: string } | null {
  const user = userText.trim();
  const reply = assistantText.trim();
  // Only a completed, non-refused exchange counts, and attachment notes
  // are never instructions.
  if (user.length < 10 || reply.length === 0) return null;
  if (user.startsWith('[Attachment:')) return null;
  if (/^(i can't|i cannot|sorry,? i can't)/i.test(reply)) return null;
  if (BLOCKED.test(user)) return null;
  const isSkillWorthy = STANDING_INSTRUCTION.test(user) || CORRECTION.test(user) || PREFERENCE.test(user);
  if (!isSkillWorthy) return null;
  const instruction = user.slice(0, 300);
  const oneLine = user.replace(/\s+/g, ' ');
  const name = `Auto: ${oneLine.slice(0, 60)}`;
  return { name, instruction };
}
