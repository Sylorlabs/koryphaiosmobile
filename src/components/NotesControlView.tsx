import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ArchiveRestore,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileClock,
  FileDown,
  FileUp,
  FileText,
  Folder,
  GitFork,
  ListChecks,
  LayoutGrid,
  MoreHorizontal,
  Network,
  Paperclip,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Table2,
  Trash2,
  X,
} from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { SettingActionReviewRegistry, type SettingActionReview } from '../control/settingActionReviewRegistry';
import { settingActionReviewStorage } from '../control/settingActionReviewStorage';
import { pickFiles, shareBytesFile, shareTextFile, type PickedFile } from '../native/mobileFiles';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type {
  NoteAppearances,
  NoteBase,
  NoteBaseDefinition,
  NoteBaseQueryResult,
  NoteDraftSummary,
  NoteDraft,
  NoteFolderNode,
  NoteGraphData,
  NotePropertiesSnapshot,
  NotePropertySchema,
  NoteRelationship,
  NoteRevisionSummary,
  NotesInspection,
  NotesSettings,
  RemoteBinaryFile,
  RemoteNote,
  VaultRestorePreview,
  VaultRestoreResult,
} from '../types/control';
import { ActionButton } from './ui';
import { NotesNetworkControlView } from './NotesNetworkControlView';
import { NotesCanvasControlView } from './NotesCanvasControlView';

type WorkspaceMode = 'notes' | 'folders' | 'trash' | 'graph' | 'network' | 'canvas' | 'bases' | 'review' | 'files' | 'settings';
type NotePanel = '' | 'history' | 'properties' | 'appearances' | 'relationship' | 'attachments';

// note.create has no idempotency key. Persist the possibility of a desktop
// mutation BEFORE sending it, including when Recover creates a separate copy.
// Use machine identity instead of URL so direct/linked sessions share a guard.
const noteCreationReviews = new SettingActionReviewRegistry(settingActionReviewStorage);

function noteCreationReviewKey(machineId: string, projectId: string): string {
  return machineId && projectId ? `notes.create\u0000${machineId}\u0000${projectId}` : '';
}

const DEFAULT_BASE_DEFINITION: NoteBaseDefinition = {
  version: 1,
  sort: [],
  view: {
    kind: 'table',
    fields: [
      { source: 'system', field: 'title' },
      { source: 'system', field: 'folder' },
      { source: 'system', field: 'updated' },
    ],
  },
};

function ErrorText({ value }: { value: string }) {
  return value ? <Text style={styles.error}>{value}</Text> : null;
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}
    >
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={[styles.switchTrack, value && styles.switchTrackActive]}>
        <View style={[styles.switchThumb, value && styles.switchThumbActive]} />
      </View>
    </Pressable>
  );
}

function ChoiceRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: active }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.choice,
              active && styles.choiceActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function flattenFolders(nodes: NoteFolderNode[] | NoteFolderNode, depth = 0): { node: NoteFolderNode; depth: number }[] {
  const list = Array.isArray(nodes) ? nodes : [nodes];
  return list.flatMap((node) => [
    { node, depth },
    ...flattenFolders(node.children ?? [], depth + 1),
  ]);
}

function formatDate(value: string | number | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
}

function propertyText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.join(', ');
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

function parsePropertyValue(type: NotePropertySchema['kind'], value: string): unknown {
  if (type === 'number') return Number(value);
  if (type === 'checkbox') return value === 'true';
  if (type === 'list' || type === 'tags') {
    return value.split(',').map((part) => part.trim()).filter(Boolean);
  }
  return value;
}

function confirmsRecoveredCopy(note: RemoteNote, id: string, draft: NoteDraft, title: string): boolean {
  return note?.id === id
    && Number.isSafeInteger(note.revision) && note.revision > 0
    && note.title === title
    && note.content === draft.content
    && (note.folderPath || '/') === (draft.folderPath || '/')
    && note.format === draft.format
    && note.pinned === draft.pinned
    && note.includeInContext === draft.includeInContext
    && Array.isArray(note.tags)
    && note.tags.length === draft.tags.length
    && note.tags.every((tag, index) => tag === draft.tags[index]);
}

function ToolRow({
  label,
  detail,
  icon: Icon,
  onPress,
}: {
  label: string;
  detail?: string;
  icon: typeof Folder;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.toolRow, pressed && styles.pressed]}>
      <View style={styles.toolIcon}><Icon size={16} color={colors.accent} /></View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{label}</Text>
        {detail ? <Text numberOfLines={1} style={styles.rowMeta}>{detail}</Text> : null}
      </View>
      <ChevronRight size={16} color={colors.textMuted} />
    </Pressable>
  );
}

