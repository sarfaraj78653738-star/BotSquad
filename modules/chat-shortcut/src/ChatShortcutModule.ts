import { NativeModule, requireNativeModule } from 'expo';

import { ChatShortcutModuleEvents } from './ChatShortcut.types';

declare class ChatShortcutModule extends NativeModule<ChatShortcutModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ChatShortcutModule>('ChatShortcut');
