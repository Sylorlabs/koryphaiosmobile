import React from 'react';

import { AdaptiveShell } from '../components/AdaptiveShell';
import { WorkspaceView } from '../components/WorkspaceView';
import { useControl } from '../control/ControlProvider';

export default function WorkspaceScreen() {
  const { snapshot } = useControl();
  const project = snapshot.projects.find((item) => item.id === snapshot.activeProjectId);
  return (
    <AdaptiveShell title={project?.name ?? 'Workspace'} subtitle={project?.path}>
      <WorkspaceView />
    </AdaptiveShell>
  );
}
