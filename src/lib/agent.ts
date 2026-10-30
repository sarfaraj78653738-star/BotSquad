import { fetchPublicPageText } from './providers';
import { deleteWorkspaceFile, listWorkspaceFiles, readWorkspaceFile, safeWorkspacePath, writeWorkspaceFile } from './workspace';
import { serviceRequest, vercelDeploy } from './serviceTools';
import { listMcpServers } from './db';
import { getMcpToken } from './connections';
import { requireHttpsUrl } from './mcp';

// Agent tools for Main Chat (user order 2026-10-29): the app is not
// just a chatbot anymore — Main Chat can work with files, search its
// workspace, read public web pages, drive the in-chat browser panel
// (via the existing [BROWSER] commands in its replies), and now work
// on CONNECTED services: service_request calls any endpoint of any
// verified connection, and vercel_deploy publishes workspace files
// live. It stays a chatbot too: tools run only when the model emits a
// tool block for a real task; a plain question still gets a plain
// reply, with no tool use at all.
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
- service_request {service, method, path, body?}: call a CONNECTED service's own API. service is the service name from [CONNECTED SERVICES] (the prompt lists what is actually connected — never call a service that is not listed). method is GET, POST, PUT, PATCH, or DELETE. path is a relative API path only, like "/user/repos" — never a full URL. body is a JSON string for non-GET calls. GET calls run straight away; any other method runs ONLY after the user approves that exact call in chat. Examples: GitHub list repos GET "/user/repos"; Slack send POST "/chat.postMessage" {"channel":"#general","text":"hi"}; Telegram send POST "/sendMessage" {"chat_id":"123","text":"hi"}; Trello create card POST "/cards" {"name":"Buy milk","idList":"abc"}; Todoist create task POST "/tasks" {"content":"Buy milk"}; WhatsApp send POST "/{phoneId}/messages" {"messaging_product":"whatsapp","to":"919999999999","type":"text","text":{"body":"hi"}} — {phoneId} is filled from the connection, never invent it. You never see any key or token: never ask for one, never print one, never put one in a path or body.
- vercel_deploy {files, project?}: publish workspace files as a live production site on Vercel (the "make my website live" tool). files is a list of workspace paths, like ["index.html", "style.css"]. Runs ONLY after the user approves the deploy, and only when Vercel is connected. Returns the live URL.
- mcp_call {server, tool, args}: run one tool of the MCP server called out this turn (see the [MCP SERVER] block in your prompt — never call a server that is not called out). args is a JSON object. Runs ONLY after the user approves that exact call in chat.
Rules: never invent file contents you have not read; paths stay inside the workspace (no absolute paths, no ".."); one tool call per block; after each tool result, either emit the next tool block or give your final reply with no tool block. In your final reply, briefly list what you did (files created/changed, what to preview or export, any live URL). You cannot run commands, servers, tests, or git on this phone — say so plainly if asked, and offer the workspace export instead. For a connected service you do not know the API for, try its standard REST path; if the service returns an error, report it plainly instead of guessing another call.
`;

// Workspace file tools for bot and group chats (user order 2026-10-30):
// the same file tools Main Chat has, including deploy (vercel_deploy
// enabled for bot/group chats on the user's explicit 2026-10-30 order:
// "whatever Main Chat can do, bot and group can do"). Writes/edits/
// deletes/deploys still pause at the chat's approval card, and the loop
// filter is what keeps any other tool out of these chats.
export const FILE_TOOL_NAMES = ['list_files', 'read_file', 'search_files', 'write_file', 'edit_file', 'delete_file', 'browser_read'];

export const BOT_FILE_TOOLS_PROMPT = `
[WORKSPACE FILE TOOLS — you can also work with files in the phone's workspace, exactly like Main Chat, with the same approval rule. Emit each tool call as its own fenced block:
\`\`\`tool
{"name": "write_file", "args": {"path": "index.html", "content": "..."}}
\`\`\`
- list_files {path?}: list workspace files (blank for all).
- read_file {path}: read one workspace file (text only).
- search_files {query}: search workspace files for text.
- write_file {path, content}: create or overwrite a workspace file. Runs ONLY after the user approves that exact change.
- edit_file {path, old_text, new_text}: replace text in a workspace file. Runs ONLY after the user approves that exact change.
- delete_file {path}: delete a workspace file. Runs ONLY after the user approves it.
- browser_read {url}: read a PUBLIC web page as text (no logins, paywalls, or CAPTCHAs).
- vercel_deploy {files, project?}: publish workspace files as a live production site on Vercel. Runs ONLY after the user approves the deploy, and only when Vercel is connected. Returns the live URL.
Rules: paths stay inside the workspace (no absolute paths, no ".."); one tool call per block; after each tool result, either emit the next tool block or give your final reply with no tool block. In your final reply, briefly list what you did (files created/changed, what to preview or export). You cannot run commands, servers, tests, or git on this phone; say so plainly if asked.]`;

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
  opts?: { section?: string },
): Promise<string> {
  // Section scoping (user order 2026-10-30): bot chats work under
  // "bots/<botId>/", group chats under "groups/<threadId>/", Main Chat
  // has no section and sees everything. A sectioned caller can only
  // touch its own section: plain paths are rewritten into it, and
  // paths that already start with it pass through — so a bot or group
  // can never see or overwrite Main Chat's or another chat's files.
  const section = opts?.section ?? '';
  const sectionPath = (raw: string): string | null => {
    const cleaned = safeWorkspacePath(raw);
    if (!cleaned) return null;
    if (!section) return cleaned;
    if (cleaned === section || cleaned.startsWith(`${section}/`)) return cleaned;
    return `${section}/${cleaned}`;
  };
  switch (call.name) {
    case 'list_files': {
      const rawPrefix = argString(call.args, 'path');
      const prefix = section ? (rawPrefix ? `${section}/${rawPrefix}` : `${section}/`) : rawPrefix;
      const files = await listWorkspaceFiles();
      const filtered = prefix ? files.filter((f) => f.path.startsWith(prefix)) : files;
      return filtered.length ? filtered.map((f) => `${f.path} (${f.size} bytes)`).join('\n') : '(workspace is empty)';
    }
    case 'read_file': {
      const p = sectionPath(argString(call.args, 'path'));
      if (!p) return 'Error: invalid path (paths stay inside the workspace, no "..").';
      try { return await readWorkspaceFile(p); }
      catch { return 'Error: could not read that file (it may not exist).'; }
    }
    case 'search_files': {
      const query = argString(call.args, 'query');
      if (!query) return 'Error: search_files needs a query.';
      const files = await listWorkspaceFiles();
      const scoped = section ? files.filter((f) => f.path.startsWith(`${section}/`)) : files;
      const hits: string[] = [];
      for (const f of scoped) {
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
      const p = sectionPath(argString(call.args, 'path'));
      const content = argString(call.args, 'content');
      if (!p) return 'Error: invalid path.';
      if (!content) return 'Error: write_file needs content.';
      const ok = await approve(`Write ${p}`, content.slice(0, 800));
      if (!ok) return 'Rejected by user.';
      await writeWorkspaceFile(p, content);
      return `Wrote ${p} (${content.length} chars).`;
    }
    case 'edit_file': {
      const p = sectionPath(argString(call.args, 'path'));
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
      const p = sectionPath(argString(call.args, 'path'));
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
    case 'service_request': {
      const service = argString(call.args, 'service');
      const method = argString(call.args, 'method') || 'GET';
      const path = argString(call.args, 'path');
      const rawBody = call.args.body;
      const body = typeof rawBody === 'string' ? rawBody : rawBody ? JSON.stringify(rawBody) : undefined;
      if (!service || !path) return 'Error: service_request needs service and path.';
      // Reads run straight away; anything that sends, creates, or
      // changes data on a service pauses for the user's approval,
      // exactly like file writes.
      if (method.toUpperCase() !== 'GET') {
        const ok = await approve(`Send to ${service}: ${method.toUpperCase()} ${path}`, (body ?? '').slice(0, 800) || 'No body.');
        if (!ok) return 'Rejected by user.';
      }
      return serviceRequest(service, method, path, body);
    }
    case 'vercel_deploy': {
      const rawFiles = call.args.files;
      const files = (Array.isArray(rawFiles)
        ? rawFiles.filter((f): f is string => typeof f === 'string')
        : typeof rawFiles === 'string'
          ? rawFiles.split(/[,\n]/).map((f) => f.trim()).filter(Boolean)
          : []).map((f) => sectionPath(f)).filter((f): f is string => f !== null);
      const project = argString(call.args, 'project');
      if (!files.length) return 'Error: vercel_deploy needs files (workspace paths).';
      const ok = await approve('Deploy to Vercel', `Files: ${files.join(', ')}\nThis publishes the site live at a public URL.`);
      if (!ok) return 'Rejected by user.';
      return vercelDeploy(files, project || undefined);
    }
    case 'mcp_call': {
      const serverName = argString(call.args, 'server');
      const toolName = argString(call.args, 'tool');
      const rawArgs = call.args.args;
      const argsObj = rawArgs && typeof rawArgs === 'object' ? rawArgs as Record<string, unknown> : {};
      if (!serverName || !toolName) return 'Error: mcp_call needs server and tool.';
      const servers = await listMcpServers();
      const server = servers.find((s) => s.name.toLowerCase() === serverName.toLowerCase());
      if (!server) return `Error: no saved MCP server named "${serverName}".`;
      const ok = await approve(`MCP call ${server.name} → ${toolName}`, JSON.stringify(argsObj).slice(0, 800) || 'No arguments.');
      if (!ok) return 'Rejected by user.';
      try {
        requireHttpsUrl(server.url, 'MCP server URL');
        const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
        const token = await getMcpToken(server.id);
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(server.url, {
          method: 'POST', headers,
          body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: toolName, arguments: argsObj } }),
        });
        const text = await res.text();
        if (!res.ok) return `Error: MCP server returned HTTP ${res.status}: ${text.slice(0, 500)}`;
        return text.length > 6000 ? text.slice(0, 6000) + '\n…(truncated)' : text;
      } catch {
        return `Error: could not reach MCP server ${server.name} (network issue).`;
      }
    }
    default:
      return `Error: unknown tool "${call.name}". Available: list_files, read_file, search_files, write_file, edit_file, delete_file, browser_read, service_request, vercel_deploy, mcp_call.`;
  }
}
