// Legal documents (user order 2026-10-29): a separate Legal section
// inside Settings, so nothing legal lives as a wall of text on the
// Settings page itself. These are plain-language policies written for
// what this GitHub version actually does — local-only, no ads, no
// payments, no login. They are NOT a lawyer's review: before any
// store release, have them reviewed by a lawyer, and update them the
// day any of these facts change (ads, payments, login, or a server).
export type LegalDoc = { id: string; title: string; body: string; action?: { label: string; url: string } };

export const LEGAL_DOCS: LegalDoc[] = [
  {
    id: 'privacy',
    title: 'Privacy Policy',
    body: `BotSquad Privacy — GitHub v1.
• Chats, bots, skills, routines, and memory notes stay on your device in local storage.
• Your API keys are stored only in the device secure store (Android Keystore). They are sent only to the provider you chose, in a direct call from your device. They are never sent to BotSquad or to any other server.
• This GitHub version has NO ads, NO payments, and NO login. The only third parties are the model provider you chose, and any GitHub repo or MCP server you add yourself. No analytics or tracking is shipped.
• This app is not affiliated with, endorsed by, or connected to any other AI product, and it makes no claim to be an official product of any other company.`,
  },
  {
    id: 'terms',
    title: 'Terms of Use',
    body: `By using BotSquad you agree to these terms.
• AI replies can be wrong. Verify important facts before acting on them.
• You are responsible for your API keys, your bots, and anything you send, publish, or buy through your own accounts.
• Do not use the app to break the law, bypass paywalls or CAPTCHAs, send spam, or harm others.
• The app is provided "as is", with no warranty. BotSquad is not liable for model outputs, provider outages, or losses from using the app.
• These terms may change; the version inside the app is the current one.`,
  },
  {
    id: 'ads',
    title: 'Ads Policy',
    body: `• This GitHub version shows no ads.
• If ads are added later, they will be clearly marked as ads, and this policy will be updated before that release.
• No personal data is collected for advertising.`,
  },
  {
    id: 'refund',
    title: 'Refund Policy',
    body: `• This version takes no payments, so there is nothing to refund.
• If paid features are added later, their price and refund terms will be shown before you pay, and store purchases will follow that store's refund rules.`,
  },
  {
    id: 'cookies',
    title: 'Cookies Policy',
    body: `• BotSquad itself sets no cookies and does no web tracking.
• Pages you open in the in-chat browser may set their own cookies on your device, under those sites' own policies.`,
  },
  {
    id: 'data',
    title: 'Data & Deletion',
    body: `• Everything — chats, bots, skills, workspace files, keys — lives only on your device.
• Delete a chat, bot, skill, or file from its own screen to remove it.
• Uninstalling the app removes all of its data from the device, including saved keys.`,
  },
  {
    id: 'feedback',
    title: 'Report & Feedback',
    body: `• Found a bug, a wrong policy, or something harmful? Report it on the project's GitHub Issues page (button below).
• Never include passwords, API keys, or private data in a public report.`,
    action: { label: 'Open GitHub Issues', url: 'https://github.com/sarfaraj78653738-star/Teambot/issues' },
  },
];
