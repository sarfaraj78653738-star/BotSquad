// Reexport the native module. On web, it will be resolved to ChatShortcutModule.web.ts
// and on native platforms to ChatShortcutModule.ts
export { default } from './src/ChatShortcutModule';
export { default as ChatShortcutView } from './src/ChatShortcutView';
export * from  './src/ChatShortcut.types';
