import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import { MobileWorkspaceControlView } from '../../components/MobileWorkspaceControlView';

export default function WorkspaceControlScreen() {
  const { kind, sessionId } = useLocalSearchParams<{ kind: string; sessionId?: string }>();
  return (
    <MobileWorkspaceControlView
      kind={typeof kind === 'string' ? kind : ''}
      sessionId={typeof sessionId === 'string' ? sessionId : undefined}
    />
  );
}
