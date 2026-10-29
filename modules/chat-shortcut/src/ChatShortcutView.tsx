import { requireNativeView } from 'expo';
import * as React from 'react';

import { ChatShortcutViewProps } from './ChatShortcut.types';

const NativeView: React.ComponentType<ChatShortcutViewProps> =
  requireNativeView('ChatShortcut');

export default function ChatShortcutView(props: ChatShortcutViewProps) {
  return <NativeView {...props} />;
}