export function NotesControlView() {
  const { inspect, sendCommand, pairing, snapshot } = useControl();
  const createReviewKey = noteCreationReviewKey(pairing?.machineId ?? '', snapshot?.activeProjectId ?? '');
  const [mode, setMode] = useState<WorkspaceMode>('notes');
  const [menuOpen, setMenuOpen] = useState(false);
  const [data, setData] = useState<NotesInspection>({ notes: [] });
  const [selected, setSelected] = useState<RemoteNote | null>(null);
  const [recoveryDraft, setRecoveryDraft] = useState<NoteDraft | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [createNeedsReview, setCreateNeedsReview] = useState(
    () => Boolean(createReviewKey && noteCreationReviews.get(createReviewKey)),
  );
  const [createReviewReady, setCreateReviewReady] = useState(false);
  const [createReviewStorageError, setCreateReviewStorageError] = useState('');
  const [reviewListChecked, setReviewListChecked] = useState(false);
  const [reviewReleasing, setReviewReleasing] = useState(false);
  const [error, setError] = useState('');
  const refreshVersion = useRef(0);
  const openVersion = useRef(0);
  const creatingRef = useRef(false);
  const recoveringRef = useRef(false);
  const createNeedsReviewRef = useRef(Boolean(createReviewKey && noteCreationReviews.get(createReviewKey)));
  const reviewReleaseFlight = useRef(false);

  useEffect(() => {
    let active = true;
    const existing = Boolean(createReviewKey && noteCreationReviews.get(createReviewKey));
    queueMicrotask(() => {
      if (!active) return;
      setCreateReviewReady(false);
      setReviewListChecked(false);
      setCreateReviewStorageError(createReviewKey ? '' : 'Choose a connected machine and project to create notes.');
      createNeedsReviewRef.current = existing;
      setCreateNeedsReview(existing);
    });
    if (!createReviewKey) {
      return () => { active = false; };
    }
    void noteCreationReviews.load(createReviewKey).then((saved) => {
      if (!active) return;
      const locked = Boolean(noteCreationReviews.get(createReviewKey) ?? saved);
      createNeedsReviewRef.current = locked;
      setCreateNeedsReview(locked);
      setCreateReviewReady(true);
    }).catch(() => {
      if (!active) return;
      setCreateReviewStorageError('Saved creation status is unavailable. Creating and recovering notes is disabled until it can be checked.');
    });
    return () => { active = false; };
  }, [createReviewKey]);

  const releaseCreateReview = async (record: SettingActionReview) => {
    if (!await noteCreationReviews.release(createReviewKey, record)) {
      throw new Error('The saved creation review changed. Recheck the notes list.');
    }
    createNeedsReviewRef.current = false;
    setCreateNeedsReview(false);
    setReviewListChecked(false);
  };

  const refresh = useCallback(async (query: string, forReview = false) => {
    const version = ++refreshVersion.current;
    setLoading(true);
    setError('');
    try {
      const next = await inspect<NotesInspection>('notes.inspect', { search: query });
      if (version === refreshVersion.current) {
        setData(next);
        if (forReview && Array.isArray(next?.notes)) setReviewListChecked(true);
      }
    } catch (caught) {
      if (version === refreshVersion.current) {
        setError(caught instanceof Error ? caught.message : 'Could not load notes');
      }
    } finally {
      if (version === refreshVersion.current) setLoading(false);
    }
  }, [inspect]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(''), 0);
    return () => {
      clearTimeout(timer);
      refreshVersion.current += 1;
      openVersion.current += 1;
    };
  }, [refresh]);

  const openNote = async (id: string, draft?: NoteDraft, onFailure?: () => void, onVerified?: () => Promise<void>) => {
    const version = ++openVersion.current;
    setLoading(true);
    setError('');
    try {
      const next = await inspect<RemoteNote>('notes.read', { noteId: id });
      if (version !== openVersion.current) return;
      if (!next || next.id !== id) {
        throw new Error('The desktop note ID does not match the note you selected.');
      }
      setSelected(next);
      setRecoveryDraft(draft ?? null);
      setMode('notes');
      setMenuOpen(false);
      await onVerified?.();
    } catch (caught) {
      if (version === openVersion.current) {
        setError(caught instanceof Error ? caught.message : 'Could not open note');
        onFailure?.();
      }
    } finally {
      if (version === openVersion.current) setLoading(false);
    }
  };

  const createNote = async () => {
    // A remote create has no idempotency key. Guard before the first await so
    // rapid taps or uncertain replies cannot create several desktop notes.
    if (!createReviewKey || !createReviewReady || creatingRef.current || recoveringRef.current ||
      createNeedsReviewRef.current || noteCreationReviews.get(createReviewKey)) return;
    creatingRef.current = true;
    setCreating(true);
    const review = noteCreationReviews.reserve(createReviewKey, 'New note');
    if (!review) {
      creatingRef.current = false;
      setCreating(false);
      createNeedsReviewRef.current = true;
      setCreateNeedsReview(true);
      return;
    }
    createNeedsReviewRef.current = true;
    setCreateNeedsReview(true);
    const selectionVersion = openVersion.current;
    let definitivelyRejected = false;
    setLoading(true);
    setError('');
    try {
      // A lost response or app termination cannot safely allow another create.
      await noteCreationReviews.persist(createReviewKey, review);
      const result = await sendCommand('note.create', {
        title: 'Untitled note',
        content: '',
        format: 'markdown',
      });
      if (!result.accepted) {
        definitivelyRejected = true;
        await releaseCreateReview(review);
        throw new Error('The desktop did not accept the new note request.');
      }
      const candidate = result.data as RemoteNote | undefined;
      const note = candidate && typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate : undefined;
      await refresh('');
      if (!note) {
        setError('The desktop accepted the request, but did not return a note ID. Check the notes list before creating another note.');
      } else if (selectionVersion === openVersion.current) {
        // A late host result must not replace a different note the user opened.
        await openNote(note.id, undefined, () => {
          createNeedsReviewRef.current = true;
          setCreateNeedsReview(true);
          setError('The note was created, but could not be opened. Check the notes list before attempting another creation.');
        }, () => releaseCreateReview(review));
      } else {
        // Do not navigate away from the other note selected during creation.
        // An independent read can still confirm the created note on the host.
        const verified = await inspect<RemoteNote>('notes.read', { noteId: note.id });
        if (!verified || verified.id !== note.id) throw new Error('New note could not be verified on the desktop.');
        await releaseCreateReview(review);
      }
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : 'The request was interrupted';
      if (!definitivelyRejected) {
        // A network exception may arrive after the host has already created
        // the note. Only the user's explicit review can release this lock.
        createNeedsReviewRef.current = true;
        setCreateNeedsReview(true);
        setError(`The new note may have been created, or its local review could not be saved. ${detail}. Check the notes list before creating another note.`);
      } else {
        if (noteCreationReviews.get(createReviewKey)) {
          createNeedsReviewRef.current = true;
          setCreateNeedsReview(true);
        }
        setError(detail);
      }
    } finally {
      creatingRef.current = false;
      setCreating(false);
      setLoading(false);
    }
  };

  const recoverDraft = async (summary: NoteDraftSummary) => {
    // Recovering an orphan is also a non-idempotent note.create. Never allow
    // another Recover (or New note) until the first result has settled.
    if (!createReviewKey || !createReviewReady || creatingRef.current || recoveringRef.current ||
      createNeedsReviewRef.current || noteCreationReviews.get(createReviewKey)) return;
    recoveringRef.current = true;
    setRecovering(true);
    const selectionVersion = openVersion.current;
    let createAttempted = false;
    let createRejected = false;
    let review: SettingActionReview | null = null;
    setLoading(true);
    setError('');
    try {
      const draft = await inspect<NoteDraft>('notes.draft', { draftId: summary.id });
      // Only a host-classified orphaned/trashed draft authorizes creating a
      // separate note. A transient read/auth failure for a recoverable draft
      // must never be interpreted as proof that its original was deleted.
      const needsCopy = draft.state === 'orphaned' || draft.state === 'trashed';
      const remote = needsCopy ? null : await inspect<RemoteNote>('notes.read', { noteId: draft.noteId });
      if (!needsCopy && (!remote || remote.id !== draft.noteId)) {
        throw new Error('The original note could not be verified. Refresh the recovery list before retrying.');
      }
      if (remote) {
        if (selectionVersion === openVersion.current) {
          setSelected(remote);
          setRecoveryDraft(draft);
          setMode('notes');
          setMenuOpen(false);
        }
        return;
      }

      const title = `${draft.title || draft.baseTitle} (recovered)`;
      review = noteCreationReviews.reserve(createReviewKey, 'Recover note');
      if (!review) throw new Error('A previous note creation requires review.');
      createNeedsReviewRef.current = true;
      setCreateNeedsReview(true);
      await noteCreationReviews.persist(createReviewKey, review);
      createAttempted = true;
      const created = await sendCommand('note.create', {
        title,
        content: draft.content,
        folderPath: draft.folderPath || '/',
        tags: draft.tags,
        pinned: draft.pinned,
        includeInContext: draft.includeInContext,
        format: draft.format,
      });
      if (!created.accepted) {
        createRejected = true;
        await releaseCreateReview(review);
        throw new Error('The desktop did not accept the recovery request. Your draft is still available.');
      }
      const copy = created.data as RemoteNote | undefined;
      if (!copy || typeof copy.id !== 'string' || !copy.id.trim()) {
        throw new Error('The desktop accepted recovery without returning a usable note ID.');
      }
      // A returned ID alone does not confirm the desktop persisted the draft's
      // content. Keep the recovery draft until a separate host read matches.
      const verified = await inspect<RemoteNote>('notes.read', { noteId: copy.id });
      if (!confirmsRecoveredCopy(verified, copy.id, draft, title)) {
        throw new Error('The recovered note did not match the desktop readback.');
      }

      let discardUnconfirmed = false;
      try {
        const discarded = await sendCommand('notes.draft_discard', {
          draftId: draft.id,
          expectedDraftRevision: draft.draftRevision,
        });
        discardUnconfirmed = !discarded.accepted;
        if (!discardUnconfirmed) {
          // The command acknowledgement does not prove the original draft is
          // gone. The host returns an unpaginated, project-scoped draft list.
          const remaining = await inspect<NoteDraftSummary[]>('notes.drafts');
          discardUnconfirmed = !Array.isArray(remaining) || remaining.some((item) => item.id === draft.id);
        }
      } catch {
        discardUnconfirmed = true;
      }
      await refresh('');
      if (selectionVersion === openVersion.current) {
        // The readback above is already authoritative; avoid a second remote
        // roundtrip before showing the recovered note.
        setSelected(verified);
        setRecoveryDraft(null);
        setMode('notes');
        setMenuOpen(false);
      }
      if (discardUnconfirmed) {
        createNeedsReviewRef.current = true;
        setCreateNeedsReview(true);
        setError('The new note is confirmed, but the recovery draft could not be confirmed discarded. Check the notes list and recovery drafts before trying again.');
      } else {
        await releaseCreateReview(review);
      }
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : 'Could not recover draft';
      if ((createAttempted && !createRejected) || Boolean(review && noteCreationReviews.get(createReviewKey))) {
        createNeedsReviewRef.current = true;
        setCreateNeedsReview(true);
        setError(`The desktop may have created a recovered note. The original draft was retained. ${detail} Check the notes list before recovering again.`);
      } else {
        setError(detail);
      }
    } finally {
      recoveringRef.current = false;
      setRecovering(false);
      setLoading(false);
    }
  };

  if (selected) {
    const selectedVersion = openVersion.current;
    return (
      <NoteEditor
        key={`${selected.id}:${recoveryDraft?.id ?? 'live'}`}
        note={selected}
        recoveryDraft={recoveryDraft}
        allNotes={data.notes}
        loading={loading}
        setLoading={setLoading}
        inspect={inspect}
        sendCommand={sendCommand}
        onClose={() => {
          // A response to an editor command must never reopen a note after
          // the user has left it or chosen another destination.
          openVersion.current += 1;
          setSelected(null);
          setRecoveryDraft(null);
          void refresh(search);
        }}
        onUpdated={(note, recoveryDraftNeedsReview) => {
          if (selectedVersion !== openVersion.current) return;
          setSelected((current) => current?.id === note.id ? note : current);
          setRecoveryDraft((current) => current && selected.id === note.id ? null : current);
          if (recoveryDraftNeedsReview) {
            createNeedsReviewRef.current = true;
            setCreateNeedsReview(true);
          }
        }}
        onOpenNote={(id) => void openNote(id)}
        error={error}
        setError={setError}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.toolbar}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => {
            setMode('notes');
            setMenuOpen(false);
            void refresh(search);
          }}
          returnKeyType="search"
          placeholder="Search notes"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.searchInput]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New note"
          accessibilityState={{ disabled: !createReviewReady || creating || recovering || createNeedsReview, busy: !createReviewReady || creating || recovering }}
          disabled={!createReviewReady || creating || recovering || createNeedsReview}
          onPress={() => void createNote()}
          style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
        >
          <Plus size={18} color={colors.accent} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More note tools"
          accessibilityState={{ expanded: menuOpen }}
          onPress={() => setMenuOpen((value) => !value)}
          style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
        >
          {menuOpen ? <X size={18} color={colors.textMuted} /> : <MoreHorizontal size={19} color={colors.textMuted} />}
        </Pressable>
      </View>

      {creating ? <Text accessibilityRole="text" style={styles.notice}>Creating note…</Text> : null}
      {recovering ? <Text accessibilityRole="text" style={styles.notice}>Recovering draft…</Text> : null}

      {menuOpen ? (
        <View style={styles.menuCard}>
          <ToolRow label="Folders" detail="Browse note locations" icon={Folder} onPress={() => { setMode('folders'); setMenuOpen(false); }} />
          <ToolRow label="Trash" detail="Restore deleted notes" icon={ArchiveRestore} onPress={() => { setMode('trash'); setMenuOpen(false); }} />
          <ToolRow label="Graph" detail="Browse linked notes" icon={GitFork} onPress={() => { setMode('graph'); setMenuOpen(false); }} />
          <ToolRow label="Network" detail="Evidence, retrieval, semantic index" icon={Network} onPress={() => { setMode('network'); setMenuOpen(false); }} />
          <ToolRow label="Canvas" detail="Spatial note cards and links" icon={LayoutGrid} onPress={() => { setMode('canvas'); setMenuOpen(false); }} />
          <ToolRow label="Bases" detail="Saved note views" icon={Table2} onPress={() => { setMode('bases'); setMenuOpen(false); }} />
          <ToolRow label="Review" detail="Relationships and recovery drafts" icon={ListChecks} onPress={() => { setMode('review'); setMenuOpen(false); }} />
          <ToolRow label="Import & backup" detail="Files, vault export and restore" icon={FileUp} onPress={() => { setMode('files'); setMenuOpen(false); }} />
          <ToolRow label="Settings" detail="Notes behavior and limits" icon={Settings2} onPress={() => { setMode('settings'); setMenuOpen(false); }} />
          <ToolRow
            label="Sync project"
            detail="Re-index project documents"
            icon={RefreshCw}
            onPress={() => {
              setMenuOpen(false);
              void sendCommand('notes.sync').then(() => refresh(search)).catch((caught) => {
                setError(caught instanceof Error ? caught.message : 'Could not sync notes');
              });
            }}
          />
        </View>
      ) : null}

      <ErrorText value={error} />
      <ErrorText value={createReviewStorageError} />
      {createNeedsReview && !creating && !recovering ? (
        <View style={styles.noticeCard}>
          <Text style={styles.notice}>Check the current desktop’s notes and recovery drafts before another creation. Refreshing the list will not create a note.</Text>
          <ActionButton label="Refresh notes" onPress={() => { setSearch(''); void refresh('', true); }} />
          <ActionButton
            label="Checked list — allow another"
            disabled={!reviewListChecked || reviewReleasing || creating || recovering}
            onPress={() => {
              if (!reviewListChecked || reviewReleaseFlight.current || !createReviewKey) return;
              const saved = noteCreationReviews.get(createReviewKey);
              if (!saved) return;
              reviewReleaseFlight.current = true;
              setReviewReleasing(true);
              void releaseCreateReview(saved).then(() => setError('')).catch(() => {
                setError('Could not clear saved creation status. Notes creation remains disabled.');
              }).finally(() => {
                reviewReleaseFlight.current = false;
                setReviewReleasing(false);
              });
            }}
          />
        </View>
      ) : null}
      {mode !== 'notes' ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back to notes" onPress={() => setMode('notes')} style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}>
          <ChevronLeft size={16} color={colors.textMuted} />
          <Text style={styles.backText}>Notes</Text>
          <Text style={styles.modeTitle}>{mode[0].toUpperCase() + mode.slice(1)}</Text>
        </Pressable>
      ) : null}

      {mode === 'notes' ? <NotesList notes={data.notes} loading={loading} onOpen={openNote} /> : null}
      {mode === 'folders' ? <FoldersView inspect={inspect} notes={data.notes} onOpen={openNote} /> : null}
      {mode === 'trash' ? (
        <TrashView inspect={inspect} sendCommand={sendCommand} onRefresh={() => refresh('')} onOpen={openNote} />
      ) : null}
      {mode === 'graph' ? <GraphView inspect={inspect} onOpen={openNote} /> : null}
      {mode === 'network' ? <NotesNetworkControlView onOpenNote={(id) => void openNote(id)} /> : null}
      {mode === 'canvas' ? (
        <NotesCanvasControlView
          notes={data.notes}
          onOpenNote={(id) => void openNote(id)}
          onRefresh={() => refresh('')}
        />
      ) : null}
      {mode === 'bases' ? <BasesView inspect={inspect} sendCommand={sendCommand} onOpen={openNote} /> : null}
      {mode === 'review' ? <ReviewView inspect={inspect} sendCommand={sendCommand} onRecover={recoverDraft} busy={!createReviewReady || creating || recovering || createNeedsReview} /> : null}
      {mode === 'files' ? <NotesFilesView inspect={inspect} sendCommand={sendCommand} onRefresh={() => refresh('')} onOpen={openNote} /> : null}
      {mode === 'settings' ? <NotesSettingsView inspect={inspect} sendCommand={sendCommand} /> : null}
    </ScrollView>
  );
}

