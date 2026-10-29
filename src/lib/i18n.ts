import { Language } from './tokens';

// App language strings (user order 2026-10-29). The Language setting
// in Settings → General switches between English and Hindi. Coverage
// in this first version: the drawer and the Settings screen — the
// chrome the user touches most. Other screens still show English
// until their strings move into this dictionary; adding a screen is
// mechanical (replace its literal with t(language, 'key')).
// Missing keys fall back to English, then to the key itself — never a
// blank label.
export const LANGUAGE_OPTIONS: { id: Language; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिन्दी' },
];

const STRINGS: Record<Language, Record<string, string>> = {
  en: {
    mainChat: 'Main Chat', bots: 'Bots', group: 'Group', history: 'History',
    projects: 'Projects', artifacts: 'Artifacts', workspace: 'Workspace',
    settings: 'Settings', newChat: 'New chat',
    general: 'General', tools: 'Tools',
    profile: 'Profile', profileDetail: 'Name, photo, and preferences',
    colorMode: 'Color mode', fontStyle: 'Font style', permissions: 'Permissions',
    adsPayments: 'Ads & payments', adsPaymentsDetail: 'Plans and premium',
    language: 'Language',
    modelSetup: 'Model setup', modelSetupDetail: 'Providers, keys, and saved models',
    login: 'Login', loginDetail: 'Google sign-in (optional)',
    mainAvatar: "Main Chat's avatar", mainAvatarDetail: "Pick Main Chat's avatar",
    connections: 'Connections', connectionsDetail: 'Add and enable connections',
    skills: 'Skills', skillsDetail: 'Instruction templates',
    plugins: 'Plugins', pluginsDetail: 'Installed plugin definitions',
    mcpServers: 'MCP servers', mcpServersDetail: 'HTTP/SSE tool servers',
    githubInstall: 'GitHub install', githubInstallDetail: 'Install skills, plugins, MCP servers',
    routines: 'Routines', routinesDetail: 'Scheduled skills and routines',
    legal: 'Legal', legalDetail: 'Privacy, terms, ads, refunds & feedback',
    colorSystem: 'System', colorSystemDetail: 'Follows your phone',
    colorLight: 'Light', colorLightDetail: 'Always light',
    colorDark: 'Dark', colorDarkDetail: 'Always dark',
    fontDefault: 'Default', fontDefaultDetail: "App's designed sizes",
    fontSystem: 'System', fontSystemDetail: "Follow your device's text size",
  },
  hi: {
    mainChat: 'मुख्य चैट', bots: 'बॉट्स', group: 'समूह', history: 'इतिहास',
    projects: 'प्रोजेक्ट्स', artifacts: 'आर्टिफैक्ट्स', workspace: 'वर्कस्पेस',
    settings: 'सेटिंग्स', newChat: 'नई चैट',
    general: 'सामान्य', tools: 'टूल्स',
    profile: 'प्रोफ़ाइल', profileDetail: 'नाम, फ़ोटो और पसंद',
    colorMode: 'रंग मोड', fontStyle: 'फ़ॉन्ट स्टाइल', permissions: 'अनुमतियाँ',
    adsPayments: 'विज्ञापन और भुगतान', adsPaymentsDetail: 'प्लान और प्रीमियम',
    language: 'भाषा',
    modelSetup: 'मॉडल सेटअप', modelSetupDetail: 'प्रोवाइडर, की और सेव किए मॉडल',
    login: 'लॉगिन', loginDetail: 'Google साइन-इन (वैकल्पिक)',
    mainAvatar: 'मुख्य चैट अवतार', mainAvatarDetail: 'मुख्य चैट का अवतार चुनें',
    connections: 'कनेक्शन', connectionsDetail: 'कनेक्शन जोड़ें और चालू करें',
    skills: 'स्किल्स', skillsDetail: 'निर्देश टेम्पलेट',
    plugins: 'प्लगइन्स', pluginsDetail: 'इंस्टॉल किए प्लगइन',
    mcpServers: 'MCP सर्वर', mcpServersDetail: 'HTTP/SSE टूल सर्वर',
    githubInstall: 'GitHub से इंस्टॉल करें', githubInstallDetail: 'स्किल, प्लगइन, MCP सर्वर इंस्टॉल करें',
    routines: 'रूटीन', routinesDetail: 'शेड्यूल की स्किल और रूटीन',
    legal: 'कानूनी', legalDetail: 'प्राइवेसी, शर्तें, विज्ञापन, रिफ़ंड और फ़ीडबैक',
    colorSystem: 'सिस्टम', colorSystemDetail: 'फ़ोन की सेटिंग के अनुसार',
    colorLight: 'हल्का', colorLightDetail: 'हमेशा हल्का',
    colorDark: 'गहरा', colorDarkDetail: 'हमेशा गहरा',
    fontDefault: 'डिफ़ॉल्ट', fontDefaultDetail: 'ऐप के तय आकार',
    fontSystem: 'सिस्टम', fontSystemDetail: 'डिवाइस के टेक्स्ट आकार के अनुसार',
  },
};

export function t(lang: Language, key: string): string {
  return STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
}
