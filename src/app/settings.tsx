import React from 'react';

import { AdaptiveShell } from '../components/AdaptiveShell';
import { SettingsView } from '../components/SettingsView';

export default function SettingsScreen() {
  return (
    <AdaptiveShell title="Settings">
      <SettingsView />
    </AdaptiveShell>
  );
}