function NotesList({
  notes,
  loading,
  onOpen,
}: {
  notes: RemoteNote[];
  loading: boolean;
  onOpen: (id: string) => Promise<void>;
}) {
  return (
    <View style={styles.listCard}>
      {notes.map((note) => (
        <Pressable key={note.id} accessibilityRole="button" accessibilityLabel={`Open note ${note.title || 'Untitled note'}`} onPress={() => void onOpen(note.id)} style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}>
          <FileText size={17} color={note.pinned ? colors.accent : colors.textMuted} />
          <View style={styles.rowCopy}>
            <Text numberOfLines={1} style={styles.rowTitle}>{note.title || 'Untitled note'}</Text>
            <Text numberOfLines={1} style={styles.rowMeta}>
              {note.folderPath || '/'}{note.includeInContext ? '  Context' : ''}
            </Text>
          </View>
          <ChevronRight size={16} color={colors.textMuted} />
        </Pressable>
      ))}
      {!notes.length && !loading ? <Text style={styles.empty}>No notes</Text> : null}
    </View>
  );
}

function FoldersView({
  inspect,
  notes,
  onOpen,
}: {
  inspect: <T>(name: string, payload?: Record<string, unknown>) => Promise<T>;
  notes: RemoteNote[];
  onOpen: (id: string) => Promise<void>;
}) {
  const [folders, setFolders] = useState<{ node: NoteFolderNode; depth: number }[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      void inspect<NoteFolderNode[] | NoteFolderNode>('notes.folders')
        .then((tree) => setFolders(flattenFolders(tree)))
        .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load folders'));
    }, 0);
    return () => clearTimeout(timer);
  }, [inspect]);

  const visible = selectedPath
    ? notes.filter((note) => note.folderPath === selectedPath || note.folderPath.startsWith(selectedPath + '/'))
    : [];

  return (
    <View style={styles.section}>
      <ErrorText value={error} />
      <View style={styles.listCard}>
        {folders.map(({ node, depth }) => (
          <Pressable
            key={node.path}
            onPress={() => setSelectedPath((current) => current === node.path ? '' : node.path)}
            style={({ pressed }) => [
              styles.listRow,
              { paddingLeft: spacing.sm + Math.min(depth, 4) * 14 },
              pressed && styles.pressed,
            ]}
          >
            <Folder size={16} color={selectedPath === node.path ? colors.accent : colors.textMuted} />
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{node.name || node.path}</Text>
              <Text style={styles.rowMeta}>{node.noteCount} note{node.noteCount === 1 ? '' : 's'}</Text>
            </View>
            <ChevronRight size={15} color={colors.textMuted} />
          </Pressable>
        ))}
        {!folders.length ? <Text style={styles.empty}>No folders</Text> : null}
      </View>
      {selectedPath ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{selectedPath}</Text>
          <NotesList notes={visible} loading={false} onOpen={onOpen} />
        </View>
      ) : null}
    </View>
  );
}

