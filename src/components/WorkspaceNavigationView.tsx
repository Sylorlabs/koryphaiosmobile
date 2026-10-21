import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, ChevronDown, ChevronRight, Folder, FolderOpen, Search, X } from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type { WorkspaceFilesInspection, WorkspaceNavigationState } from '../types/control';
import { HostFolderPicker, type HostFolderPickerMode } from './HostFolderPicker';
import { ActionButton } from './ui';

export function WorkspaceNavigationView() {
  const { pairing, snapshot } = useControl();
  // Discard responses from a previous machine, even for A → B → A switches.
  const hostKey = JSON.stringify([pairing?.baseUrl ?? '', pairing?.machineId ?? '', snapshot.machine.id, snapshot.activeProjectId]);
  return <ScopedWorkspaceNavigationView key={hostKey} />;
}

function ScopedWorkspaceNavigationView() {
  const { sendCommand, inspect, snapshot } = useControl();
  const [state, setState] = useState<WorkspaceNavigationState | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState('');
  const [manualPathOpen, setManualPathOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<HostFolderPickerMode | null>(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [filesEpoch, setFilesEpoch] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const actionInFlight = useRef(false);
  const refreshVersion = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      refreshVersion.current += 1;
    };
  }, []);

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    try {
      const next = await inspect<WorkspaceNavigationState>('workspace.inspect');
      if (!mounted.current || version !== refreshVersion.current) return;
      setState(next);
      setWorkspaceRoot((current) => current || next.workspaceRoot || '');
    } catch (caught) {
      if (mounted.current && version === refreshVersion.current) {
        setError(caught instanceof Error ? caught.message : 'Could not load workspace');
      }
    }
  }, [inspect]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const run = async (
    key: string,
    name: string,
    payload?: Record<string, unknown>,
  ) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(key);
    setError('');
    try {
      const result = await sendCommand(name, payload);
      if (!result.accepted) throw new Error('The host did not accept this workspace action. Check its state before retrying.');
      if (!mounted.current) return;
      await refresh();
      if (mounted.current) setFilesEpoch((current) => current + 1);
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : 'Workspace action was not confirmed. Check the host before retrying.');
    } finally {
      actionInFlight.current = false;
      if (mounted.current) setBusy('');
    }
  };

  const openProjectFresh = async (projectPath: string, projectName: string) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(`project:${projectPath}`);
    setError('');
    try {
      const selected = await sendCommand('project.select', { projectId: projectPath });
      if (!selected.accepted) throw new Error('The host did not accept project selection. No new chat was requested.');
      if (!mounted.current) return;
      // Selection is a separate host mutation. Confirm its destination before
      // creating a chat so a rejected or superseded selection cannot create one.
      const verified = await inspect<WorkspaceNavigationState>('workspace.inspect');
      if (!mounted.current) return;
      if (verified.selectedProject !== projectPath) {
        throw new Error('Could not confirm the selected project. No new chat was requested; check the host before retrying.');
      }
      const created = await sendCommand('session.create', {
        projectId: projectPath,
        title: `Project: ${projectName}`,
      });
      if (!created.accepted) throw new Error('The host did not confirm a new chat. Check the chat list before retrying.');
      if (!mounted.current) return;
      await refresh();
      if (mounted.current) setFilesEpoch((current) => current + 1);
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : 'Could not confirm opening the project. Check the host before retrying.');
    } finally {
      actionInFlight.current = false;
      if (mounted.current) setBusy('');
    }
  };

  const visibleProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) return state?.projects ?? [];
    return (state?.projects ?? []).filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        project.path.toLowerCase().includes(query),
    );
  }, [projectSearch, state?.projects]);

  const recentProjects = useMemo(() => {
    const currentPaths = new Set((state?.projects ?? []).map((project) => project.path));
    return snapshot.projects.filter((project) => !currentPaths.has(project.path)).slice(0, 8);
  }, [snapshot.projects, state?.projects]);

  return (
    <>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

      {(state?.unavailableWorkspace || state?.unavailableProject) ? (
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>Unavailable path</Text>
          <Text selectable style={styles.warningPath}>
            {state.unavailableProject || state.unavailableWorkspace}
          </Text>
          <ActionButton
            label="Dismiss"
            disabled={Boolean(busy)}
            onPress={() => void run('ack', 'workspace.acknowledge_unavailable')}
          />
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.sectionHeading}>
          <FolderOpen size={17} color={colors.accent} />
          <Text style={styles.sectionTitle}>Host folders</Text>
        </View>
        <View style={styles.quickGrid}>
          <Pressable
            accessibilityRole="button"
            disabled={Boolean(busy)}
            onPress={() => setPickerMode('open-project')}
            style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
          >
            <Text style={styles.quickActionText}>Open project</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={Boolean(busy)}
            onPress={() => setPickerMode('new-project')}
            style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
          >
            <Text style={styles.quickActionText}>New project</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={Boolean(busy)}
            onPress={() => setPickerMode('open-workspace')}
            style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
          >
            <Text style={styles.quickActionText}>Open workspace</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={Boolean(busy)}
            onPress={() => setPickerMode('new-workspace')}
            style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
          >
            <Text style={styles.quickActionText}>New workspace</Text>
          </Pressable>
        </View>
        {state?.workspaceRoot ? (
          <View style={styles.currentPathRow}>
            <Text numberOfLines={2} selectable style={styles.currentPath}>{state.workspaceRoot}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear workspace"
              disabled={Boolean(busy)}
              onPress={() => void run('clear', 'workspace.clear')}
              style={({ pressed }) => [styles.smallIconButton, pressed && styles.pressed]}
            >
              <X size={15} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={manualPathOpen ? 'Hide host path field' : 'Enter host path'}
          disabled={Boolean(busy)}
          onPress={() => setManualPathOpen((open) => !open)}
          style={({ pressed }) => [styles.pathToggle, pressed && styles.pressed]}
        >
          <Text style={styles.pathToggleText}>{manualPathOpen ? 'Hide path' : 'Enter path'}</Text>
          {manualPathOpen ? <ChevronDown size={15} color={colors.textMuted} /> : <ChevronRight size={15} color={colors.textMuted} />}
        </Pressable>
        {manualPathOpen ? (
          <View style={styles.inputRow}>
            <TextInput
              value={workspaceRoot}
              editable={!busy}
              onChangeText={setWorkspaceRoot}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="/Users/you/Documents"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <ActionButton
              label="Open"
              disabled={!workspaceRoot.trim() || Boolean(busy)}
              loading={busy === 'open'}
              onPress={() => void run('open', 'workspace.open', { root: workspaceRoot.trim() })}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeading}>
          <Folder size={17} color={colors.accent} />
          <Text style={styles.sectionTitle}>Project</Text>
          {state?.selectedProject ? (
            <ActionButton
              label="Deselect"
              disabled={Boolean(busy)}
              onPress={() => void run('deselect', 'workspace.deselect')}
            />
          ) : null}
        </View>

        {(state?.projects.length ?? 0) > 8 ? (
          <View style={styles.searchBox}>
            <Search size={15} color={colors.textMuted} />
            <TextInput
              value={projectSearch}
              onChangeText={setProjectSearch}
              placeholder="Find project"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
            />
          </View>
        ) : null}

        <View style={styles.projectList}>
          {visibleProjects.map((project) => {
            const active = project.path === state?.selectedProject;
            return (
              <Pressable
                key={project.path}
                accessibilityRole="button"
                accessibilityLabel={`Select project ${project.name}`}
                accessibilityState={{ selected: active, disabled: Boolean(busy) }}
                disabled={Boolean(busy)}
                onPress={() => void openProjectFresh(project.path, project.name)}
                style={({ pressed }) => [
                  styles.projectRow,
                  active && styles.projectRowActive,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.projectCopy}>
                  <Text numberOfLines={1} style={styles.projectName}>{project.name}</Text>
                  <Text numberOfLines={1} style={styles.projectPath}>{project.path}</Text>
                </View>
                {active ? <Check size={16} color={colors.accent} /> : <ChevronRight size={15} color={colors.textMuted} />}
              </Pressable>
            );
          })}
          {!visibleProjects.length ? (
            <Text style={styles.empty}>No projects in this workspace.</Text>
          ) : null}
        </View>
      </View>

      {recentProjects.length ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recent projects</Text>
          <View style={styles.projectList}>
            {recentProjects.map((project) => (
              <Pressable
                key={project.path}
                accessibilityRole="button"
                accessibilityLabel={`Select recent project ${project.name}`}
                disabled={Boolean(busy)}
                onPress={() => void openProjectFresh(project.path, project.name)}
                style={({ pressed }) => [styles.projectRow, pressed && styles.pressed]}
              >
                <View style={styles.projectCopy}>
                  <Text numberOfLines={1} style={styles.projectName}>{project.name}</Text>
                  <Text numberOfLines={1} style={styles.projectPath}>{project.path}</Text>
                </View>
                <ChevronRight size={15} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {state?.selectedProject ? (
        <WorkspaceFilesBrowser
          key={JSON.stringify([state.selectedProject, filesEpoch])}
          projectId={state.selectedProject}
          parentBusy={Boolean(busy)}
        />
      ) : null}
      </ScrollView>
      {pickerMode ? (
        <HostFolderPicker
          key={pickerMode}
          visible
          mode={pickerMode}
          onClose={() => setPickerMode(null)}
          onChanged={refresh}
        />
      ) : null}
    </>
  );
}

function WorkspaceFilesBrowser({ projectId, parentBusy }: { projectId: string; parentBusy: boolean }) {
  const { inspect } = useControl();
  const [filesOpen, setFilesOpen] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const fileSearchRef = useRef('');
  const requestVersion = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
    };
  }, []);

  const loadFiles = async () => {
    if (inFlight.current || parentBusy) return;
    inFlight.current = true;
    const version = ++requestVersion.current;
    const query = fileSearchRef.current;
    setBusy(true);
    setError('');
    try {
      const result = await inspect<WorkspaceFilesInspection>('workspace.files', { query, projectId });
      if (mounted.current && version === requestVersion.current && query === fileSearchRef.current) {
        setFiles(result.files);
        setFilesOpen(true);
      }
    } catch (caught) {
      if (mounted.current && version === requestVersion.current) {
        setError(caught instanceof Error ? caught.message : 'Could not list project files');
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={filesOpen ? 'Close file browser' : 'Open file browser'}
            disabled={busy || parentBusy}
            onPress={() => {
              if (filesOpen) {
                setFilesOpen(false);
                return;
              }
              void loadFiles();
            }}
            style={({ pressed }) => [styles.fileHeader, pressed && styles.pressed]}
          >
            <View style={styles.fileHeaderCopy}>
              <Text style={styles.sectionTitle}>Files</Text>
              <Text style={styles.fileSummary}>
                {filesOpen ? `${files.length} shown` : 'Browse the selected project'}
              </Text>
            </View>
            {filesOpen ? (
              <ChevronDown size={17} color={colors.textMuted} />
            ) : (
              <ChevronRight size={17} color={colors.textMuted} />
            )}
          </Pressable>
          {filesOpen ? (
            <View style={styles.filesBody}>
              <View style={styles.searchBox}>
                <Search size={15} color={colors.textMuted} />
                <TextInput
                  value={fileSearch}
                  onChangeText={(value) => {
                    fileSearchRef.current = value;
                    setFileSearch(value);
                    setFiles([]);
                  }}
                  onSubmitEditing={() => void loadFiles()}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Filter files"
                  placeholderTextColor={colors.textMuted}
                  style={styles.searchInput}
                />
                <ActionButton
                  label="Find"
                  loading={busy}
                  disabled={busy || parentBusy}
                  onPress={() => void loadFiles()}
                />
              </View>
              <View style={styles.fileList}>
                {files.map((file) => (
                  <View key={file} style={styles.fileRow}>
                    <Text numberOfLines={2} selectable style={styles.filePath}>{file}</Text>
                  </View>
                ))}
                {!files.length && !busy ? <Text style={styles.empty}>No files found.</Text> : null}
              </View>
            </View>
          ) : null}
        </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface1 },
  content: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    padding: spacing.md,
    paddingBottom: spacing.huge,
    gap: spacing.sm,
  },
  card: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    padding: spacing.md,
    gap: spacing.sm,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  quickAction: {
    minHeight: 40,
    minWidth: '47%',
    flexGrow: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionText: { color: colors.textSecondary, fontSize: typography.xs, fontWeight: '700' },
  warningCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
    gap: spacing.xs,
  },
  warningTitle: { color: colors.warning, fontSize: typography.sm, fontWeight: '800' },
  warningPath: { color: colors.textSecondary, fontSize: typography.xs, lineHeight: 17 },
  sectionHeading: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: { flex: 1, color: colors.textPrimary, fontSize: typography.sm, fontWeight: '800' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
    fontSize: typography.sm,
  },
  currentPathRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  currentPath: { flex: 1, color: colors.textMuted, fontSize: typography.xs, lineHeight: 16 },
  pathToggle: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  pathToggleText: { color: colors.textMuted, fontSize: typography.xs, fontWeight: '600' },
  smallIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    minHeight: 42,
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: typography.sm,
    paddingVertical: spacing.xs,
  },
  projectList: { gap: 2 },
  projectRow: {
    minHeight: 52,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  projectRowActive: { backgroundColor: colors.accentSoft },
  projectCopy: { flex: 1, minWidth: 0 },
  projectName: { color: colors.textSecondary, fontSize: typography.sm, fontWeight: '700' },
  projectPath: { marginTop: 2, color: colors.textMuted, fontSize: 10 },
  fileHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fileHeaderCopy: { flex: 1, minWidth: 0 },
  fileSummary: { marginTop: 2, color: colors.textMuted, fontSize: typography.xs },
  filesBody: { gap: spacing.sm },
  fileList: { gap: 2 },
  fileRow: {
    minHeight: 38,
    borderRadius: radii.md,
    backgroundColor: colors.surface3,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  filePath: { color: colors.textSecondary, fontSize: typography.xs, lineHeight: 16 },
  empty: { color: colors.textMuted, fontSize: typography.xs, paddingVertical: spacing.sm },
  error: { color: colors.error, fontSize: typography.xs, lineHeight: 17 },
  pressed: { opacity: 0.7 },
});
