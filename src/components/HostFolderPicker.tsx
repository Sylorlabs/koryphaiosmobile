import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, ChevronRight, Folder, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useControl } from '../control/ControlProvider';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type {
  HostDirectoryCreated,
  HostDirectoryInspection,
  WorkspaceNavigationState,
} from '../types/control';
import { ActionButton } from './ui';

export type HostFolderPickerMode =
  | 'open-project'
  | 'open-workspace'
  | 'new-project'
  | 'new-workspace';

type Props = {
  visible: boolean;
  mode: HostFolderPickerMode;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
};

const titles: Record<HostFolderPickerMode, string> = {
  'open-project': 'Open project',
  'open-workspace': 'Open workspace',
  'new-project': 'New project',
  'new-workspace': 'New workspace',
};

export function HostFolderPicker({ visible, mode, onClose, onChanged }: Props) {
  const { inspect, sendCommand, pairing, snapshot } = useControl();
  const hostKey = `${pairing?.machineId ?? ''}|${pairing?.baseUrl ?? ''}|${snapshot.machine?.id ?? ''}`;
  const inspectRef = useRef(inspect);
  const insets = useSafeAreaInsets();
  const [listing, setListing] = useState<HostDirectoryInspection | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const listingVersion = useRef(0);
  const scopeVersion = useRef(0);
  const creating = mode === 'new-project' || mode === 'new-workspace';

  useEffect(() => {
    inspectRef.current = inspect;
  }, [inspect]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      listingVersion.current += 1;
      scopeVersion.current += 1;
    };
  }, []);

  const load = useCallback(async (path?: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const version = ++listingVersion.current;
    setBusy(true);
    setError('');
    try {
      const next = await inspectRef.current<HostDirectoryInspection>('workspace.directories', path ? { path } : undefined);
      if (mounted.current && version === listingVersion.current) setListing(next);
    } catch (caught) {
      if (mounted.current && version === listingVersion.current) {
        setError(caught instanceof Error ? caught.message : 'Could not browse host folders');
      }
    } finally {
      if (mounted.current && version === listingVersion.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    // Opening a different mode or switching hosts invalidates any prior listing/action.
    listingVersion.current += 1;
    scopeVersion.current += 1;
    inFlight.current = false;
    const timer = setTimeout(() => {
      setBusy(false);
      setListing(null);
      setName('');
      setError('');
      if (visible) void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [hostKey, load, mode, visible]);

  const dismiss = useCallback(() => {
    // Invalidate synchronously: the parent may not have committed visible=false
    // before a pending host acknowledgement resolves and starts another action.
    scopeVersion.current += 1;
    listingVersion.current += 1;
    inFlight.current = true;
    onClose();
  }, [onClose]);

  const rootChips = useMemo(() => listing?.roots ?? [], [listing?.roots]);

  const finishProject = useCallback(async (
    projectPath: string,
    title: string | undefined,
    isCurrent: () => boolean,
  ) => {
    if (!isCurrent()) return;
    const parts = projectPath.split(/[\/]/).filter(Boolean);
    const folderName = title || parts[parts.length - 1] || 'Project';
    const selected = await sendCommand('project.select', {
      projectId: projectPath,
    });
    if (!isCurrent()) return;
    if (!selected.accepted) throw new Error('Project selection was rejected. No chat was created.');
    const verification = await inspect<WorkspaceNavigationState>('workspace.inspect');
    if (!isCurrent()) return;
    if (verification.selectedProject !== projectPath) {
      throw new Error('Project selection could not be verified. No new chat was requested; check the host.');
    }
    const created = await sendCommand('session.create', {
      projectId: projectPath,
      title: `Project: ${folderName}`,
    });
    if (!isCurrent()) return;
    if (!created.accepted) throw new Error('Chat creation was not confirmed. Check existing chats before retrying.');
    await onChanged();
    if (!isCurrent()) return;
    onClose();
    router.replace('/workspace');
  }, [inspect, onChanged, onClose, sendCommand]);

  const applyCurrentFolder = async () => {
    if (!listing || inFlight.current) return;
    const originatingScope = scopeVersion.current;
    const isCurrent = () => mounted.current && visible && originatingScope === scopeVersion.current;
    inFlight.current = true;
    setBusy(true);
    setError('');
    let createdPath = '';
    try {
      if (mode === 'open-workspace') {
        const opened = await sendCommand('workspace.open', { root: listing.path });
        if (!isCurrent()) return;
        if (!opened.accepted) throw new Error('The host did not accept opening this workspace.');
        await onChanged();
        if (isCurrent()) onClose();
        return;
      }
      if (mode === 'open-project') {
        await finishProject(listing.path, undefined, isCurrent);
        return;
      }

      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Enter a folder name');
      const result = await sendCommand('workspace.directory.create', {
        parentPath: listing.path,
        name: trimmedName,
      });
      if (!isCurrent()) return;
      if (!result.accepted) throw new Error('The host did not confirm creating the folder.');
      const created = result.data as HostDirectoryCreated | undefined;
      if (!created?.path) throw new Error('Host did not return the created folder');
      createdPath = created.path;
      if (mode === 'new-workspace') {
        const opened = await sendCommand('workspace.open', { root: created.path });
        if (!isCurrent()) return;
        if (!opened.accepted) throw new Error('The host did not confirm opening the new workspace.');
        await onChanged();
        if (isCurrent()) onClose();
        return;
      }
      await finishProject(created.path, created.name || trimmedName, isCurrent);
    } catch (caught) {
      if (isCurrent()) {
        const message = caught instanceof Error ? caught.message : 'Host folder action was not confirmed';
        setError(createdPath
          ? `Folder ${createdPath} was created. ${message} Check the host before creating another folder.`
          : `${message} Check the host before retrying.`);
      }
    } finally {
      if (isCurrent()) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={dismiss}>
      <View
        style={[
          styles.root,
          {
            paddingTop: Math.max(insets.top, spacing.sm),
            paddingBottom: Math.max(insets.bottom, spacing.sm),
          },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close folder browser"
            onPress={dismiss}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <X size={20} color={colors.textSecondary} />
          </Pressable>
          <Text style={styles.title}>{titles[mode]}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {listing ? (
          <View style={styles.locationBar}>
            {listing.parent ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Parent folder"
                disabled={busy}
                onPress={() => void load(listing.parent ?? undefined)}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <ArrowLeft size={19} color={colors.textSecondary} />
              </Pressable>
            ) : null}
            <View style={styles.locationCopy}>
              <Text numberOfLines={1} style={styles.locationName}>
                {listing.path.split(/[\\/]/).filter(Boolean).at(-1) || listing.path}
              </Text>
              <Text numberOfLines={1} style={styles.locationPath}>{listing.path}</Text>
            </View>
          </View>
        ) : null}

        {rootChips.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.roots}
          >
            {rootChips.map((root) => (
              <Pressable
                key={root.path}
                accessibilityRole="button"
                accessibilityLabel={`Browse root ${root.name}`}
                disabled={busy}
                onPress={() => void load(root.path)}
                style={({ pressed }) => [styles.rootChip, pressed && styles.pressed]}
              >
                <Text numberOfLines={1} style={styles.rootChipText}>{root.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {!listing && !error ? (
          <Text accessibilityLiveRegion="polite" style={styles.folderStatus}>Loading host folders…</Text>
        ) : null}
        {!listing && error && !busy ? (
          <View style={styles.retryPanel}>
            <ActionButton label="Retry folder listing" onPress={() => void load()} />
          </View>
        ) : null}

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {listing?.directories.map((entry) => (
            <Pressable
              key={entry.path}
              accessibilityRole="button"
              accessibilityLabel={`Open folder ${entry.name}`}
              disabled={busy}
              onPress={() => void load(entry.path)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Folder size={17} color={colors.textMuted} />
              <Text numberOfLines={1} style={styles.rowText}>{entry.name}</Text>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>
          ))}
          {listing && !listing.directories.length ? (
            <Text style={styles.empty}>No folders here.</Text>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {creating ? (
            <TextInput
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
              placeholder={mode === 'new-project' ? 'Project name' : 'Workspace name'}
              placeholderTextColor={colors.textMuted}
              style={styles.nameInput}
              returnKeyType="done"
              onSubmitEditing={() => void applyCurrentFolder()}
            />
          ) : null}
          <ActionButton
            label={creating ? 'Create here' : mode === 'open-project' ? 'Open project' : 'Open workspace'}
            disabled={!listing || busy || (creating && !name.trim())}
            loading={busy}
            onPress={() => void applyCurrentFolder()}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface1 },
  header: {
    height: 52,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '800',
  },
  headerSpacer: { width: 44 },
  locationBar: {
    minHeight: 58,
    marginHorizontal: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  locationCopy: { flex: 1, minWidth: 0, paddingRight: spacing.sm },
  locationName: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '700' },
  locationPath: { marginTop: 2, color: colors.textMuted, fontSize: 10 },
  roots: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.xs },
  rootChip: {
    minHeight: 44,
    maxWidth: 170,
    borderRadius: 22,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  rootChipText: { color: colors.textSecondary, fontSize: typography.xs, fontWeight: '600' },
  error: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    color: colors.error,
    fontSize: typography.xs,
    lineHeight: 17,
  },
  folderStatus: {
    color: colors.textMuted,
    fontSize: typography.sm,
    textAlign: 'center',
    padding: spacing.lg,
  },
  retryPanel: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  list: { flex: 1, marginTop: spacing.sm },
  listContent: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    gap: 2,
  },
  row: {
    minHeight: 48,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowText: { flex: 1, minWidth: 0, color: colors.textSecondary, fontSize: typography.sm },
  empty: { color: colors.textMuted, fontSize: typography.xs, paddingVertical: spacing.lg },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  nameInput: {
    minHeight: 46,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
    fontSize: typography.sm,
  },
  pressed: { opacity: 0.7 },
});
