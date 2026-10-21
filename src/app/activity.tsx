import React from 'react';

import { ActivityView } from '../components/ActivityView';
import { AdaptiveShell } from '../components/AdaptiveShell';

export default function ActivityScreen() {
  return (
    <AdaptiveShell title="Activity">
      <ActivityView />
    </AdaptiveShell>
  );
}
