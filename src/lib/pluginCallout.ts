import { Plugin } from './types';

// Plugin callouts (user order 2026-10-30): plugins work like skills —
// called out at the START of the chat message, for this turn only, in
// Main, bot, and group chats alike (never Main-only). "/plugin-name
// ..." or "Plugin Name, ...". What the chat gets is the plugin's
// manifest (its skills/actions as definitions) plus its description
// and permissions. Plugin CODE itself never runs on the phone — the
// same Phase-1 limit the app already states for code MCP servers
// (they need a host). A plugin with executable code is still usable
// this way, but the block says plainly that its code does not run.
const norm = (s: string) => s.toLowerCase().replace(/[\s\-_]+/g, '');

export function parsePluginCallout(text: string, plugins: Plugin[]): { plugin: Plugin | null; cleanText: string } {
  const trimmed = text.trim();
  if (!trimmed) return { plugin: null, cleanText: trimmed };

  // Slash form: /name rest...
  const slash = trimmed.match(/^\/(\S+)\s*([\s\S]*)$/);
  if (slash) {
    const token = norm(slash[1]);
    const exact = plugins.find((p) => norm(p.name) === token);
    const prefix = plugins
      .filter((p) => norm(p.name).startsWith(token))
      .sort((a, b) => norm(a.name).length - norm(b.name).length);
    const plugin = exact ?? prefix[0] ?? null;
    if (plugin) return { plugin, cleanText: slash[2].trim() || 'Use this plugin.' };
    return { plugin: null, cleanText: trimmed };
  }

  // Name-prefix form: "Plugin Name, rest..." — longest name wins.
  const lower = trimmed.toLowerCase();
  const ordered = [...plugins].sort((a, b) => b.name.length - a.name.length);
  for (const p of ordered) {
    const name = p.name.toLowerCase();
    if (lower === name) return { plugin: p, cleanText: 'Use this plugin.' };
    if (lower.startsWith(name)) {
      const next = trimmed[name.length];
      if (next === ' ' || next === ',' || next === ':' || next === '\n') {
        const rest = trimmed.slice(name.length).replace(/^[\s,:]+/, '').trim();
        return { plugin: p, cleanText: rest || 'Use this plugin.' };
      }
    }
  }
  return { plugin: null, cleanText: trimmed };
}

export function pluginPromptBlock(p: Plugin): string {
  const manifest = (p.manifest || '').slice(0, 3000);
  const codeNote = p.hasExecutableCode
    ? ' This plugin contains executable code, which does NOT run on this phone — never claim to have executed it.'
    : '';
  return `\n\n[PLUGIN "${p.name}" — ${p.description}${p.author ? ` (by ${p.author})` : ''}. Permissions it asks for: ${p.permissions || 'none listed'}.${codeNote} Its manifest (skills/actions as definitions only — use them as guidance for this turn):\n${manifest}]`;
}
