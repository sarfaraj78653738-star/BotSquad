import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './ChatShortcut.types';

type ChatShortcutModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class ChatShortcutModule extends NativeModule<ChatShortcutModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(ChatShortcutModule, 'ChatShortcutModule');
