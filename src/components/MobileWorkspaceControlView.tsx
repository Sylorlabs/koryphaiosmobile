import React from 'react';
import { Text, View } from 'react-native';

import { useControl } from '../control/ControlProvider';
import { colors } from '../theme/tokens';
import {
  ComputerUseView,
  SessionControlsView,
  TimeTravelView,
  WorkflowsView,
} from './AdvancedControls';
import { MobileSurface } from './MobileSurface';
import { NativeCommandsView } from './NativeCommandsView';
import {
  CollaborationControlView,
  MediaControlView,
  MemoryControlView,
} from './RemoteContentControls';
import { NotesControlView } from './NotesControlView';
import {
  AgentPreferencesView,
  ResponseStyleControlView,
  SkillsControlView,
} from './AgentControlViews';
import { ModelSharingControlView } from './ModelSharingControlView';
import { McpControlView } from './McpControlView';
import { WorkspaceNavigationView } from './WorkspaceNavigationView';
import { WorkspaceControlPanel, type WorkspaceControlKind } from './WorkspaceControls';
import { BillingControlView } from './BillingControlView';

const titles: Record<WorkspaceControlKind, string> = {
  goals: 'Goals',
  checklists: 'Checklists',
  git: 'Git',
};

const advancedTitles: Record<string, string> = {
  session: 'Chat controls',
  workflows: 'Workflows',
  history: 'Time Travel',
  computer: 'Computer',
  commands: 'Commands',
  memory: 'Memory',
  notes: 'Notes',
  teams: 'Team access',
  modelSharing: 'Model sharing',
  mcp: 'MCP servers',
  media: 'Media',
  billing: 'Usage & billing',
  workspace: 'Workspace',
  preferences: 'Preferences',
  responseStyle: 'Response style',
  skills: 'Skills',
};

export function MobileWorkspaceControlView({ kind, sessionId }: { kind: string; sessionId?: string }) {
  const { snapshot, pairing } = useControl();
  // Remount every control when its destination changes so component-local
  // reads, drafts and pending UI cannot appear under another scope.
  const controlScope = JSON.stringify([
    kind, pairing?.baseUrl ?? '', pairing?.machineId ?? '', snapshot.machine.id,
    snapshot.activeProjectId, snapshot.activeSessionId, sessionId ?? '',
  ]);
  return <ScopedMobileWorkspaceControlView key={controlScope} kind={kind} sessionId={sessionId} />;
}

function ScopedMobileWorkspaceControlView({ kind, sessionId }: { kind: string; sessionId?: string }) {
  if (kind === 'session') {
    return <MobileSurface title={advancedTitles[kind]}><SessionControlsView sessionId={sessionId} /></MobileSurface>;
  }
  if (kind === 'workflows') {
    return <MobileSurface title={advancedTitles[kind]}><WorkflowsView /></MobileSurface>;
  }
  if (kind === 'history') {
    return <MobileSurface title={advancedTitles[kind]}><TimeTravelView /></MobileSurface>;
  }
  if (kind === 'computer') {
    return <MobileSurface title={advancedTitles[kind]}><ComputerUseView /></MobileSurface>;
  }
  if (kind === 'commands') {
    return <MobileSurface title={advancedTitles[kind]}><NativeCommandsView /></MobileSurface>;
  }
  if (kind === 'memory') {
    return <MobileSurface title={advancedTitles[kind]}><MemoryControlView /></MobileSurface>;
  }
  if (kind === 'notes') {
    return <MobileSurface title={advancedTitles[kind]}><NotesControlView /></MobileSurface>;
  }
  if (kind === 'teams') {
    return <MobileSurface title={advancedTitles[kind]}><CollaborationControlView /></MobileSurface>;
  }
  if (kind === 'modelSharing') {
    return <MobileSurface title={advancedTitles[kind]}><ModelSharingControlView /></MobileSurface>;
  }
  if (kind === 'mcp') {
    return <MobileSurface title={advancedTitles[kind]}><McpControlView /></MobileSurface>;
  }
  if (kind === 'media') {
    return <MobileSurface title={advancedTitles[kind]}><MediaControlView /></MobileSurface>;
  }
  if (kind === 'billing') {
    return <MobileSurface title={advancedTitles[kind]}><BillingControlView /></MobileSurface>;
  }
  if (kind === 'workspace') {
    return <MobileSurface title={advancedTitles[kind]}><WorkspaceNavigationView /></MobileSurface>;
  }
  if (kind === 'preferences') {
    return <MobileSurface title={advancedTitles[kind]}><AgentPreferencesView /></MobileSurface>;
  }
  if (kind === 'responseStyle') {
    return <MobileSurface title={advancedTitles[kind]}><ResponseStyleControlView /></MobileSurface>;
  }
  if (kind === 'skills') {
    return <MobileSurface title={advancedTitles[kind]}><SkillsControlView /></MobileSurface>;
  }
  if (kind !== 'goals' && kind !== 'checklists' && kind !== 'git') {
    return (
      <MobileSurface title="Controls">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.textMuted }}>Unavailable</Text>
        </View>
      </MobileSurface>
    );
  }

  return (
    <MobileSurface title={titles[kind]}>
      <WorkspaceControlPanel kind={kind} fullscreen onClose={() => {}} />
    </MobileSurface>
  );
}
