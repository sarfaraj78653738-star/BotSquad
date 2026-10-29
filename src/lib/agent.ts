import { fetchPublicPageText } from './providers';
import { deleteWorkspaceFile, listWorkspaceFiles, readWorkspaceFile, safeWorkspacePath, writeWorkspaceFile } from './workspace';

// Agent tools for Main Chat (user order 2026-10-29): the app is not
// just a chatbot anymore — Main Chat can work with files, search its
// workspace, read public web pages, and drive the in-chat browser
// panel (via the existing [BROWSER] commands in its replies). It stays
// a chatbot too: tools run only when the model emits a tool block for
// a real task; a plain question still gets a plain reply, with no
// tool use at all.
// Hard limits, stated plainly: the phone cannot run terminal commands,
// servers, tests, or git, so there is no "run" tool — the agent writes
// code, the user previews pages on the phone and exports the rest.
// File writes, edits, and deletes NEVER run without the user's
// approval on that exact change (the approval card in chat).
export type AgentToolCall = { name: string; args: Record<string, unknown> };

export const AGENT_TOOLS_PROMPT = `
You are also an agent with tools, not only a chatbot. For ordinary questions, just answer normally with no tool use. When the user asks you to build, change, find, or check something in files or on the web, use tools. Emit each tool call as its own fenced block, and nothing else in that message except at most one short line before the block:
\`\`\`tool
{"name": "list_files", "args": {}}
\`\`\`
Available tools:
- list_files {path?}: list workspace files (path is a folder prefix, blank for all).
- read_file {path}: read one workspace file (text only).
- search_files {query}: search all workspace files for text, returns matching file paths with line numbers.
- write_file {path, content}: create or overwrite a workspace file. Runs ONLY after the user approves that exact change in chat.
- edit_file {path, old_text, new_text}: replace the first occurrence of old_text in a workspace file. Runs ONLY after the user approves that exact change.
- delete_file {path}: delete a workspace file. Runs ONLY after the user approves it.
- browser_read {url}: read a PUBLIC web page as text. Never for logins, paywalls, or CAPTCHAs — those always go to the user.
Rules: never invent file contents you have not read; paths stay inside the workspace (no absolute paths, no ".."); one tool call per block; after each tool result, either emit the next tool block or give your final reply with no tool block. In your final reply, briefly list what you did (files created/changed, what to preview or export). You cannot run commands, servers, tests, or git on this phone — say so plainly if asked, and offer the workspace export instead.
`;

export function parseToolCalls(reply: string): AgentToolCall[] {
  const calls: AgentToolCall[] = [];
  const re = /```tool\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(reply))) {
    try {
      const obj = JSON.parse(m[1]) as { name?: unknown; args?: unknown };
      if (obj && typeof obj.name === 'string') {
        calls.push({ name: obj.name, args: (obj.args && typeof obj.args === 'object' ? obj.args : {}) as Record<string, unknown> });
      }
    } catch { /* a malformed block is ignored; the loop asks for a retry via the next turn */ }
  }
  return calls;
}

export function stripToolBlocks(reply: string): string {
  return reply.replace(/```tool\s*\n[\s\S]*?```/g, '').trim();
}

function argString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === 'string' ? v : '';
}

// approve() shows the user the exact change and resolves true only
// when they tap Approve. Read-only tools never call it.
export async function executeAgentTool(
  call: AgentToolCall,
  approve: (summary: string, preview: string) => Promise<boolean>,
): Promise<string> {
  switch (call.name) {
    case 'list_files': {
      const prefix = argString(call.args, 'path');
      const files = await listWorkspaceFiles();
      const filtered = prefix ? files.filter((f) => f.path.startsWith(prefix)) : files;
      return filtered.length ? filtered.map((f) => `${f.path} (${f.size} bytes)`).join('\n') : '(workspace is empty)';
    }
    case 'read_file': {
      const p = safeWorkspacePath(argString(call.args, 'path'));
      if (!p) return 'Error: invalid path (paths stay inside the workspace, no "..").';
      try { return await readWorkspaceFile(p); }
      catch { return 'Error: could not read that file (it may not exist).'; }
    }
    case 'search_files': {
      const query = argString(call.args, 'query');
      if (!query) return 'Error: search_files needs a query.';
      const files = await listWorkspaceFiles();
      const hits: string[] = [];
      for (const f of files) {
        try {
          const text = await readWorkspaceFile(f.path);
          const lines = text.split('\n');
          lines.forEach((line, i) => {
            if (line.toLowerCase().includes(query.toLowerCase()) && hits.length < 40) {
              hits.push(`${f.path}:${i + 1}: ${line.trim().slice(0, 160)}`);
            }
          });
        } catch { /* skip unreadable files */ }
      }
      return hits.length ? hits.join('\n') : `(no matches for "${query}")`;
    }
    case 'write_file': {
      const p = safeWorkspacePath(argString(call.args, 'path'));
      const content = argString(call.args, 'content');
      if (!p) return 'Error: invalid path.';
      if (!content) return 'Error: write_file needs content.';
      const ok = await approve(`Write ${p}`, content.slice(0, 800));
      if (!ok) return 'Rejected by user.';
      await writeWorkspaceFile(p, content);
      return `Wrote ${p} (${content.length} chars).`;
    }
    case 'edit_file': {
      const p = safeWorkspacePath(argString(call.args, 'path'));
      const oldText = argString(call.args, 'old_text');
      const newText = argString(call.args, 'new_text');
      if (!p || !oldText) return 'Error: edit_file needs path and old_text.';
      let current: string;
      try { current = await readWorkspaceFile(p); }
      catch { return 'Error: could not read that file.'; }
      if (!current.includes(oldText)) return 'Error: old_text was not found in the file — read it first and use its exact text.';
      const ok = await approve(`Edit ${p}`, `Replace:\n${oldText.slice(0, 400)}\nWith:\n${newText.slice(0, 400)}`);
      if (!ok) return 'Rejected by user.';
      await writeWorkspaceFile(p, current.replace(oldText, newText));
      return `Edited ${p}.`;
    }
    case 'delete_file': {
      const p = safeWorkspacePath(argString(call.args, 'path'));
      if (!p) return 'Error: invalid path.';
      const ok = await approve(`Delete ${p}`, 'This file will be removed from the workspace.');
      if (!ok) return 'Rejected by user.';
      await deleteWorkspaceFile(p);
      return `Deleted ${p}.`;
    }
    case 'browser_read': {
      const url = argString(call.args, 'url');
      if (!/^https:\/\/[^\/\s]+/.test(url)) return 'Error: browser_read needs a full https:// URL.';
      try {
        const page = await fetchPublicPageText(url);
        return `Title: ${page.title}\n${page.text.slice(0, 8000)}`;
      } catch {
        return 'Error: could not read that page (public pages only; no login, paywall, or CAPTCHA).';
      }
    }
    default:
      return `Error: unknown tool "${call.name}". Available: list_files, read_file, search_files, write_file, edit_file, delete_file, browser_read.`;
  }
}