function TrashView({
  inspect,
  sendCommand,
  onRefresh,
  onOpen,
}: {
  inspect: <T>(name: string, payload?: Record<string, unknown>) => Promise<T>;
  sendCommand: (name: string, payload?: Record<string, unknown>) => Promise<{ accepted: boolean; data?: unknown }>;
  onRefresh: () => Promise<void>;
  onOpen: (id: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState<RemoteNote[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setNotes(await inspect<RemoteNote[]>('notes.trash'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load trash');
    }
  }, [inspect]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <View style={styles.section}>
      <ErrorText value={error} />
      <View style={styles.listCard}>
        {notes.map((note) => (
          <View key={note.id} style={styles.listRow}>
            <Trash2 size={16} color={colors.textMuted} />
            <View style={styles.rowCopy}>
              <Text numberOfLines={1} style={styles.rowTitle}>{note.title || 'Untitled note'}</Text>
              <Text numberOfLines={1} style={styles.rowMeta}>{note.folderPath || '/'}</Text>
            </View>
            <ActionButton
              label="Restore"
              onPress={() =>
                void sendCommand('note.restore', {
                  noteId: note.id,
                  expectedRevision: note.revision,
                }).then(async () => {
                  await load();
                  await onRefresh();
                }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not restore note'))
              }
            />
          </View>
        ))}
        {!notes.length ? <Text style={styles.empty}>Trash is empty</Text> : null}
      </View>
    </View>
  );
}

function NotesFilesView({
  inspect,
  sendCommand,
  onRefresh,
  onOpen,
}: {
  inspect: <T>(name: string, payload?: Record<string, unknown>) => Promise<T>;
  sendCommand: (name: string, payload?: Record<string, unknown>) => Promise<{ accepted: boolean; data?: unknown }>;
  onRefresh: () => Promise<void>;
  onOpen: (id: string) => Promise<void>;
}) {
  const [vaultFile, setVaultFile] = useState<PickedFile | null>(null);
  const [preview, setPreview] = useState<VaultRestorePreview | null>(null);
  const [result, setResult] = useState<VaultRestoreResult | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const importDocument = async () => {
    setBusy('import');
    setError('');
    setStatus('');
    try {
      const file = (await pickFiles({ multiple: false }))[0];
      if (!file) return;
      const response = await sendCommand('notes.import_file', {
        data: file.data,
        name: file.name,
        mimeType: file.mimeType,
      });
      const note = response.data as RemoteNote | undefined;
      await onRefresh();
      if (note) await onOpen(note.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not import note file');
    } finally {
      setBusy('');
    }
  };

  const importMemory = async () => {
    setBusy('memory');
    setError('');
    setStatus('');
    try {
      const response = await sendCommand('notes.import_memory');
      const report = response.data as { imported?: number; skipped?: number; failed?: number } | undefined;
      setStatus(
        report
          ? `${report.imported ?? 0} imported  ${report.skipped ?? 0} skipped  ${report.failed ?? 0} failed`
          : 'Memory import complete',
      );
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not import memory documents');
    } finally {
      setBusy('');
    }
  };

  const exportVault = async () => {
    setBusy('export');
    setError('');
    try {
      const file = await inspect<RemoteBinaryFile>('notes.vault_export');
      await shareBytesFile(file.filename, file.bytes, file.mimeType);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not export Notes vault');
    } finally {
      setBusy('');
    }
  };

  const chooseVault = async () => {
    setBusy('preview');
    setError('');
    setResult(null);
    try {
      const file = (await pickFiles({ multiple: false }))[0];
      if (!file) return;
      const response = await sendCommand('notes.vault_preview', {
        data: file.data,
        name: file.name,
        mimeType: file.mimeType,
      });
      const next = response.data as VaultRestorePreview | undefined;
      if (!next) throw new Error('Vault preview was not returned by the host');
      setVaultFile(file);
      setPreview(next);
    } catch (caught) {
      setVaultFile(null);
      setPreview(null);
      setError(caught instanceof Error ? caught.message : 'Could not preview Notes vault');
    } finally {
      setBusy('');
    }
  };

  const restoreVault = async () => {
    if (!vaultFile || !preview?.canRestore || busy) return;
    setBusy('restore');
    setError('');
    try {
      const response = await sendCommand('notes.vault_restore', {
        data: vaultFile.data,
        name: vaultFile.name,
        mimeType: vaultFile.mimeType,
        archiveSha256: preview.archiveSha256,
      });
      const restored = response.data as VaultRestoreResult | undefined;
      if (!restored) throw new Error('Vault restore result was not returned by the host');
      setResult(restored);
      setPreview(restored);
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not restore Notes vault');
    } finally {
      setBusy('');
    }
  };

  return (
    <View style={styles.section}>
      <ErrorText value={error} />
      {status ? <Text style={styles.notice}>{status}</Text> : null}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Import</Text>
        <ToolRow label="Markdown or HTML file" detail="Create a project note from a file" icon={FileUp} onPress={() => void importDocument()} />
        <ToolRow label="Memory documents" detail="Import host memory files as notes" icon={FileText} onPress={() => void importMemory()} />
        {busy === 'import' || busy === 'memory' ? <Text style={styles.notice}>Working…</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Backup</Text>
        <ToolRow label="Export Notes vault" detail="Share the complete portable archive" icon={FileDown} onPress={() => void exportVault()} />
        <ToolRow label="Restore Notes vault" detail="Preview an archive before changing the host" icon={ArchiveRestore} onPress={() => void chooseVault()} />
        {busy === 'export' || busy === 'preview' ? <Text style={styles.notice}>Working…</Text> : null}
      </View>

      {preview ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{preview.projectName || 'Vault preview'}</Text>
          <Text style={styles.rowMeta}>
            {preview.notes} notes  {preview.revisions} revisions  {preview.attachments} attachments  {preview.relationships} relationships
          </Text>
          <Text style={styles.rowMeta}>{preview.bases} Bases  {preview.drafts} drafts  {preview.noOpNotes} unchanged notes</Text>
          {preview.conflicts.map((conflict, index) => (
            <Text key={`${conflict.kind}:${conflict.archiveId ?? conflict.path ?? index}`} style={styles.error}>
              {conflict.kind.replaceAll('_', ' ')}: {conflict.message}
            </Text>
          ))}
          {result ? (
            <Text style={styles.notice}>
              Restored {result.restoredNotes} notes, {result.restoredRevisions} revisions, {result.restoredAttachments} attachments, {result.restoredRelationships} relationships, {result.restoredBases} Bases and {result.restoredDrafts} drafts.
            </Text>
          ) : (
            <ActionButton
              label={busy === 'restore' ? 'Restoring…' : 'Restore this archive'}
              primary
              disabled={!preview.canRestore || busy === 'restore'}
              onPress={() => void restoreVault()}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

function GraphView({
  inspect,
  onOpen,
}: {
  inspect: <T>(name: string, payload?: Record<string, unknown>) => Promise<T>;
  onOpen: (id: string) => Promise<void>;
}) {
  const [graph, setGraph] = useState<NoteGraphData | null>(null);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'linked'>('linked');
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      void inspect<NoteGraphData>('notes.graph')
        .then(setGraph)
        .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load graph'));
    }, 0);
    return () => clearTimeout(timer);
  }, [inspect]);

  const nodes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (graph?.nodes ?? [])
      .filter((node) => scope === 'all' || node.linkCount > 0)
      .filter((node) => !normalized || node.title.toLowerCase().includes(normalized) || node.tags.some((tag) => tag.toLowerCase().includes(normalized)))
      .sort((a, b) => b.linkCount - a.linkCount);
  }, [graph?.nodes, query, scope]);

  return (
    <View style={styles.section}>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search graph" placeholderTextColor={colors.textMuted} style={styles.input} />
      <ChoiceRow value={scope} onChange={setScope} options={[{ value: 'linked', label: 'Connected' }, { value: 'all', label: 'All' }]} />
      <ErrorText value={error} />
      <View style={styles.listCard}>
        {nodes.map((node) => (
          <Pressable
            key={node.id}
            disabled={node.unresolved}
            onPress={() => void onOpen(node.id)}
            style={({ pressed }) => [styles.listRow, node.unresolved && styles.disabled, pressed && styles.pressed]}
          >
            <GitFork size={16} color={node.linkCount ? colors.accent : colors.textMuted} />
            <View style={styles.rowCopy}>
              <Text numberOfLines={1} style={styles.rowTitle}>{node.title}</Text>
              <Text style={styles.rowMeta}>{node.linkCount} link{node.linkCount === 1 ? '' : 's'}  {node.folderPath}</Text>
            </View>
            {!node.unresolved ? <ChevronRight size={15} color={colors.textMuted} /> : null}
          </Pressable>
        ))}
        {!nodes.length ? <Text style={styles.empty}>No matching graph nodes</Text> : null}
      </View>
      {graph?.truncated ? <Text style={styles.notice}>Showing {graph.shown ?? graph.nodes.length} of about {graph.total ?? graph.nodes.length} notes.</Text> : null}
    </View>
  );
}

function BasesView({
  inspect,
  sendCommand,
  onOpen,
}: {
  inspect: <T>(name: string, payload?: Record<string, unknown>) => Promise<T>;
  sendCommand: (name: string, payload?: Record<string, unknown>) => Promise<{ accepted: boolean; data?: unknown }>;
  onOpen: (id: string) => Promise<void>;
}) {
  const [bases, setBases] = useState<NoteBase[]>([]);
  const [selected, setSelected] = useState<NoteBase | null>(null);
  const [result, setResult] = useState<NoteBaseQueryResult | null>(null);
  const [name, setName] = useState('');
  const [definition, setDefinition] = useState('');
  const [editingDefinition, setEditingDefinition] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setBases(await inspect<NoteBase[]>('notes.bases'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load Bases');
    }
  }, [inspect]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const openBase = async (base: NoteBase) => {
    setSelected(base);
    setName(base.name);
    setDefinition(JSON.stringify(base.definition, null, 2));
    setEditingDefinition(false);
    setError('');
    try {
      setResult(await inspect<NoteBaseQueryResult>('notes.base_query', {
        baseId: base.id,
        limit: 100,
        offset: 0,
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not query Base');
    }
  };

  if (selected) {
    return (
      <View style={styles.section}>
        <Pressable onPress={() => { setSelected(null); setResult(null); }} style={styles.backRow}>
          <ChevronLeft size={16} color={colors.textMuted} />
          <Text style={styles.backText}>Bases</Text>
        </Pressable>
        <View style={styles.card}>
          <TextInput value={name} onChangeText={setName} style={styles.input} />
          <ChoiceRow
            value={selected.definition.view.kind}
            onChange={(kind) => {
              const next = {
                ...selected,
                definition: {
                  ...selected.definition,
                  view: { ...selected.definition.view, kind },
                },
              };
              setSelected(next);
              setDefinition(JSON.stringify(next.definition, null, 2));
            }}
            options={[
              { value: 'table', label: 'Table' },
              { value: 'list', label: 'List' },
              { value: 'card', label: 'Cards' },
            ]}
          />
          <Pressable onPress={() => setEditingDefinition((value) => !value)} style={styles.disclosureRow}>
            <Text style={styles.disclosureText}>Filters, sorting and fields</Text>
            {editingDefinition ? <ChevronDown size={15} color={colors.textMuted} /> : <ChevronRight size={15} color={colors.textMuted} />}
          </Pressable>
          {editingDefinition ? (
            <TextInput
              value={definition}
              onChangeText={setDefinition}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              textAlignVertical="top"
              style={styles.definitionInput}
            />
          ) : null}
          <View style={styles.actionRow}>
            <ActionButton
              label="Save"
              primary
              onPress={() => {
                let parsed: NoteBaseDefinition;
                try {
                  parsed = JSON.parse(definition) as NoteBaseDefinition;
                } catch {
                  setError('Base definition is not valid JSON');
                  return;
                }
                void sendCommand('notes.base_update', {
                  baseId: selected.id,
                  expectedRevision: selected.revision,
                  name: name.trim() || selected.name,
                  definition: parsed,
                }).then(async (response) => {
                  const updated = response.data as NoteBase | undefined;
                  if (updated) await openBase(updated);
                  await load();
                }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not save Base'));
              }}
            />
            {selected.trashedAt ? (
              <ActionButton
                label="Restore"
                onPress={() => void sendCommand('notes.base_restore', {
                  baseId: selected.id,
                  expectedRevision: selected.revision,
                }).then(async () => {
                  setSelected(null);
                  await load();
                })}
              />
            ) : (
              <ActionButton
                label="Move to trash"
                danger
                onPress={() => void sendCommand('notes.base_delete', {
                  baseId: selected.id,
                  expectedRevision: selected.revision,
                }).then(async () => {
                  setSelected(null);
                  await load();
                })}
              />
            )}
          </View>
        </View>
        <ErrorText value={error} />
        <View style={styles.listCard}>
          {(result?.rows ?? []).map((row) => (
            <Pressable key={row.id} onPress={() => void onOpen(row.id)} style={styles.listRow}>
              <FileText size={16} color={colors.textMuted} />
              <View style={styles.rowCopy}>
                <Text numberOfLines={1} style={styles.rowTitle}>{row.title}</Text>
                <Text numberOfLines={1} style={styles.rowMeta}>{row.folderPath}</Text>
              </View>
              <ChevronRight size={15} color={colors.textMuted} />
            </Pressable>
          ))}
          {result && !result.rows.length ? <Text style={styles.empty}>No notes match this Base</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <ActionButton
        label="New Base"
        icon={Plus}
        primary
        onPress={() =>
          void sendCommand('notes.base_create', {
            name: 'New Base ' + (bases.filter((base) => !base.trashedAt).length + 1),
            definition: DEFAULT_BASE_DEFINITION,
          }).then(async (response) => {
            await load();
            const created = response.data as NoteBase | undefined;
            if (created) await openBase(created);
          }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not create Base'))
        }
      />
      <ErrorText value={error} />
      <View style={styles.listCard}>
        {bases.map((base) => (
          <Pressable
            key={base.id}
            onPress={() => void openBase(base)}
            style={({ pressed }) => [styles.listRow, Boolean(base.trashedAt) && styles.disabled, pressed && styles.pressed]}
          >
            <Table2 size={16} color={base.trashedAt ? colors.textMuted : colors.accent} />
            <View style={styles.rowCopy}>
              <Text numberOfLines={1} style={styles.rowTitle}>{base.name}</Text>
              <Text style={styles.rowMeta}>{base.definition.view.kind}{base.trashedAt ? '  Trashed' : ''}</Text>
            </View>
            <ChevronRight size={15} color={colors.textMuted} />
          </Pressable>
        ))}
        {!bases.length ? <Text style={styles.empty}>No Bases</Text> : null}
      </View>
    </View>
  );
}

function ReviewView({
  inspect,
  sendCommand,
  onRecover,
  busy,
}: {
  inspect: <T>(name: string, payload?: Record<string, unknown>) => Promise<T>;
  sendCommand: (name: string, payload?: Record<string, unknown>) => Promise<{ accepted: boolean; data?: unknown }>;
  onRecover: (draft: NoteDraftSummary) => Promise<void>;
  busy: boolean;
}) {
  const [relationships, setRelationships] = useState<NoteRelationship[]>([]);
  const [drafts, setDrafts] = useState<NoteDraftSummary[]>([]);
  const [error, setError] = useState('');
  const [reviewingRelationshipKey, setReviewingRelationshipKey] = useState<string | null>(null);
  const [relationshipNeedsCheck, setRelationshipNeedsCheck] = useState<{
    key: string;
    fromId: string;
    toId: string;
    status: 'accepted' | 'rejected';
    revision: number;
  } | null>(null);
  const relationshipFlight = useRef<string | null>(null);
  const [confirmDiscardId, setConfirmDiscardId] = useState<string | null>(null);
  const [discardingDraftId, setDiscardingDraftId] = useState<string | null>(null);
  const [discardNeedsHostCheckId, setDiscardNeedsHostCheckId] = useState<string | null>(null);
  const discardFlight = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextRelationships, nextDrafts] = await Promise.all([
        inspect<NoteRelationship[]>('notes.relationships', { status: 'proposed' }),
        inspect<NoteDraftSummary[]>('notes.drafts'),
      ]);
      setRelationships(nextRelationships);
      setDrafts(nextDrafts);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load review queue');
    }
  }, [inspect]);

  const checkRelationshipOnHost = async (request: NonNullable<typeof relationshipNeedsCheck>) => {
    try {
      // The proposed-only queue disappearing is insufficient proof of the
      // requested outcome. Read all statuses, including pages beyond the
      // first 200, for the exact relationship. A missing page is not success.
      const pageSize = 200;
      let target: NoteRelationship | undefined;
      for (let offset = 0; offset < 10_000; offset += pageSize) {
        const host = await inspect<NoteRelationship[]>('notes.relationships', {
          noteId: request.fromId,
          limit: pageSize,
          offset,
        });
        if (!Array.isArray(host)) throw new Error('The desktop returned an invalid relationship list.');
        target = host.find((item) => item.fromId === request.fromId && item.toId === request.toId);
        if (target || host.length < pageSize) break;
      }
      if (!target || target.status !== request.status || !Number.isSafeInteger(target.revision) || target.revision <= request.revision) {
        setRelationshipNeedsCheck(request);
        setError('The desktop has not confirmed this relationship decision. Check host state before another action.');
        return;
      }
      setRelationships((previous) => previous.filter((item) => item.fromId !== request.fromId || item.toId !== request.toId));
      setRelationshipNeedsCheck(null);
      setError('');
    } catch (caught) {
      setRelationshipNeedsCheck(request);
      setError(caught instanceof Error ? `Could not verify relationship: ${caught.message}` : 'Could not verify relationship. Check the desktop before retrying.');
    }
  };

  const reviewRelationship = async (relationship: NoteRelationship, status: 'accepted' | 'rejected') => {
    if (relationshipFlight.current || relationshipNeedsCheck) return;
    const key = `${relationship.fromId}:${relationship.toId}`;
    const request = { key, fromId: relationship.fromId, toId: relationship.toId, status, revision: relationship.revision };
    relationshipFlight.current = key;
    setReviewingRelationshipKey(key);
    setError('');
    let explicitlyRejected = false;
    try {
      const result = await sendCommand('notes.relationship_review', {
        fromId: relationship.fromId,
        toId: relationship.toId,
        status,
        expectedRevision: relationship.revision,
      });
      if (!result.accepted) {
        explicitlyRejected = true;
        throw new Error('The desktop did not accept the relationship decision. You can review it again.');
      }
      setRelationshipNeedsCheck(request);
      await checkRelationshipOnHost(request);
    } catch (caught) {
      if (!explicitlyRejected) setRelationshipNeedsCheck(request);
      const detail = caught instanceof Error ? caught.message : 'Request interrupted';
      setError(explicitlyRejected ? detail : `The decision may have reached the desktop. ${detail}. Check the relationship before sending another decision.`);
    } finally {
      relationshipFlight.current = null;
      setReviewingRelationshipKey(null);
    }
  };

  const checkDiscardOnHost = async (draftId: string) => {
    try {
      const remaining = await inspect<NoteDraftSummary[]>('notes.drafts');
      if (remaining.some((draft) => draft.id === draftId)) {
        setError('The desktop still lists this draft. Do not submit another discard until its state is confirmed.');
        setDiscardNeedsHostCheckId(draftId);
        return;
      }
      setDrafts(remaining);
      setDiscardNeedsHostCheckId(null);
      setConfirmDiscardId(null);
      setError('');
    } catch (caught) {
      setDiscardNeedsHostCheckId(draftId);
      setError(caught instanceof Error ? `Could not confirm draft removal: ${caught.message}` : 'Could not confirm draft removal. Check the desktop before trying again.');
    }
  };

  const discardDraft = async (draft: NoteDraftSummary) => {
    // Discard can permanently remove the only copy of unsaved work. Hold a
    // synchronous lock through the command and a separate host readback.
    if (discardFlight.current || discardNeedsHostCheckId) return;
    discardFlight.current = draft.id;
    setDiscardingDraftId(draft.id);
    setError('');
    let explicitlyRejected = false;
    try {
      const result = await sendCommand('notes.draft_discard', {
        draftId: draft.id,
        expectedDraftRevision: draft.draftRevision,
      });
      if (!result.accepted) {
        explicitlyRejected = true;
        throw new Error('The desktop did not accept this draft discard. The draft is still available.');
      }
      setDiscardNeedsHostCheckId(draft.id);
      await checkDiscardOnHost(draft.id);
    } catch (caught) {
      if (!explicitlyRejected) setDiscardNeedsHostCheckId(draft.id);
      const detail = caught instanceof Error ? caught.message : 'The request was interrupted';
      setError(explicitlyRejected ? detail : `The discard may have happened on the desktop. ${detail}. Check the host before retrying.`);
    } finally {
      discardFlight.current = null;
      setDiscardingDraftId(null);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <View style={styles.section}>
      <ErrorText value={error} />
      <Text style={styles.sectionLabel}>Relationship proposals</Text>
      <View style={styles.listCard}>
        {relationships.map((relationship) => (
          <View key={relationship.fromId + ':' + relationship.toId} style={styles.reviewBlock}>
            <Text style={styles.rowTitle}>
              {relationship.fromTitle || relationship.fromId} → {relationship.toTitle || relationship.toId}
            </Text>
            <Text style={styles.rowMeta}>{relationship.type.replaceAll('_', ' ')}</Text>
            <Text style={styles.reviewText}>{relationship.evidence}</Text>
            {reviewingRelationshipKey === `${relationship.fromId}:${relationship.toId}` ? (
              <Text style={styles.notice}>Checking relationship decision…</Text>
            ) : null}
            <View style={styles.actionRow}>
              <ActionButton
                label="Accept"
                primary
                disabled={busy || reviewingRelationshipKey !== null || relationshipNeedsCheck !== null}
                onPress={() => void reviewRelationship(relationship, 'accepted')}
              />
              <ActionButton
                label="Reject"
                disabled={busy || reviewingRelationshipKey !== null || relationshipNeedsCheck !== null}
                onPress={() => void reviewRelationship(relationship, 'rejected')}
              />
              {relationshipNeedsCheck?.key === `${relationship.fromId}:${relationship.toId}` ? (
                <ActionButton label="Check relationship" disabled={reviewingRelationshipKey !== null} onPress={() => void checkRelationshipOnHost(relationshipNeedsCheck)} />
              ) : null}
            </View>
          </View>
        ))}
        {!relationships.length ? <Text style={styles.empty}>No relationship proposals</Text> : null}
      </View>

      <Text style={styles.sectionLabel}>Recovery drafts</Text>
      <View style={styles.listCard}>
        {drafts.map((draft) => (
          <View key={draft.id} style={styles.reviewBlock}>
            <View style={styles.listRow}>
              <FileClock size={16} color={colors.warning} />
              <View style={styles.rowCopy}>
                <Text numberOfLines={1} style={styles.rowTitle}>{draft.title || draft.baseTitle}</Text>
                <Text style={styles.rowMeta}>{draft.state}  {formatDate(draft.updatedAt)}</Text>
              </View>
            </View>
            <View style={styles.actionRow}>
              <ActionButton label="Recover" primary disabled={busy || discardingDraftId !== null || confirmDiscardId === draft.id} onPress={() => void onRecover(draft)} />
              <ActionButton label="Discard" danger disabled={busy || discardingDraftId !== null} onPress={() => { setConfirmDiscardId(draft.id); setError(''); }} />
            </View>
            {confirmDiscardId === draft.id ? (
              <View style={styles.noticeCard}>
                <Text style={styles.notice}>Permanently discard this recovery draft? It may contain unsaved work.</Text>
                <View style={styles.actionRow}>
                  <ActionButton label="Keep draft" disabled={discardingDraftId !== null || discardNeedsHostCheckId === draft.id} onPress={() => setConfirmDiscardId(null)} />
                  {discardNeedsHostCheckId === draft.id ? (
                    <ActionButton label="Check host" disabled={discardingDraftId !== null} onPress={() => void checkDiscardOnHost(draft.id)} />
                  ) : (
                    <ActionButton label="Confirm discard" danger disabled={busy || discardingDraftId !== null} onPress={() => void discardDraft(draft)} />
                  )}
                </View>
              </View>
            ) : null}
          </View>
        ))}
        {!drafts.length ? <Text style={styles.empty}>No recovery drafts</Text> : null}
      </View>
    </View>
  );
}

function NotesSettingsView({
  inspect,
  sendCommand,
}: {
  inspect: <T>(name: string, payload?: Record<string, unknown>) => Promise<T>;
  sendCommand: (name: string, payload?: Record<string, unknown>) => Promise<{ accepted: boolean; data?: unknown }>;
}) {
  const [settings, setSettings] = useState<NotesSettings | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setSettings(await inspect<NotesSettings>('notes.settings'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load Notes settings');
    }
  }, [inspect]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const update = async (key: keyof NotesSettings, value: unknown) => {
    try {
      await sendCommand('setting.update', { settingId: 'notes.' + String(key), value });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update Notes settings');
    }
  };

  if (!settings) {
    return (
      <View style={styles.card}>
        <ErrorText value={error} />
        <Text style={styles.empty}>Loading settings…</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <ErrorText value={error} />
      <View style={styles.card}>
        <ToggleRow label="Notes enabled" value={settings.enabled} onChange={(value) => void update('enabled', value)} />
        <ToggleRow label="Auto include new notes in context" value={settings.autoIncludeInContext} onChange={(value) => void update('autoIncludeInContext', value)} />
        <ToggleRow label="Autosave" value={settings.autosaveEnabled} onChange={(value) => void update('autosaveEnabled', value)} />
        <NumberSetting label="Autosave delay (ms)" value={settings.autosaveDelayMs} onSave={(value) => void update('autosaveDelayMs', value)} />
      </View>
      <View style={styles.card}>
        <ToggleRow label="Context token limit" value={settings.maxContextTokensEnabled} onChange={(value) => void update('maxContextTokensEnabled', value)} />
        <NumberSetting label="Max context tokens" value={settings.maxContextTokens} onSave={(value) => void update('maxContextTokens', value)} />
        <ToggleRow label="Note size limit" value={settings.noteSizeLimitEnabled} onChange={(value) => void update('noteSizeLimitEnabled', value)} />
        <NumberSetting label="Max note bytes" value={settings.maxNoteBytes} onSave={(value) => void update('maxNoteBytes', value)} />
      </View>
      <View style={styles.card}>
        <ToggleRow label="Attachment size limit" value={settings.attachmentSizeLimitEnabled} onChange={(value) => void update('attachmentSizeLimitEnabled', value)} />
        <NumberSetting label="Max attachment bytes" value={settings.maxAttachmentBytes} onSave={(value) => void update('maxAttachmentBytes', value)} />
        <NumberSetting label="Max attachments per note" value={settings.maxAttachmentsPerNote} onSave={(value) => void update('maxAttachmentsPerNote', value)} />
      </View>
      <View style={styles.card}>
        <TextSetting label="Default folder" value={settings.defaultFolderPath} onSave={(value) => void update('defaultFolderPath', value)} />
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Graph physics</Text>
        <NumberSetting label="Gravity" value={settings.graphPhysics.gravity} onSave={(value) => void sendCommand('setting.update', { settingId: 'notes.graphPhysics.gravity', value }).then(load)} />
        <NumberSetting label="Link distance" value={settings.graphPhysics.linkDistance} onSave={(value) => void sendCommand('setting.update', { settingId: 'notes.graphPhysics.linkDistance', value }).then(load)} />
        <NumberSetting label="Charge strength" value={settings.graphPhysics.chargeStrength} onSave={(value) => void sendCommand('setting.update', { settingId: 'notes.graphPhysics.chargeStrength', value }).then(load)} />
      </View>
    </View>
  );
}

function TextSetting({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDraft(value), 0);
    return () => clearTimeout(timer);
  }, [value]);
  return (
    <View style={styles.numberRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={styles.inlineRow}>
        <TextInput value={draft} onChangeText={setDraft} style={[styles.input, styles.flexInput]} />
        <ActionButton label="Save" disabled={!draft.trim() || draft === value} onPress={() => onSave(draft.trim())} />
      </View>
    </View>
  );
}

function NumberSetting({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number;
  onSave: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    const timer = setTimeout(() => setDraft(String(value)), 0);
    return () => clearTimeout(timer);
  }, [value]);
  const parsed = Number(draft);
  return (
    <View style={styles.numberRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <TextInput value={draft} onChangeText={setDraft} keyboardType="numeric" style={styles.numberInput} />
      <ActionButton label="Save" disabled={!Number.isFinite(parsed) || parsed === value} onPress={() => onSave(parsed)} />
    </View>
  );
}

type SubmittedNoteUpdate = {
  noteId: string;
  expectedRevision: number;
  title: string;
  content: string;
  folderPath: string;
  tags: string[];
  pinned: boolean;
  includeInContext: boolean;
  format: 'markdown' | 'html';
};

function confirmedNoteUpdate(remote: RemoteNote, submitted: SubmittedNoteUpdate): boolean {
  return remote.id === submitted.noteId
    && Number.isSafeInteger(remote.revision)
    && remote.revision > submitted.expectedRevision
    && remote.title === submitted.title
    && remote.content === submitted.content
    && remote.folderPath === submitted.folderPath
    && Array.isArray(remote.tags)
    && remote.tags.length === submitted.tags.length
    && remote.tags.every((tag, index) => tag === submitted.tags[index])
    && remote.pinned === submitted.pinned
    && remote.includeInContext === submitted.includeInContext
    && remote.format === submitted.format;
}

function NoteEditor({
  note,
  recoveryDraft,
  allNotes,
  loading,
  setLoading,
  inspect,
  sendCommand,
  onClose,
  onUpdated,
  onOpenNote,
  error,
  setError,
}: {
  note: RemoteNote;
  recoveryDraft: NoteDraft | null;
  allNotes: RemoteNote[];
  loading: boolean;
  setLoading: (value: boolean) => void;
  inspect: <T>(name: string, payload?: Record<string, unknown>) => Promise<T>;
  sendCommand: (name: string, payload?: Record<string, unknown>) => Promise<{ accepted: boolean; data?: unknown }>;
  onClose: () => void;
  onUpdated: (note: RemoteNote, recoveryDraftNeedsReview?: boolean) => void;
  onOpenNote: (id: string) => void;
  error: string;
  setError: (value: string) => void;
}) {
  const [title, setTitle] = useState(recoveryDraft?.title ?? note.title);
  const [content, setContent] = useState(recoveryDraft?.content ?? note.content);
  const [folderPath, setFolderPath] = useState(recoveryDraft?.folderPath ?? note.folderPath);
  const [tags, setTags] = useState((recoveryDraft?.tags ?? note.tags).join(', '));
  const [pinned, setPinned] = useState(recoveryDraft?.pinned ?? note.pinned);
  const [includeInContext, setIncludeInContext] = useState(recoveryDraft?.includeInContext ?? note.includeInContext);
  const [format, setFormat] = useState<'markdown' | 'html'>((recoveryDraft?.format ?? note.format) === 'html' ? 'html' : 'markdown');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [panel, setPanel] = useState<NotePanel>('');
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pendingSave, setPendingSave] = useState<SubmittedNoteUpdate | null>(null);
  const savingRef = useRef(false);
  const checkingRef = useRef(false);
  const pendingSaveRef = useRef<SubmittedNoteUpdate | null>(null);
  const hasUnsavedChanges = !!recoveryDraft
    || title !== note.title
    || content !== note.content
    || folderPath !== note.folderPath
    || tags !== note.tags.join(', ')
    || pinned !== note.pinned
    || includeInContext !== note.includeInContext
    || format !== note.format;

  const requestClose = () => {
    if (hasUnsavedChanges || savingRef.current || pendingSaveRef.current) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const finishConfirmedSave = async (remote: RemoteNote) => {
    let recoveryDraftNeedsReview = false;
    if (recoveryDraft) {
      try {
        const result = await sendCommand('notes.draft_discard', {
          draftId: recoveryDraft.id,
          expectedDraftRevision: recoveryDraft.draftRevision,
        });
        if (!result.accepted) {
          recoveryDraftNeedsReview = true;
        } else {
          const remaining = await inspect<NoteDraftSummary[]>('notes.drafts');
          recoveryDraftNeedsReview = !Array.isArray(remaining)
            || remaining.some((draft) => draft.id === recoveryDraft.id);
        }
      } catch {
        recoveryDraftNeedsReview = true;
      }
    }
    onUpdated(remote, recoveryDraftNeedsReview);
    setError(recoveryDraftNeedsReview
      ? 'The note was saved, but the desktop has not confirmed removal of its recovery draft. Check the recovery list before recovering or creating another note.'
      : '');
  };

  const confirmPendingSave = async (submitted: SubmittedNoteUpdate) => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setLoading(true);
    try {
      const remote = await inspect<RemoteNote>('notes.read', { noteId: submitted.noteId });
      if (!confirmedNoteUpdate(remote, submitted)) {
        setError('The desktop has not confirmed this save. Check its current note before retrying.');
        return;
      }
      pendingSaveRef.current = null;
      setPendingSave(null);
      await finishConfirmedSave(remote);
    } catch {
      setError('The desktop acknowledged the save, but verification failed. Check the host before retrying.');
    } finally {
      checkingRef.current = false;
      setLoading(false);
    }
  };

  const save = async () => {
    if (savingRef.current || pendingSaveRef.current) return;
    savingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const submitted: SubmittedNoteUpdate = {
        noteId: note.id,
        expectedRevision: note.revision,
        title: title.trim() || 'Untitled note',
        content,
        folderPath: folderPath.trim() || '/',
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        pinned,
        includeInContext,
        format,
      };
      const result = await sendCommand('note.update', submitted);
      if (!result.accepted) throw new Error('The desktop did not accept this save. Your edits are still here.');
      const updated = result.data as RemoteNote | undefined;
      if (updated && confirmedNoteUpdate(updated, submitted)) {
        await finishConfirmedSave(updated);
      } else {
        // A missing, stale, or mismatched reply does not prove the desktop
        // persisted this exact edit. Keep the draft and verify the host before
        // allowing another write or closing the editor as successfully saved.
        pendingSaveRef.current = submitted;
        setPendingSave(submitted);
        await confirmPendingSave(submitted);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save note');
    } finally {
      savingRef.current = false;
      setLoading(false);
    }
  };

  if (panel === 'history') {
    return <RevisionPanel note={note} inspect={inspect} sendCommand={sendCommand} onClose={() => setPanel('')} onUpdated={onUpdated} />;
  }
  if (panel === 'properties') {
    return <PropertiesPanel note={note} inspect={inspect} sendCommand={sendCommand} onClose={() => setPanel('')} onUpdated={onUpdated} />;
  }
  if (panel === 'appearances') {
    return <AppearancesPanel note={note} inspect={inspect} onClose={() => setPanel('')} onOpenNote={onOpenNote} />;
  }
  if (panel === 'relationship') {
    return <RelationshipPanel note={note} allNotes={allNotes} sendCommand={sendCommand} onClose={() => setPanel('')} />;
  }
  if (panel === 'attachments') {
    return <AttachmentsPanel note={note} inspect={inspect} sendCommand={sendCommand} onClose={() => setPanel('')} onUpdated={onUpdated} />;
  }

  return (
    <View style={styles.flex}>
      <View style={styles.editorHeader}>
        <Pressable onPress={requestClose} accessibilityRole="button" accessibilityLabel="Back to notes" style={({ pressed }) => [styles.backButtonRow, pressed && styles.pressed]}>
          <ChevronLeft size={17} color={colors.textMuted} />
          <Text style={styles.editorHeaderText}>Notes</Text>
        </Pressable>
        <ActionButton label="Save" icon={Save} primary disabled={!!pendingSave} loading={loading} onPress={() => void save()} />
      </View>
      <ScrollView contentContainerStyle={styles.editorPage} keyboardShouldPersistTaps="handled">
        {confirmDiscard ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Unsaved note changes</Text>
            <Text style={styles.notice}>
              {loading
                ? 'A Save may still finish on the desktop. Leaving will discard changes not included in that request.'
                : 'Leaving will discard your unsaved edits.'}
            </Text>
            <View style={styles.noticeActions}>
              <ActionButton label="Keep editing" primary onPress={() => setConfirmDiscard(false)} />
              <ActionButton label="Discard edits" danger onPress={onClose} />
            </View>
          </View>
        ) : null}
        {pendingSave ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Save awaiting confirmation</Text>
            <Text style={styles.notice}>
              The desktop acknowledged the update, but its saved revision has not been verified. Another save could repeat a change.
            </Text>
            <View style={styles.noticeActions}>
              <ActionButton label="Check host" loading={loading} onPress={() => void confirmPendingSave(pendingSave)} />
              <ActionButton
                label="I reviewed host — unlock Save"
                danger
                onPress={() => {
                  if (checkingRef.current) return;
                  pendingSaveRef.current = null;
                  setPendingSave(null);
                  setError('');
                }}
              />
            </View>
          </View>
        ) : null}
        {recoveryDraft ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Recovered draft</Text>
            <Text style={styles.notice}>
              {recoveryDraft.state === 'conflict'
                ? 'This draft was based on an older revision. Review it before pressing Save.'
                : 'This backed-up draft is open for review. The host is unchanged until you press Save.'}
            </Text>
          </View>
        ) : null}
        <TextInput value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={colors.textMuted} style={styles.titleInput} />
        <TextInput
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
          placeholder="Write a note"
          placeholderTextColor={colors.textMuted}
          style={styles.editorInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Note options"
          accessibilityState={{ expanded: optionsOpen }}
          onPress={() => setOptionsOpen((value) => !value)}
          style={({ pressed }) => [styles.disclosureRow, pressed && styles.pressed]}
        >
          <Text style={styles.disclosureText}>Options</Text>
          {optionsOpen ? <ChevronDown size={15} color={colors.textMuted} /> : <ChevronRight size={15} color={colors.textMuted} />}
        </Pressable>
        {optionsOpen ? (
          <View style={styles.optionsCard}>
            <TextInput value={folderPath} onChangeText={setFolderPath} placeholder="/folder" placeholderTextColor={colors.textMuted} style={styles.input} />
            <TextInput value={tags} onChangeText={setTags} placeholder="Tags separated by commas" placeholderTextColor={colors.textMuted} style={styles.input} />
            <ChoiceRow value={format} onChange={setFormat} options={[{ value: 'markdown', label: 'Markdown' }, { value: 'html', label: 'HTML' }]} />
            <ToggleRow label="Pinned" value={pinned} onChange={setPinned} />
            <ToggleRow label="In agent context" value={includeInContext} onChange={setIncludeInContext} />
            <ToolRow label="History" icon={FileClock} onPress={() => setPanel('history')} />
            {format === 'markdown' ? <ToolRow label="Properties" icon={Settings2} onPress={() => setPanel('properties')} /> : null}
            <ToolRow label="Where this note appears" icon={Network} onPress={() => setPanel('appearances')} />
            <ToolRow label="Add relationship" icon={GitFork} onPress={() => setPanel('relationship')} />
            <ToolRow label="Attachments" detail={`${note.attachments?.length ?? 0} file${note.attachments?.length === 1 ? '' : 's'}`} icon={Paperclip} onPress={() => setPanel('attachments')} />
            <ToolRow
              label="Export note"
              icon={FileDown}
              onPress={() => {
                void inspect<string>('note.export', { noteId: note.id })
                  .then((body) => {
                    const extension = format === 'html' ? 'html' : 'md';
                    const base = (title.trim() || 'note').replace(/[^A-Za-z0-9._-]+/g, '-');
                    return shareTextFile(`${base}.${extension}`, body, format === 'html' ? 'text/html' : 'text/markdown');
                  })
                  .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not export note'));
              }}
            />
            <ActionButton
              label={deleteArmed ? 'Tap again to move to trash' : 'Move to trash'}
              icon={Trash2}
              danger
              onPress={() => {
                if (!deleteArmed) {
                  setDeleteArmed(true);
                  return;
                }
                void sendCommand('note.delete', {
                  noteId: note.id,
                  expectedRevision: note.revision,
                }).then(onClose).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not move note to trash'));
              }}
            />
          </View>
        ) : null}
        <ErrorText value={error} />
      </ScrollView>
    </View>
  );
}

function RevisionPanel({
  note,
  inspect,
  sendCommand,
  onClose,
  onUpdated,
}: {
  note: RemoteNote;
  inspect: <T>(name: string, payload?: Record<string, unknown>) => Promise<T>;
  sendCommand: (name: string, payload?: Record<string, unknown>) => Promise<{ accepted: boolean; data?: unknown }>;
  onClose: () => void;
  onUpdated: (note: RemoteNote) => void;
}) {
  const [revisions, setRevisions] = useState<NoteRevisionSummary[]>([]);
  const [preview, setPreview] = useState<RemoteNote | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      void inspect<NoteRevisionSummary[]>('notes.revisions', { noteId: note.id })
        .then(setRevisions)
        .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load history'));
    }, 0);
    return () => clearTimeout(timer);
  }, [inspect, note.id]);

  return (
    <ScrollView contentContainerStyle={styles.editorPage}>
      <PanelHeader title="History" onClose={onClose} />
      <ErrorText value={error} />
      <View style={styles.listCard}>
        {revisions.slice().reverse().map((revision) => (
          <View key={revision.revision} style={styles.listRow}>
            <FileClock size={16} color={colors.textMuted} />
            <Pressable
              style={styles.rowCopy}
              onPress={() =>
                void inspect<RemoteNote>('notes.revision', {
                  noteId: note.id,
                  revision: revision.revision,
                }).then(setPreview).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load revision'))
              }
            >
              <Text style={styles.rowTitle}>Revision {revision.revision}</Text>
              <Text style={styles.rowMeta}>{formatDate(revision.updatedAt ?? revision.createdAt)}</Text>
            </Pressable>
            <ActionButton
              label="Restore"
              disabled={revision.revision === note.revision}
              onPress={() =>
                void sendCommand('note.restore_revision', {
                  noteId: note.id,
                  revision: revision.revision,
                  expectedRevision: note.revision,
                }).then((response) => {
                  const updated = response.data as RemoteNote | undefined;
                  if (updated) onUpdated(updated);
                  onClose();
                }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not restore revision'))
              }
            />
          </View>
        ))}
      </View>
      {preview ? (
        <View style={styles.card}>
          <Text style={styles.rowTitle}>{preview.title}</Text>
          <Text selectable style={styles.previewText}>{preview.content}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function PropertiesPanel({
  note,
  inspect,
  sendCommand,
  onClose,
  onUpdated,
}: {
  note: RemoteNote;
  inspect: <T>(name: string, payload?: Record<string, unknown>) => Promise<T>;
  sendCommand: (name: string, payload?: Record<string, unknown>) => Promise<{ accepted: boolean; data?: unknown }>;
  onClose: () => void;
  onUpdated: (note: RemoteNote) => void;
}) {
  const [snapshot, setSnapshot] = useState<NotePropertiesSnapshot | null>(null);
  const [schemas, setSchemas] = useState<NotePropertySchema[]>([]);
  const [key, setKey] = useState('');
  const [type, setType] = useState<NotePropertySchema['kind']>('text');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [properties, nextSchemas] = await Promise.all([
        inspect<NotePropertiesSnapshot>('notes.properties', { noteId: note.id }),
        inspect<NotePropertySchema[]>('notes.property_schemas'),
      ]);
      setSnapshot(properties);
      setSchemas(nextSchemas);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load properties');
    }
  }, [inspect, note.id]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const patch = async (patches: Record<string, unknown>[]) => {
    try {
      await sendCommand('notes.properties_patch', {
        noteId: note.id,
        expectedRevision: snapshot?.revision ?? note.revision,
        patches,
      });
      const updated = await inspect<RemoteNote>('notes.read', { noteId: note.id });
      onUpdated(updated);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update properties');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.editorPage} keyboardShouldPersistTaps="handled">
      <PanelHeader title="Properties" onClose={onClose} />
      <ErrorText value={error} />
      <ActionButton
        label="Reindex project properties"
        onPress={() => {
          void sendCommand('notes.properties_reindex')
            .then(load)
            .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not reindex properties'));
        }}
      />
      <View style={styles.listCard}>
        {(snapshot?.properties ?? []).map((property) => (
          <PropertyRow
            key={property.key}
            property={property}
            onSave={(nextValue) => void patch([{
              op: 'set',
              key: property.key,
              type: property.type,
              value: parsePropertyValue(property.type, nextValue),
            }])}
            onRemove={() => void patch([{ op: 'remove', key: property.key }])}
          />
        ))}
        {snapshot && !snapshot.properties.length ? <Text style={styles.empty}>No properties</Text> : null}
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Add property</Text>
        <TextInput value={key} onChangeText={setKey} placeholder="Property name" placeholderTextColor={colors.textMuted} style={styles.input} />
        {schemas.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
            {schemas.map((schema) => (
              <Pressable
                key={schema.key}
                onPress={() => {
                  setKey(schema.key);
                  setType(schema.kind);
                }}
                style={({ pressed }) => [styles.choice, key === schema.key && styles.choiceActive, pressed && styles.pressed]}
              >
                <Text style={[styles.choiceText, key === schema.key && styles.choiceTextActive]}>{schema.displayName}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <ChoiceRow
          value={type}
          onChange={setType}
          options={[
            { value: 'text', label: 'Text' },
            { value: 'number', label: 'Number' },
            { value: 'checkbox', label: 'Checkbox' },
            { value: 'date', label: 'Date' },
            { value: 'datetime', label: 'Date/time' },
            { value: 'list', label: 'List' },
            { value: 'tags', label: 'Tags' },
          ]}
        />
        <TextInput value={value} onChangeText={setValue} placeholder="Value" placeholderTextColor={colors.textMuted} style={styles.input} />
        <ActionButton
          label="Add"
          primary
          disabled={!key.trim()}
          onPress={() => {
            void patch([{
              op: 'set',
              key: key.trim(),
              type,
              value: parsePropertyValue(type, value),
            }]);
            setKey('');
            setValue('');
          }}
        />
      </View>
    </ScrollView>
  );
}

function PropertyRow({
  property,
  onSave,
  onRemove,
}: {
  property: NotePropertiesSnapshot['properties'][number];
  onSave: (value: string) => void;
  onRemove: () => void;
}) {
  const initial = propertyText(property.value);
  const [draft, setDraft] = useState(initial);
  return (
    <View style={styles.propertyRow}>
      <View style={styles.propertyHeader}>
        <Text style={styles.rowTitle}>{property.key}</Text>
        <Text style={styles.rowMeta}>{property.type}</Text>
      </View>
      <View style={styles.inlineRow}>
        <TextInput value={draft} onChangeText={setDraft} style={[styles.input, styles.flexInput]} />
        <ActionButton label="Save" disabled={draft === initial} onPress={() => onSave(draft)} />
        <Pressable accessibilityLabel={'Remove ' + property.key} onPress={onRemove} style={styles.smallRound}>
          <X size={14} color={colors.error} />
        </Pressable>
      </View>
    </View>
  );
}

function AppearancesPanel({
  note,
  inspect,
  onClose,
  onOpenNote,
}: {
  note: RemoteNote;
  inspect: <T>(name: string, payload?: Record<string, unknown>) => Promise<T>;
  onClose: () => void;
  onOpenNote: (id: string) => void;
}) {
  const [data, setData] = useState<NoteAppearances | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      void inspect<NoteAppearances>('notes.appearances', { noteId: note.id })
        .then(setData)
        .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load appearances'));
    }, 0);
    return () => clearTimeout(timer);
  }, [inspect, note.id]);

  return (
    <ScrollView contentContainerStyle={styles.editorPage}>
      <PanelHeader title="Where this note appears" onClose={onClose} />
      <ErrorText value={error} />
      {data ? (
        <>
          <View style={styles.statGrid}>
            <Stat value={data.counts.backlinks} label="Backlinks" />
            <Stat value={data.counts.relationships} label="Relationships" />
            <Stat value={data.counts.canvases} label="Canvas cards" />
            <Stat value={data.counts.bases} label="Bases" />
          </View>
          <View style={styles.listCard}>
            {data.relationships.map((relationship) => (
              <Pressable
                key={relationship.fromId + ':' + relationship.toId}
                onPress={() => onOpenNote(relationship.counterpartyId)}
                style={styles.listRow}
              >
                <Network size={16} color={colors.accent} />
                <View style={styles.rowCopy}>
                  <Text numberOfLines={1} style={styles.rowTitle}>{relationship.counterpartyTitle}</Text>
                  <Text style={styles.rowMeta}>{relationship.type.replaceAll('_', ' ')}  {relationship.status}</Text>
                </View>
                <ChevronRight size={15} color={colors.textMuted} />
              </Pressable>
            ))}
            {data.bases.map((base) => (
              <View key={base.baseId} style={styles.listRow}>
                <Table2 size={16} color={colors.textMuted} />
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{base.name}</Text>
                  <Text style={styles.rowMeta}>Base</Text>
                </View>
              </View>
            ))}
            {data.canvases.map((canvas) => (
              <View key={canvas.cardId} style={styles.listRow}>
                <FileText size={16} color={colors.textMuted} />
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{canvas.title}</Text>
                  <Text numberOfLines={1} style={styles.rowMeta}>{canvas.cardText}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AttachmentsPanel({
  note,
  inspect,
  sendCommand,
  onClose,
  onUpdated,
}: {
  note: RemoteNote;
  inspect: <T>(name: string, payload?: Record<string, unknown>) => Promise<T>;
  sendCommand: (name: string, payload?: Record<string, unknown>) => Promise<{ accepted: boolean; data?: unknown }>;
  onClose: () => void;
  onUpdated: (note: RemoteNote) => void;
}) {
  const [busy, setBusy] = useState('');
  const [removeArmed, setRemoveArmed] = useState('');
  const [error, setError] = useState('');

  const reload = async () => {
    const updated = await inspect<RemoteNote>('notes.read', { noteId: note.id });
    onUpdated(updated);
  };

  const upload = async () => {
    setBusy('upload');
    setError('');
    try {
      const file = (await pickFiles({ multiple: false }))[0];
      if (!file) return;
      await sendCommand('note.attachment_add', {
        noteId: note.id,
        data: file.data,
        name: file.name,
        mimeType: file.mimeType,
      });
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not attach file');
    } finally {
      setBusy('');
    }
  };

  const download = async (attachmentId: string) => {
    setBusy(`download:${attachmentId}`);
    setError('');
    try {
      const file = await inspect<RemoteBinaryFile>('note.attachment_download', { attachmentId });
      await shareBytesFile(file.filename, file.bytes, file.mimeType);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open attachment');
    } finally {
      setBusy('');
    }
  };

  const remove = async (attachmentId: string) => {
    if (removeArmed !== attachmentId) {
      setRemoveArmed(attachmentId);
      return;
    }
    setBusy(`remove:${attachmentId}`);
    setError('');
    try {
      await sendCommand('note.attachment_remove', { noteId: note.id, attachmentId });
      setRemoveArmed('');
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove attachment');
    } finally {
      setBusy('');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.editorPage} keyboardShouldPersistTaps="handled">
      <PanelHeader title="Attachments" onClose={onClose} />
      <ErrorText value={error} />
      <ActionButton label={busy === 'upload' ? 'Adding…' : 'Add attachment'} icon={Paperclip} primary disabled={busy === 'upload'} onPress={() => void upload()} />
      <View style={styles.listCard}>
        {(note.attachments ?? []).map((attachment) => (
          <View key={attachment.id} style={styles.listRow}>
            <Paperclip size={16} color={colors.textMuted} />
            <View style={styles.rowCopy}>
              <Text numberOfLines={1} style={styles.rowTitle}>{attachment.filename}</Text>
              <Text style={styles.rowMeta}>{attachment.mimeType}  {formatBytes(attachment.size)}</Text>
            </View>
            <ActionButton
              label="Open"
              disabled={Boolean(busy)}
              onPress={() => void download(attachment.id)}
            />
            <ActionButton
              label={removeArmed === attachment.id ? 'Remove?' : 'Remove'}
              danger
              disabled={Boolean(busy)}
              onPress={() => void remove(attachment.id)}
            />
          </View>
        ))}
        {!note.attachments?.length ? <Text style={styles.empty}>No attachments</Text> : null}
      </View>
    </ScrollView>
  );
}

function RelationshipPanel({
  note,
  allNotes,
  sendCommand,
  onClose,
}: {
  note: RemoteNote;
  allNotes: RemoteNote[];
  sendCommand: (name: string, payload?: Record<string, unknown>) => Promise<{ accepted: boolean; data?: unknown }>;
  onClose: () => void;
}) {
  const candidates = allNotes.filter((candidate) => candidate.id !== note.id);
  const [targetId, setTargetId] = useState(candidates[0]?.id ?? '');
  const [type, setType] = useState<NoteRelationship['type']>('related_to');
  const [evidence, setEvidence] = useState('');
  const [error, setError] = useState('');
  const target = candidates.find((candidate) => candidate.id === targetId);

  return (
    <ScrollView contentContainerStyle={styles.editorPage} keyboardShouldPersistTaps="handled">
      <PanelHeader title="Add relationship" onClose={onClose} />
      <Text style={styles.sectionLabel}>Target note</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
        {candidates.map((candidate) => (
          <Pressable
            key={candidate.id}
            onPress={() => setTargetId(candidate.id)}
            style={({ pressed }) => [styles.choice, targetId === candidate.id && styles.choiceActive, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={[styles.choiceText, targetId === candidate.id && styles.choiceTextActive]}>
              {candidate.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <ChoiceRow
        value={type}
        onChange={setType}
        options={[
          { value: 'related_to', label: 'Related' },
          { value: 'supports', label: 'Supports' },
          { value: 'contradicts', label: 'Contradicts' },
          { value: 'depends_on', label: 'Depends on' },
          { value: 'supersedes', label: 'Supersedes' },
        ]}
      />
      <TextInput
        value={evidence}
        onChangeText={setEvidence}
        multiline
        textAlignVertical="top"
        placeholder="Why are these notes related?"
        placeholderTextColor={colors.textMuted}
        style={styles.evidenceInput}
      />
      <ErrorText value={error} />
      <ActionButton
        label="Add relationship"
        primary
        disabled={!target || !evidence.trim()}
        onPress={() => {
          if (!target) return;
          void sendCommand('notes.relationship_create', {
            fromId: note.id,
            toId: target.id,
            type,
            evidence: evidence.trim(),
            expectedSourceRevision: note.revision,
            expectedTargetRevision: target.revision,
          }).then(onClose).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not add relationship'));
        }}
      />
    </ScrollView>
  );
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.panelHeader}>
      <Pressable onPress={onClose} style={styles.backButtonRow}>
        <ChevronLeft size={17} color={colors.textMuted} />
        <Text style={styles.editorHeaderText}>{title}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minHeight: 0 },
  page: {
    padding: spacing.md,
    paddingBottom: spacing.huge,
    gap: spacing.sm,
  },
  section: { gap: spacing.sm },
  toolbar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: { flex: 1, minWidth: 0 },
  input: {
    minHeight: 42,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    color: colors.textPrimary,
    fontSize: typography.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
  },
  menuCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  toolRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  toolIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  rowMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: typography.xs,
  },
  listCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  listRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  empty: {
    padding: spacing.xl,
    color: colors.textMuted,
    textAlign: 'center',
    fontSize: typography.sm,
  },
  error: {
    color: colors.error,
    fontSize: typography.xs,
    lineHeight: 17,
  },
  notice: {
    color: colors.textMuted,
    fontSize: typography.xs,
    lineHeight: 17,
  },
  noticeCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    padding: spacing.sm,
    gap: 4,
  },
  noticeTitle: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  noticeActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  backRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  backText: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  modeTitle: {
    marginLeft: 'auto',
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  choiceRow: { gap: spacing.xs },
  choice: {
    minHeight: 44,
    maxWidth: 180,
    borderRadius: 22,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceActive: { backgroundColor: colors.accentSoft },
  choiceText: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  choiceTextActive: { color: colors.accent },
  card: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  disclosureRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  disclosureText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  definitionInput: {
    minHeight: 220,
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    color: colors.textPrimary,
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
    padding: spacing.sm,
    textAlignVertical: 'top',
  },
  reviewBlock: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  reviewText: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    lineHeight: 17,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '800',
  },
  toggleRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggleLabel: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  switchTrack: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface4,
    padding: 3,
  },
  switchTrackActive: { backgroundColor: colors.accent },
  switchThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.textMuted,
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
    backgroundColor: colors.onAccent,
  },
  numberRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  numberInput: {
    width: 94,
    minHeight: 36,
    borderRadius: radii.md,
    backgroundColor: colors.surface3,
    color: colors.textPrimary,
    textAlign: 'right',
    paddingHorizontal: spacing.xs,
  },
  editorHeader: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backButtonRow: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  editorHeaderText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  editorPage: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.huge,
    gap: spacing.sm,
  },
  titleInput: {
    minHeight: 50,
    color: colors.textPrimary,
    fontSize: typography.xl,
    fontWeight: '800',
    paddingHorizontal: 2,
  },
  editorInput: {
    minHeight: 280,
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    color: colors.textPrimary,
    fontSize: typography.base,
    lineHeight: 22,
    padding: spacing.md,
  },
  optionsCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  panelHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewText: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    lineHeight: 18,
  },
  propertyRow: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  propertyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  flexInput: { flex: 1, minWidth: 0 },
  smallRound: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  stat: {
    minWidth: 90,
    flexGrow: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    padding: spacing.sm,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: typography.lg,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  evidenceInput: {
    minHeight: 130,
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    color: colors.textPrimary,
    fontSize: typography.sm,
    lineHeight: 20,
    padding: spacing.sm,
  },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.66 },
});
