import React from 'react';

import { AdaptiveShell } from '../components/AdaptiveShell';
import { MachinesView } from '../components/MachinesView';

export default function MachinesScreen() {
  return (
    <AdaptiveShell title="Machines">
      <MachinesView />
    </AdaptiveShell>
  );
}
