// Legal documents (user order 2026-10-29, expanded 2026-10-31 for
// Razorpay payments): a separate Legal section inside Settings, so
// nothing legal lives as a wall of text on the Settings page itself.
// These are plain-language policies written for what this version
// actually does — local-only, no ads, Razorpay payments, login-first,
// on-phone plugin sandbox. They are NOT a lawyer's review: before any
// store release, have them reviewed by a lawyer, and update them the
// day any of these facts change (ads, payments, a server, or a new
// data flow).
export type LegalDoc = { id: string; title: string; body: string; action?: { label: string; url: string } };

export const LEGAL_DOCS: LegalDoc[] = [
  {
    id: 'privacy',
    title: 'Privacy Policy',
    body: `BotSquad Privacy.
What we collect and why:
• Google sign-in: your name, email, and photo, to sign you in and fill your Profile. Your Google tokens stay in the device secure store and are never sent to BotSquad or any other server.
• Chats, bots, skills, routines, memory notes, and workspace files: stored only on your device, never uploaded to BotSquad.
• Your AI provider API keys: stored only in the device secure store. They are sent only to the provider you chose, in a direct call from your device.
• Payments: card, bank, and UPI details are handled by Razorpay, our payment processor. BotSquad never sees or stores your payment details. Razorpay's own privacy policy applies to payment data.
• GitHub downloads: repo files you ask for are downloaded to your device; plugin code runs on your phone in a WebView sandbox and can only use the bridged workspace files and public-page reads.
• No ads profiling: this version shows no ads and collects nothing for advertising.
Your rights (GDPR in Europe, CCPA in California, DPDP in India):
• Access, correct, or delete your data: use Settings > Delete account to wipe everything on the phone, or contact us via GitHub Issues.
• We do not sell your personal data, and we do not share it except with the services above that you chose (Google, your AI provider, Razorpay, GitHub).
• You may withdraw consent by signing out or deleting your account; deletion is immediate on the device.
• Data stays on your device except for the direct calls above. There is no BotSquad server holding your chats.
Children: BotSquad is for users aged 18 and over. We do not knowingly collect data from children.
Contact: GitHub Issues (Report & Feedback). This policy may change; the version inside the app is the current one.`,
  },
  {
    id: 'terms',
    title: 'Terms of Use',
    body: `By using BotSquad you agree to these terms.
• You are talking to AI bots. AI replies can be wrong, incomplete, or out of date. Verify important facts before acting on them. BotSquad is not liable for model outputs.
• You must be 18 or older to use BotSquad.
• You are responsible for your API keys, your bots, your payments, and anything you send, publish, or buy through your own accounts.
• Do not use the app to break the law, bypass paywalls or CAPTCHAs, send spam, harm others, or create deceptive or harmful AI content.
• Plugins and skills you install from GitHub are third-party code and text, not BotSquad's. They run on your phone only after your approval, at your own risk; BotSquad is not liable for what they do.
• The app is provided "as is", with no warranty. BotSquad is not liable for provider outages, payment processor failures, or losses from using the app.
• Governing law: these terms are governed by the laws of India. Disputes go to the courts of India.
• These terms may change; the version inside the app is the current one.`,
  },
  {
    id: 'subscription',
    title: 'Subscription & Premium Terms',
    body: `• Remove Ads costs $5, one time. It is NOT a subscription: you pay once, and ads stay removed on this device. Premium removes ads ONLY; it never locks a feature.
• Payment is processed by Razorpay. Prices include applicable taxes where Razorpay shows them at checkout.
• If subscriptions are introduced later, they will bill in advance each cycle, renew automatically until cancelled, and show their price and cycle before you subscribe. You may cancel any subscription before its renewal date; access continues until the end of the paid period.
• Premium is tied to your signed-in Google account on this device. Signing out does not refund a purchase; signing back in restores it.`,
  },
  {
    id: 'refund',
    title: 'Refund Policy',
    body: `• Remove Ads ($5, one time) is refunded in full if you were charged twice for the same purchase, or if the purchase never activated after a successful payment. Contact us via GitHub Issues with your payment ID within 7 days of the charge.
• Approved refunds go back to your original payment method through Razorpay, usually within 5-7 business days.
• We cannot refund a purchase that is working as described. Subscription renewals (if introduced) are not refunded for a partially used period.
• If Razorpay shows a payment as failed, no money is taken and nothing needs refunding.`,
  },
  {
    id: 'cancellation',
    title: 'Cancellation Policy',
    body: `• One-time Remove Ads ($5) has nothing to cancel: it is permanent on this device. To stop using it, sign out or delete your account.
• Any future subscription can be cancelled before its renewal date from the purchase screen or your Razorpay receipt; access continues until the end of the paid period, then stops. No partial-period refunds.
• To cancel your whole account, use Settings > Delete account. It immediately wipes your sign-in, all bots, chats, skills, plugins, connections, settings, profile, and workspace files from this phone. This cannot be undone.
• Cancelling does not delete data already sent to your chosen AI provider or payment processor; their policies govern that data.`,
  },
  {
    id: 'ads',
    title: 'Ads Policy',
    body: `• This version shows no ads.
• When ads arrive, they will be clearly marked as ads. Premium ($5, one time) removes them.
• No personal data is collected for advertising by BotSquad. Any future ad partner's own policy will apply to its ads.`,
  },
  {
    id: 'cookies',
    title: 'Cookies Policy',
    body: `• BotSquad itself sets no cookies and does no web tracking.
• Pages you open in the in-chat browser, and the Razorpay checkout page, may set their own cookies on your device, under those sites' own policies.`,
  },
  {
    id: 'data',
    title: 'Data & Deletion',
    body: `• Everything — chats, bots, skills, workspace files, keys — lives only on your device, except for direct calls you chose (your AI provider, Google sign-in, Razorpay payments, GitHub downloads).
• Delete a chat, bot, skill, or file from its own screen to remove it.
• Settings > Delete account wipes everything on the phone at once.
• Uninstalling the app removes all of its data from the device, including saved keys.
• Your GDPR, CCPA, and DPDP rights (access, correction, deletion, portability) are in the Privacy Policy; Delete account is the fastest way to exercise deletion.`,
  },
  {
    id: 'licenses',
    title: 'Third-Party Licenses',
    body: `BotSquad is built with open-source software. The main libraries, all MIT-licensed, are: Expo, React Native, react-native-webview, expo-sqlite, expo-secure-store, isomorphic-git, @react-native-voice/voice, react-native-safe-area-context, and Feather icons. Their full license texts ship inside their packages.
• Razorpay Checkout is provided by Razorpay under Razorpay's terms.
• Google sign-in is provided by Google under Google's terms.
• GitHub repos you install keep their own licenses; those licenses apply to that code.`,
  },
  {
    id: 'feedback',
    title: 'Report & Feedback',
    body: `• Found a bug, a wrong policy, or something harmful? Report it on the project's GitHub Issues page (button below).
• Copyright complaints (DMCA): report via GitHub Issues with the work identified, the repo or file URL, and your contact details. We act on valid notices as the law requires.
• Never include passwords, API keys, or private data in a public report.`,
    action: { label: 'Open GitHub Issues', url: 'https://github.com/sarfaraj78653738-star/Teambot/issues' },
  },
];
