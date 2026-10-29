import * as React from 'react';

import { ChatShortcutViewProps } from './ChatShortcut.types';

export default function ChatShortcutView(props: ChatShortcutViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
