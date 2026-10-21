import React from 'react';

import { AdaptiveShell } from '../components/AdaptiveShell';
import { AgentsView } from '../components/AgentsView';

export default function AgentsScreen() {
  return (
    <AdaptiveShell title="Agents">
      <AgentsView />
    </AdaptiveShell>
  );
}
