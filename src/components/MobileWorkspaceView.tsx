import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AppState,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  KeyboardChatScrollView,
  KeyboardStickyView,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioRecorder,
} from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import { safeDeleteItem, safeGetItem, safeSetItem } from '../control/safeSecureStore';
import {
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ClipboardPaste,
  Copy,
  EyeOff,
  FilePlus2,
  FileText,
  Folder,
  Image as ImageIcon,
  ImageOff,
  Mic,
  Plus,
  RotateCcw,
  ScanSearch,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Square,
  SlidersHorizontal,
  Trash2,
  Volume2,
  X,
} from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { machineDisplayName } from '../control/connectionPresentation';
import { useAttentionRedirect } from '../control/useAttentionRedirect';
import {
  assertComposerAttachments, composerDestinationKey, MAX_COMPOSER_ATTACHMENT_BYTES,
  type ComposerAttempt, type ComposerLease, type SavedComposerDraft,
} from '../control/composerDrafts';
import { pickChatAttachments } from '../native/mobileFiles';
import { messagePlayback, type MessagePlaybackOperation, type MessagePlaybackState } from '../native/messagePlayback';
import { breakpoints, colors, radii, spacing, type as typography } from '../theme/tokens';
import type {
  Agent,
  FeedEntry,
  MessageAttachment,
  ModelCatalogEntry,
  WorkspaceFilesInspection,
} from '../types/control';
import { mergeLiveManagerFeed } from '../control/liveManagerFeed';
import { AgentGlyph, StatusDot } from './ui';
import { MobileContextPopover } from './MobileContextPopover';
import { MobileContextRing } from './MobileSurface';

const IMAGE_INPUT_MODE_KEY = 'koryphaios.mobile.image-input-mode.v1';
const TRUSTED_IMAGE_MODELS_KEY = 'koryphaios.mobile.trusted-image-models.v1';

const PROMPT_TEMPLATES = [
  {
    id: 'prd',
    label: 'PRD',
    content: [
      'Build Spec',
      '- Problem:',
      '- Target user:',
      '- Success metrics:',
      '',
      'Requirements',
      '- Must have:',
      '- Nice to have:',
      '- Out of scope:',
      '',
      'Execution plan',
      '- Milestone 1:',
      '- Milestone 2:',
      '- Milestone 3:',
      '',
      'Open questions',
      '- ',
    ].join('\n'),
  },
  {
    id: 'bugfix',
    label: 'Bugfix',
    content: [
      'Bug Report',
      '- Expected:',
      '- Actual:',
      '- Repro steps:',
      '- Environment:',
      '',
      'Debug plan',
      '- Suspected root cause:',
      '- Verification steps:',
      '- Regression risks:',
      '',
      'Definition of done',
      '- ',
    ].join('\n'),
  },
  {
    id: 'refactor',
    label: 'Refactor',
    content: [
      'Refactor Goal',
      '- Why now:',
      '- Scope:',
      '- Constraints:',
      '',
      'Current pain points',
      '- ',
      '',
      'Refactor approach',
      '- Architecture changes:',
      '- Migration steps:',
      '- Test strategy:',
      '',
      'Acceptance criteria',
      '- ',
    ].join('\n'),
  },
  {
    id: 'ship',
    label: 'Ship checklist',
    content: [
      'Ship Checklist',
      '- Feature complete',
      '- Tests passing',
      '- Edge cases reviewed',
      '- Docs updated',
      '- Monitoring/alerts defined',
      '- Rollback plan prepared',
      '',
      'Release notes',
      '- ',
    ].join('\n'),
  },
] as const;

type ImageInputMode = 'reject' | 'omit' | 'allow';

type MessageActionOrigin = {
  id: number;
  entry: FeedEntry;
  lease: ComposerLease;
  sendCommand: ReturnType<typeof useControl>['sendCommand'];
  reasoningLevel: string;
};

type DictationOrigin = {
  lease: ComposerLease;
  sendCommand: ReturnType<typeof useControl>['sendCommand'];
  recorder: AudioRecorder | null;
  phase: 'permission' | 'preparing' | 'recording' | 'stopping' | 'transcribing';
  cancelled: boolean;
  audioModeEnabled: boolean;
};

// The audio session is device-wide. A remounted screen must wait for an older
// recorder's asynchronous teardown before it can change the session mode.
let microphoneOwner: DictationOrigin | null = null;

type PendingImageSend = {
  attempt: ComposerAttempt;
  body: string;
  attachments: MessageAttachment[];
  model: string;
  modelLabel: string;
  modelSupportsVision: boolean;
  imageCount: number;
  reasoningLevel: string;
  fastMode: boolean;
};

type PendingRemoteAgentSend = {
  draft: Pick<PendingImageSend, 'attempt' | 'body' | 'attachments' | 'model' | 'reasoningLevel' | 'fastMode'>;
  imageInputMode: ImageInputMode;
  provider: string;
  hostName: string;
};

async function readImageInputPreference(model: string): Promise<ImageInputMode> {
  try {
    const trustedRaw = await safeGetItem(TRUSTED_IMAGE_MODELS_KEY);
    if (trustedRaw) {
      const trusted = JSON.parse(trustedRaw);
      if (Array.isArray(trusted) && trusted.includes(model)) return 'allow';
    }
    const mode = await safeGetItem(IMAGE_INPUT_MODE_KEY);
    return mode === 'omit' ? 'omit' : 'reject';
  } catch {
    return 'reject';
  }
}

async function rememberImageInputPreference(
  mode: Exclude<ImageInputMode, 'reject'>,
  model: string,
) {
  if (mode === 'omit') {
    await safeSetItem(IMAGE_INPUT_MODE_KEY, 'omit');
    return;
  }
  const trustedRaw = await safeGetItem(TRUSTED_IMAGE_MODELS_KEY);
  let trusted: string[] = [];
  try {
    const parsed = trustedRaw ? JSON.parse(trustedRaw) : [];
    trusted = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    trusted = [];
  }
  if (!trusted.includes(model)) trusted.push(model);
  await safeSetItem(TRUSTED_IMAGE_MODELS_KEY, JSON.stringify(trusted));
}

async function resetImageOmitPreference() {
  await safeDeleteItem(IMAGE_INPUT_MODE_KEY);
}

function managerAgent(agents: Agent[]): Agent | undefined {
  return (
    agents.find((agent) => agent.id === 'kory-manager') ??
    agents.find((agent) => agent.id === 'manager') ??
    agents.find((agent) => agent.role.toLowerCase() === 'manager') ??
    agents[0]
  );
}

function inferModelSelection(manager: Agent | undefined, models: ModelCatalogEntry[]): string {
  if (!manager) return '';
  const targetModel = manager.model.trim().toLowerCase();
  const targetProvider = manager.provider.trim().toLowerCase();
  const candidates = models.filter((model) =>
    [model.id, model.name, model.selection].some((value) => value.trim().toLowerCase() === targetModel),
  );

  return (
    candidates.find((model) =>
      [model.provider, model.providerLabel].some(
        (value) => value.trim().toLowerCase() === targetProvider,
      ),
    )?.selection ??
    candidates[0]?.selection ??
    ''
  );
}

function ManagerMessage({
  entry,
  manager,
  onOpenActions,
}: {
  entry: FeedEntry;
  manager?: Agent;
  onOpenActions: (entry: FeedEntry) => void;
}) {
  if (entry.userHidden) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show hidden message"
        onPress={() => onOpenActions(entry)}
        style={({ pressed }) => [styles.hiddenMessageRow, pressed && styles.messagePressed]}
      >
        <EyeOff size={14} color={colors.textMuted} />
        <Text numberOfLines={1} style={styles.hiddenMessageText}>Hidden message</Text>
      </Pressable>
    );
  }

  if (entry.kind === 'user') {
    return (
      <Pressable
        accessibilityHint="Long press for message actions"
        delayLongPress={250}
        onLongPress={() => onOpenActions(entry)}
        style={({ pressed }) => [styles.userMessageRow, pressed && styles.messagePressed]}
      >
        <View style={styles.userBubble}>
          <Text style={styles.messageText}>{entry.body}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityHint={entry.isStreaming ? 'Live desktop response' : 'Long press for response actions'}
      delayLongPress={250}
      onLongPress={entry.isStreaming ? undefined : () => onOpenActions(entry)}
      style={({ pressed }) => [styles.managerMessage, pressed && styles.messagePressed]}
    >
      {manager ? <AgentGlyph agent={manager} size={26} /> : null}
      <View style={styles.managerMessageCopy}>
        <Text style={styles.messageText}>{entry.body}</Text>
      </View>
    </Pressable>
  );
}

function exactMessageModel(entry: FeedEntry): string {
  if (!entry.model) return '';
  if (!entry.provider || entry.model.startsWith(`${entry.provider}:`)) return entry.model;
  return `${entry.provider}:${entry.model}`;
}

function ComposerMenu({
  visible,
  recording,
  onClose,
  onFiles,
  onPasteImage,
  onReferences,
  onVoice,
  onTemplate,
  onClearView,
}: {
  visible: boolean;
  recording: boolean;
  onClose: () => void;
  onFiles: () => void;
  onPasteImage: () => void;
  onReferences: () => void;
  onVoice: () => void;
  onTemplate: (content: string) => void;
  onClearView?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<'root' | 'templates'>('root');
  const close = () => {
    setPage('root');
    onClose();
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={close}>
      <View style={styles.composerMenuOverlay}>
        <Pressable accessibilityLabel="Close composer menu" onPress={close} style={StyleSheet.absoluteFill} />
        <View style={[styles.composerMenu, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          {page === 'templates' ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={() => setPage('root')}
                style={({ pressed }) => [styles.composerMenuRow, pressed && styles.pressed]}
              >
                <ChevronLeft size={18} color={colors.textSecondary} />
                <Text style={styles.composerMenuText}>Templates</Text>
              </Pressable>
              {PROMPT_TEMPLATES.map((template) => (
                <Pressable
                  key={template.id}
                  accessibilityRole="button"
                  accessibilityLabel={'Insert ' + template.label + ' template'}
                  onPress={() => {
                    setPage('root');
                    onTemplate(template.content);
                  }}
                  style={({ pressed }) => [styles.composerMenuRow, pressed && styles.pressed]}
                >
                  <FileText size={18} color={colors.accent} />
                  <Text style={styles.composerMenuText}>{template.label}</Text>
                </Pressable>
              ))}
            </>
          ) : (
            <>
              <Pressable
                onPress={onFiles}
                style={({ pressed }) => [styles.composerMenuRow, pressed && styles.pressed]}
              >
                <FilePlus2 size={18} color={colors.accent} />
                <Text style={styles.composerMenuText}>Add files or images</Text>
              </Pressable>
              <Pressable
                onPress={onPasteImage}
                style={({ pressed }) => [styles.composerMenuRow, pressed && styles.pressed]}
              >
                <ClipboardPaste size={18} color={colors.accent} />
                <Text style={styles.composerMenuText}>Paste image</Text>
              </Pressable>
              <Pressable
                onPress={onReferences}
                style={({ pressed }) => [styles.composerMenuRow, pressed && styles.pressed]}
              >
                <Folder size={18} color={colors.accent} />
                <Text style={styles.composerMenuText}>Reference workspace</Text>
              </Pressable>
              <Pressable
                onPress={() => setPage('templates')}
                style={({ pressed }) => [styles.composerMenuRow, pressed && styles.pressed]}
              >
                <FileText size={18} color={colors.accent} />
                <Text style={styles.composerMenuText}>Prompt template</Text>
              </Pressable>
              <Pressable
                onPress={onVoice}
                style={({ pressed }) => [styles.composerMenuRow, pressed && styles.pressed]}
              >
                <Mic size={18} color={recording ? colors.error : colors.accent} />
                <Text style={styles.composerMenuText}>{recording ? 'Stop dictation' : 'Dictate'}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onClose();
                  router.push('/controls');
                }}
                style={({ pressed }) => [styles.composerMenuRow, pressed && styles.pressed]}
              >
                <Settings size={18} color={colors.accent} />
                <Text style={styles.composerMenuText}>All controls</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onClose();
                  router.push('/control/session');
                }}
                style={({ pressed }) => [styles.composerMenuRow, pressed && styles.pressed]}
              >
                <SlidersHorizontal size={18} color={colors.accent} />
                <Text style={styles.composerMenuText}>Chat controls</Text>
              </Pressable>
              {onClearView ? <Pressable
                onPress={onClearView}
                style={({ pressed }) => [styles.composerMenuRow, pressed && styles.pressed]}
              >
                <Trash2 size={18} color={colors.textSecondary} />
                <Text style={styles.composerMenuText}>Clear chat view</Text>
              </Pressable> : null}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ImageInputFallbackModal({
  pending,
  onAllow,
  onChooseModel,
  onOmit,
  onClose,
}: {
  pending: PendingImageSend | null;
  onAllow: (remember: boolean) => void;
  onChooseModel: () => void;
  onOmit: (remember: boolean) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [remember, setRemember] = useState(false);
  if (!pending) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.imageFallbackOverlay}>
        <Pressable
          accessibilityLabel="Cancel image input choice"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.imageFallbackSheet,
            { paddingBottom: Math.max(insets.bottom, spacing.sm) },
          ]}
        >
          <View style={styles.imageFallbackHeader}>
            <View style={styles.imageFallbackCopy}>
              <Text style={styles.imageFallbackEyebrow}>Image input</Text>
              <Text style={styles.imageFallbackTitle}>Confirm image support</Text>
              <Text style={styles.imageFallbackBody}>
                {pending.modelLabel}
                {pending.modelSupportsVision
                  ? ' supports vision, but this provider has not confirmed image delivery.'
                  : ' has not reported image input support.'}
                {'  '}
                {pending.imageCount} {pending.imageCount === 1 ? 'image' : 'images'} in context.
              </Text>
            </View>
            <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.referenceClose}>
              <X size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => onAllow(remember)}
            style={({ pressed }) => [styles.imageFallbackRow, pressed && styles.pressed]}
          >
            <ShieldCheck size={19} color={colors.accent} />
            <View style={styles.imageFallbackRowCopy}>
              <Text style={styles.imageFallbackRowTitle}>This model supports images</Text>
              <Text style={styles.imageFallbackRowMeta}>Send with image input.</Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={onChooseModel}
            style={({ pressed }) => [styles.imageFallbackRow, pressed && styles.pressed]}
          >
            <ScanSearch size={19} color={colors.textSecondary} />
            <View style={styles.imageFallbackRowCopy}>
              <Text style={styles.imageFallbackRowTitle}>Choose a vision model</Text>
              <Text style={styles.imageFallbackRowMeta}>Keep the draft and images.</Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => onOmit(remember)}
            style={({ pressed }) => [styles.imageFallbackRow, pressed && styles.pressed]}
          >
            <ImageOff size={19} color={colors.textSecondary} />
            <View style={styles.imageFallbackRowCopy}>
              <Text style={styles.imageFallbackRowTitle}>Continue without images</Text>
              <Text style={styles.imageFallbackRowMeta}>Send text only.</Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: remember }}
            onPress={() => setRemember((value) => !value)}
            style={({ pressed }) => [styles.imageRememberRow, pressed && styles.pressed]}
          >
            <View style={[styles.imageRememberCheck, remember && styles.imageRememberCheckActive]}>
              {remember ? <Check size={13} color={colors.onAccent} /> : null}
            </View>
            <Text style={styles.imageRememberText}>Remember my choice</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function RemoteAgentConsentModal({
  pending,
  onConfirm,
  onClose,
}: {
  pending: PendingRemoteAgentSend | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!pending) return null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.remoteAgentOverlay}>
        <Pressable
          accessibilityLabel="Cancel remote model"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.remoteAgentSheet,
            { paddingBottom: Math.max(insets.bottom, spacing.md) },
          ]}
        >
          <Text style={styles.remoteAgentTitle}>This model runs on {pending.hostName}</Text>
          <Text style={styles.remoteAgentBody}>
            Project text files are copied to a temporary folder on that host for this turn.
            Changes are written back to your project.
          </Text>
          <Text style={styles.remoteAgentMeta}>
            Build output, node_modules and Git metadata are skipped.
          </Text>
          <View style={styles.remoteAgentActions}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.remoteAgentButton, pressed && styles.pressed]}
            >
              <Text style={styles.remoteAgentCancel}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.remoteAgentButton,
                styles.remoteAgentButtonPrimary,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.remoteAgentConfirm}>Send files and run</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function formatWorkspaceReference(path: string): string {
  const normalized = path.trim();
  if (!normalized) return '';
  return normalized.includes(' ') ? `@"${normalized}"` : `@${normalized}`;
}

function ReferencePicker({
  visible,
  files,
  query,
  loading,
  error,
  onQueryChange,
  onSearch,
  onSelect,
  onClose,
}: {
  visible: boolean;
  files: string[];
  query: string;
  loading: boolean;
  error: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const folders = useMemo(() => {
    const found = new Set<string>();
    for (const file of files) {
      const parts = file.split('/').filter(Boolean);
      for (let index = 1; index < parts.length; index += 1) {
        found.add(`${parts.slice(0, index).join('/')}/`);
      }
    }
    return [...found].sort((left, right) => left.localeCompare(right));
  }, [files]);
  const rows = [
    ...folders.map((path) => ({ path, folder: true })),
    ...files.map((path) => ({ path, folder: false })),
  ].slice(0, 160);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.referenceOverlay}>
        <Pressable accessibilityLabel="Close workspace reference picker" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View
          style={[
            styles.referenceSheet,
            {
              paddingBottom: Math.max(insets.bottom, spacing.sm),
              paddingTop: spacing.sm,
            },
          ]}
        >
          <View style={styles.referenceHeader}>
            <Text style={styles.referenceTitle}>Reference workspace</Text>
            <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.referenceClose}>
              <X size={18} color={colors.textMuted} />
            </Pressable>
          </View>
          <View style={styles.referenceSearch}>
            <Search size={16} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={onQueryChange}
              onSubmitEditing={onSearch}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Find a file or folder"
              placeholderTextColor={colors.textMuted}
              style={styles.referenceSearchInput}
            />
            <Pressable
              accessibilityLabel="Search workspace"
              disabled={loading}
              onPress={onSearch}
              style={({ pressed }) => [styles.referenceSearchButton, pressed && styles.pressed]}
            >
              <Text style={styles.referenceSearchButtonText}>{loading ? '…' : 'Find'}</Text>
            </Pressable>
          </View>
          {error ? <Text style={styles.referenceError}>{error}</Text> : null}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.referenceList}
          >
            {rows.map((row) => (
              <Pressable
                key={`${row.folder ? 'folder' : 'file'}:${row.path}`}
                accessibilityRole="button"
                accessibilityLabel={`Reference ${row.path}`}
                onPress={() => onSelect(row.path)}
                style={({ pressed }) => [styles.referenceRow, pressed && styles.pressed]}
              >
                {row.folder ? (
                  <Folder size={16} color={colors.accent} />
                ) : (
                  <FileText size={16} color={colors.textMuted} />
                )}
                <Text numberOfLines={2} style={styles.referencePath}>{row.path}</Text>
              </Pressable>
            ))}
            {!rows.length && !loading ? (
              <Text style={styles.referenceEmpty}>No workspace files found.</Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function MessageActionsPopover({
  origin,
  onClose,
  onListen,
}: {
  origin: MessageActionOrigin;
  onClose: () => void;
  onListen: (origin: MessageActionOrigin) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { composerDrafts, pendingActions } = useControl();
  useSyncExternalStore(pendingActions.subscribe, pendingActions.getVersion, pendingActions.getVersion);
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => { open.current = false; };
  }, []);
  const [error, setError] = useState('');
  const [deleteArmed, setDeleteArmed] = useState(false);
  const { entry, reasoningLevel } = origin;
  const actionKey = JSON.stringify([origin.lease.key, 'message', entry.id]);
  const busy = pendingActions.get(actionKey)?.label ?? '';
  const isCurrent = () => open.current && composerDrafts.isActive(origin.lease);
  const close = () => {
    open.current = false;
    onClose();
  };
  const sendCommand = (name: string, payload: Record<string, unknown>) => origin.sendCommand(name, {
    ...payload,
    sessionId: origin.lease.destination.sessionId,
    projectId: origin.lease.destination.projectId,
  });

  const variants = entry.responseVariants ?? [];
  const activeVariantId = entry.activeVariantId || entry.messageId || entry.id;
  const branchReady =
    entry.variantIdentityAuthoritative === true &&
    typeof entry.activeMessageId === 'string' &&
    typeof entry.conversationRevision === 'number' &&
    typeof entry.providerConversationRevision === 'number';
  const imageAttachment = entry.attachments?.find(
    (attachment) => attachment.type === 'image' && Boolean(attachment.data),
  );

  const run = async (key: string, action: () => Promise<unknown>) => {
    if (!isCurrent()) return;
    const pending = pendingActions.begin(actionKey, key);
    if (!pending) return;
    setError('');
    setDeleteArmed(false);
    try {
      await action();
      if (isCurrent()) close();
    } catch (caught) {
      if (isCurrent()) {
        setError(caught instanceof Error ? caught.message : 'This action was not confirmed. Check before trying again.');
      }
    } finally {
      pendingActions.finish(pending);
    }
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={styles.messageMenuOverlay}>
        <Pressable accessibilityLabel="Close message actions" onPress={close} style={StyleSheet.absoluteFill} />
        <View style={[styles.messageMenu, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          {error ? <Text accessibilityRole="alert" style={styles.composerError}>{error}</Text> : null}
          {entry.kind === 'assistant' && variants.length > 1 ? (
            <View style={styles.variantBlock}>
              <Text style={styles.messageMenuLabel}>Response</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.variantStrip}
              >
                {variants.map((variant, index) => {
                  const active = variant.id === activeVariantId || variant.isActive;
                  return (
                    <Pressable
                      key={variant.id}
                      accessibilityLabel={`Response ${index + 1} of ${variants.length}`}
                      disabled={!branchReady || active || Boolean(busy)}
                      onPress={() =>
                        void run(`variant:${variant.id}`, () =>
                          sendCommand('message.select_variant', {
                            messageId: variant.id,
                            expectedActiveMessageId: entry.activeMessageId!,
                            expectedProviderConversationRevision: entry.providerConversationRevision!,
                          }),
                        )
                      }
                      style={({ pressed }) => [
                        styles.variantButton,
                        active && styles.variantButtonActive,
                        (!branchReady || Boolean(busy)) && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      {active ? <Check size={13} color={colors.accent} /> : null}
                      <Text style={[styles.variantButtonText, active && styles.variantButtonTextActive]}>
                        {index + 1}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {entry.kind === 'assistant' ? (
            <Pressable
              accessibilityRole="button"
              disabled={Boolean(busy)}
              onPress={() =>
                void run('regenerate', () =>
                  sendCommand('message.regenerate', {
                    messageId: activeVariantId,
                    model: exactMessageModel(entry),
                    ...(reasoningLevel ? { reasoningLevel } : {}),
                  }),
                )
              }
              style={({ pressed }) => [styles.messageMenuRow, pressed && styles.pressed]}
            >
              <RotateCcw size={18} color={colors.textSecondary} />
              <Text style={styles.messageMenuText}>{busy === 'regenerate' ? 'Regenerating…' : 'Regenerate'}</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={Boolean(busy) || !entry.body}
            onPress={() => void run('copy', async () => {
              if (!(await Clipboard.setStringAsync(entry.body))) throw new Error('Could not copy this text.');
            })}
            style={({ pressed }) => [styles.messageMenuRow, pressed && styles.pressed]}
          >
            <Copy size={18} color={colors.textSecondary} />
            <Text style={styles.messageMenuText}>{busy === 'copy' ? 'Copying…' : 'Copy text'}</Text>
          </Pressable>

          {imageAttachment ? (
            <Pressable
              accessibilityRole="button"
              disabled={Boolean(busy)}
              onPress={() =>
                void run('copy-image', () =>
                  Clipboard.setImageAsync(
                    imageAttachment.data.replace(/^data:image\/[^;]+;base64,/, ''),
                  ),
                )
              }
              style={({ pressed }) => [styles.messageMenuRow, pressed && styles.pressed]}
            >
              <ImageIcon size={18} color={colors.textSecondary} />
              <Text style={styles.messageMenuText}>
                {busy === 'copy-image' ? 'Copying image…' : 'Copy image'}
              </Text>
            </Pressable>
          ) : null}

          {entry.kind === 'assistant' ? (
            <>
              <Pressable
                accessibilityRole="button"
                disabled={Boolean(busy) || !entry.body}
                onPress={() =>
                  void run('save-note', () => {
                    const firstLine = entry.body.split('\n').find((line) => line.trim())?.trim() || 'Chat response';
                    const title = firstLine.replace(/^#{1,6}\s+/, '').replace(/[`*_]/g, '').slice(0, 80);
                    return sendCommand('notes.chat_finding', {
                      messageId: activeVariantId,
                      title: title || 'Chat response',
                      body: entry.body,
                    });
                  })
                }
                style={({ pressed }) => [styles.messageMenuRow, pressed && styles.pressed]}
              >
                <FileText size={18} color={colors.textSecondary} />
                <Text style={styles.messageMenuText}>{busy === 'save-note' ? 'Saving…' : 'Save as note'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={Boolean(busy) || !entry.body}
                onPress={() => void run('listen', () => onListen(origin))}
                style={({ pressed }) => [styles.messageMenuRow, pressed && styles.pressed]}
              >
                <Volume2 size={18} color={colors.textSecondary} />
                <Text style={styles.messageMenuText}>{busy === 'listen' ? 'Preparing audio…' : 'Listen'}</Text>
              </Pressable>
            </>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={Boolean(busy)}
            onPress={() =>
              void run(entry.userHidden ? 'show' : 'hide', () =>
                sendCommand('message.visibility', {
                  messageId: activeVariantId,
                  hidden: !entry.userHidden,
                }),
              )
            }
            style={({ pressed }) => [styles.messageMenuRow, pressed && styles.pressed]}
          >
            <EyeOff size={18} color={colors.textSecondary} />
            <Text style={styles.messageMenuText}>
              {busy === 'hide'
                ? 'Hiding…'
                : busy === 'show'
                  ? 'Showing…'
                  : entry.userHidden
                    ? 'Show in chat'
                    : 'Hide from this view'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={Boolean(busy)}
            onPress={() => {
              if (!isCurrent() || pendingActions.get(actionKey)) return;
              if (!deleteArmed) {
                setDeleteArmed(true);
                return;
              }
              void run('delete', () =>
                sendCommand('message.delete', {
                  messageId: activeVariantId,
                }),
              );
            }}
            style={({ pressed }) => [styles.messageMenuRow, pressed && styles.pressed]}
          >
            <Trash2 size={18} color={colors.error} />
            <Text style={styles.messageMenuDanger}>
              {busy === 'delete'
                ? 'Deleting…'
                : deleteArmed
                  ? 'Tap again to delete'
                  : 'Delete message'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function MobileWorkspaceView({ initialContextOpen = false, composerOnly = false }: {
  initialContextOpen?: boolean;
  /** Reuse the same draft, consent, attachment and run controls in the wide workspace. */
  composerOnly?: boolean;
} = {}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const screen = Dimensions.get('screen');
  const windowedIPad = Platform.OS === 'ios' && Platform.isPad &&
    (width < screen.width - 24 || height < screen.height - 24);
  const params = useLocalSearchParams<{ focus?: string; context?: string }>();
  const { snapshot, pairing, live, sendCommand, inspect, modelChoices, composerDrafts, pendingActions } = useControl();
  const destination = useMemo(() => ({
    baseUrl: pairing?.baseUrl ?? '',
    machineId: pairing?.machineId ?? '',
    sessionId: snapshot.activeSessionId,
    projectId: snapshot.activeProjectId,
  }), [pairing?.baseUrl, pairing?.machineId, snapshot.activeSessionId, snapshot.activeProjectId]);
  const draftKey = composerDestinationKey(destination);
  useSyncExternalStore(composerDrafts.subscribe, composerDrafts.getVersion, composerDrafts.getVersion);
  useSyncExternalStore(pendingActions.subscribe, pendingActions.getVersion, pendingActions.getVersion);
  const { body: value, attachments, saved: savedDrafts } = composerDrafts.read(draftKey);
  const draftsReady = composerDrafts.isReady();
  const draftRecoveryError = composerDrafts.getRecoveryError();
  const draftSaveError = composerDrafts.getPersistenceError();
  const setValue = (next: string | ((current: string) => string)) => composerDrafts.setBody(draftKey, next);
  const setAttachments = (next: MessageAttachment[] | ((current: MessageAttachment[]) => MessageAttachment[])) =>
    composerDrafts.setAttachments(draftKey, (current) => typeof next === 'function' ? next(current) : next);
  const composerLease = useRef<ComposerLease | null>(null);
  const recordingOrigin = useRef<DictationOrigin | null>(null);
  const playbackOperation = useRef<MessagePlaybackOperation | null>(null);
  const [playbackState, setPlaybackState] = useState<MessagePlaybackState>('idle');
  const scrollRef = useRef<React.ElementRef<typeof KeyboardChatScrollView>>(null);
  const feedAtEnd = useRef(true);
  const composerRef = useRef<TextInput>(null);
  const handledFocusLink = useRef(false);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [composerError, setComposerError] = useState('');
  const [clearedFeed, setClearedFeed] = useState<{ sessionId: string; ids: Set<string> }>(() => ({
    sessionId: '',
    ids: new Set(),
  }));
  const [contextOpen, setContextOpen] = useState(initialContextOpen);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [referenceQuery, setReferenceQuery] = useState('');
  const [referenceFiles, setReferenceFiles] = useState<string[]>([]);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState('');
  const referenceScope = useRef<{
    lease: ComposerLease; query: string; request: { query: string } | null;
  } | null>(null);
  const [messageMenu, setMessageMenu] = useState<MessageActionOrigin | null>(null);
  const nextMessageMenuId = useRef(0);
  const sending = composerDrafts.busy(draftKey);
  const [pendingImageSend, setPendingImageSend] = useState<PendingImageSend | null>(null);
  const [pendingRemoteAgentSend, setPendingRemoteAgentSend] = useState<PendingRemoteAgentSend | null>(null);
  const [remoteAgentConsent, setRemoteAgentConsent] = useState<Set<string>>(() => new Set());
  const [imageOmitNotice, setImageOmitNotice] = useState(false);
  const [composerHeight, setComposerHeight] = useState(64);

  const contextRouteOpen = params.context === '1';
  const closeContext = () => {
    if (contextRouteOpen) router.setParams({ context: undefined });
    setContextOpen(false);
  };

  const manager = managerAgent(snapshot.agents);
  const stopKey = JSON.stringify([draftKey, 'stop', manager?.id || 'kory-manager']);
  const stopping = Boolean(pendingActions.get(stopKey));
  const activeSession = snapshot.sessions.find((session) => session.id === snapshot.activeSessionId);
  const activeQuestion = live.questions[snapshot.activeSessionId];
  const activeReview = live.reviews[snapshot.activeSessionId];
  const activeRun = live.runs[snapshot.activeSessionId];
  const hasAttention = Boolean(activeQuestion || activeReview);
  const hasActiveGoal = snapshot.goals.some((goal) => !['completed', 'cancelled'].includes(goal.status));
  const composerBlocked = Boolean(activeQuestion && activeQuestion.allowKeepChatting !== true);
  const runActive = activeRun?.status === 'active';
  const runWaiting = activeRun?.status === 'waiting';
  const runBusy = runActive || runWaiting;
  const hasDraft = Boolean(value.trim() || attachments.length);
  const sendEnabled = Boolean(pairing && snapshot.activeSessionId) && hasDraft && draftsReady &&
    !draftSaveError && !composerBlocked && !runBusy && !sending;
  const stopEnabled = runBusy && !stopping;
  const composerAction: 'send' | 'stop' | 'waiting' | 'disabled' = runActive
    ? 'stop'
    : runWaiting
      ? 'waiting'
      : sendEnabled
        ? 'send'
        : 'disabled';

  const fallbackSelection = inferModelSelection(manager, snapshot.modelCatalog);
  const modelChoice = modelChoices[snapshot.activeSessionId];
  const selectedModel = `${modelChoice?.selection || fallbackSelection}`;
  const reasoningLevel = `${modelChoice?.reasoningLevel ?? ''}`;
  const fastMode = modelChoice?.fastMode === true;
  const selectedModelEntry = snapshot.modelCatalog.find((model) => model.selection === selectedModel);
  const modelLabel = selectedModelEntry?.name || manager?.model || 'Model';
  const modelDisplay = reasoningLevel ? `${modelLabel} ${reasoningLevel}` : modelLabel;

  const openMessageActions = (entry: FeedEntry) => {
    const lease = composerLease.current;
    if (!lease || lease.key !== draftKey || !composerDrafts.isActive(lease)) return;
    setMessageMenu({ id: ++nextMessageMenuId.current, entry, lease, sendCommand, reasoningLevel });
  };

  const finishDictation = useCallback(async (origin: DictationOrigin, transcribe: boolean) => {
    if (origin.phase !== 'recording' || !origin.recorder) return;
    origin.phase = 'stopping';
    if (recordingOrigin.current === origin) {
      setRecording(false);
      setTranscribing(true);
    }
    let file: File | undefined;
    let audio: MessageAttachment | undefined;
    let captured = false;
    let stopError: unknown;
    try {
      try {
        await origin.recorder.stop();
      } catch (caught) {
        stopError = caught;
      }
      // Capture the URI before releasing the native object, including on blur
      // or unmount. A hook-owned recorder can be released before async cleanup.
      if (origin.recorder.uri) file = new File(origin.recorder.uri);
      try {
        if (origin.audioModeEnabled) await setAudioModeAsync({ allowsRecording: false });
      } catch (caught) {
        stopError ??= caught;
      } finally {
        try { origin.recorder.release(); } catch (caught) { stopError ??= caught; }
        if (microphoneOwner === origin) microphoneOwner = null;
      }
      if (!file) throw stopError ?? new Error('Recorded audio is unavailable');
      const size = file.size;
      if (!Number.isFinite(size) || size <= 0) throw new Error('The recording could not be read. Export it to keep a copy.');
      if (size > MAX_COMPOSER_ATTACHMENT_BYTES) {
        throw new Error('This recording exceeds the 15 MB limit. Export it and try a shorter dictation.');
      }
      const data = await file.base64();
      const candidate: MessageAttachment = {
        type: 'file', name: `dictation-${Date.now()}.m4a`, data, mimeType: 'audio/mp4', size,
      };
      assertComposerAttachments([candidate]);
      audio = candidate;
      if (stopError) throw stopError;

      if (!transcribe || origin.cancelled || !composerDrafts.isActive(origin.lease) || AppState.currentState !== 'active') {
        composerDrafts.saveRecovery(origin.lease.key, {
          body: '', attachments: [audio],
          message: 'Dictation stopped when you left the chat. Your recording is saved here.',
        });
        captured = true;
        return;
      }
      origin.phase = 'transcribing';
      const result = await origin.sendCommand('voice.transcribe', {
        audioBase64: data, mimeType: audio.mimeType,
        sessionId: origin.lease.destination.sessionId,
        projectId: origin.lease.destination.projectId,
      });
      const text = (result.data as { text?: string } | undefined)?.text?.trim();
      if (!text) throw new Error('No speech was detected');
      composerDrafts.setBody(origin.lease.key, (current) => `${current}${current.trim() ? ' ' : ''}${text}`);
      captured = true;
      if (composerDrafts.isActive(origin.lease) && AppState.currentState === 'active') {
        requestAnimationFrame(() => composerRef.current?.focus());
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not transcribe recording';
      if (audio) {
        composerDrafts.saveRecovery(origin.lease.key, {
          body: '', attachments: [audio], message: `Dictation was not transcribed. Your recording is saved. ${message}`,
        });
        captured = true;
      } else if (file) {
        // Keep large/unreadable recordings out of JS memory and out of sends.
        // Moving to documents protects the only copy from ordinary cache cleanup.
        const name = `dictation-recovery-${Date.now()}.m4a`;
        try { await file.move(new File(Paths.document, name)); } catch { /* Retain the original URI if moving fails. */ }
        composerDrafts.saveRecovery(origin.lease.key, {
          body: '', attachments: [], localRecording: { uri: file.uri, name, mimeType: 'audio/mp4' },
          message: `${message} Use Export recording to keep a copy outside this app.`,
        });
      }
      if (composerDrafts.isActive(origin.lease)) setComposerError(message);
    } finally {
      if (microphoneOwner === origin) {
        // Also runs when stop/URI access throws before ordinary teardown.
        await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
        try { origin.recorder.release(); } catch { /* Already released by native interruption. */ }
        microphoneOwner = null;
      }
      // Never delete the only copy when file reading or recovery failed.
      if (captured && file) {
        try { file.delete(); } catch { /* Cache cleanup can be retried by the OS. */ }
      }
      if (recordingOrigin.current === origin) {
        recordingOrigin.current = null;
        setRecording(false);
        setTranscribing(false);
      }
    }
  }, [composerDrafts]);

  const cancelDictation = useCallback((lease?: ComposerLease) => {
    const origin = recordingOrigin.current;
    if (!origin || (lease && origin.lease !== lease)) return;
    origin.cancelled = true;
    if (origin.phase === 'recording') void finishDictation(origin, false);
    // An in-flight permission/preparation promise performs its own teardown.
  }, [finishDictation]);

  const cancelPlayback = useCallback(() => {
    const operation = playbackOperation.current;
    if (operation) messagePlayback.cancel(operation);
    playbackOperation.current = null;
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') cancelPlayback();
      const origin = recordingOrigin.current;
      // iOS's microphone permission dialog can temporarily make the app inactive.
      if (state !== 'active' && (state !== 'inactive' || origin?.phase !== 'permission')) cancelDictation();
    });
    return () => { subscription.remove(); cancelDictation(); cancelPlayback(); };
  }, [cancelDictation, cancelPlayback]);

  // These options are part of the consent/preflight scope even when the
  // destination key stays the same. Changing any of them renews the lease.
  const composerScope = useMemo(() => ({
    destination, selectedModel, reasoningLevel, fastMode, composerBlocked, runBusy,
  }), [destination, selectedModel, reasoningLevel, fastMode, composerBlocked, runBusy]);

  useFocusEffect(useCallback(() => {
    const lease = composerDrafts.activate(composerScope.destination);
    composerLease.current = lease;
    setPendingImageSend(null);
    setPendingRemoteAgentSend(null);
    setComposerError('');
    setImageOmitNotice(false);
    setReferenceOpen(false);
    setReferenceFiles([]);
    setReferenceLoading(false);
    setReferenceError('');
    referenceScope.current = null;
    setComposerMenuOpen(false);
    setMessageMenu(null);
    setPlaybackState('idle');
    return () => {
      composerDrafts.deactivate(lease);
      referenceScope.current = null;
      if (composerLease.current === lease) composerLease.current = null;
      cancelDictation(lease);
      cancelPlayback();
    };
  }, [composerDrafts, composerScope, cancelDictation, cancelPlayback, setPendingImageSend,
    setPendingRemoteAgentSend, setReferenceOpen, setComposerMenuOpen, setMessageMenu]));

  const clearedFeedIds =
    clearedFeed.sessionId === snapshot.activeSessionId ? clearedFeed.ids : undefined;
  const storedFeed = snapshot.feed.filter((entry) => {
    if (clearedFeedIds?.has(entry.id)) return false;
    if (entry.kind === 'user') return true;
    if (entry.kind !== 'assistant') return false;
    if (entry.agentId) {
      return (
        entry.agentId === manager?.id ||
        entry.agentId === 'kory-manager' ||
        entry.agentId === 'manager'
      );
    }
    return entry.author === manager?.name || entry.author === 'Kory';
  });
  const feed = mergeLiveManagerFeed(
    storedFeed,
    snapshot.activeSessionId,
    live.streams?.[snapshot.activeSessionId]?.['kory-manager'] ??
      (manager ? live.streams?.[snapshot.activeSessionId]?.[manager.id] : undefined),
  );

  const insertPromptTemplate = (content: string) => {
    setValue((current) => {
      const trimmed = current.trim();
      return trimmed ? trimmed + '\n\n' + content : content;
    });
    setComposerMenuOpen(false);
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const clearChatView = () => {
    setClearedFeed({
      sessionId: snapshot.activeSessionId,
      ids: new Set(feed.map((entry) => entry.id)),
    });
    setComposerMenuOpen(false);
  };

  const blockingAttentionKey = activeQuestion && activeQuestion.allowKeepChatting !== true
    ? JSON.stringify([draftKey, activeQuestion.questionId ?? activeQuestion.question])
    : '';
  useAttentionRedirect(blockingAttentionKey, composerOnly);

  useEffect(() => {
    if (params.focus !== '1' || handledFocusLink.current || !pairing) return;
    handledFocusLink.current = true;
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [pairing, params.focus]);

  const dispatchMessage = async (
    draft: Pick<PendingImageSend, 'attempt' | 'body' | 'attachments' | 'model' | 'reasoningLevel' | 'fastMode'>,
    imageInputMode: ImageInputMode,
    remoteApproved = false,
  ) => {
    if (!composerDrafts.canContinue(draft.attempt)) return;
    const remoteModel = snapshot.modelCatalog.find((model) => model.selection === draft.model);
    const remoteConsentKey = remoteModel?.remoteAgentic
      ? JSON.stringify([draft.attempt.lease.key, remoteModel.provider])
      : '';
    if (
      !remoteApproved &&
      remoteModel?.remoteAgentic === true &&
      remoteConsentKey &&
      !remoteAgentConsent.has(remoteConsentKey)
    ) {
      if (!composerDrafts.waitForConsent(draft.attempt)) return;
      setPendingImageSend(null);
      setPendingRemoteAgentSend({
        draft,
        imageInputMode,
        provider: remoteModel.provider,
        hostName: remoteModel.remoteHostName || remoteModel.providerLabel || 'the host',
      });
      return;
    }

    // Keep the original editable draft on disk before replacing it with the
    // uncertain in-flight send record. Both writes must succeed before dispatch.
    try {
      await composerDrafts.flush();
    } catch (caught) {
      composerDrafts.cancel(draft.attempt);
      if (composerDrafts.isActive(draft.attempt.lease)) {
        setComposerError(`Message not sent. Could not save draft: ${caught instanceof Error ? caught.message : 'Storage failed'}`);
      }
      return;
    }
    if (!composerDrafts.consume(draft.attempt)) return;
    setPendingImageSend(null);
    setPendingRemoteAgentSend(null);
    setComposerError('');
    try {
      await composerDrafts.flush();
      if (!composerDrafts.canDispatch(draft.attempt) || AppState.currentState !== 'active') {
        composerDrafts.abortBeforeDispatch(draft.attempt, 'The chat or app changed before dispatch.');
        await composerDrafts.flush();
        return;
      }
    } catch (caught) {
      composerDrafts.abortBeforeDispatch(draft.attempt, 'Could not safely save the outgoing message.');
      if (composerDrafts.isActive(draft.attempt.lease)) {
        setComposerError(`Message not sent. Storage failed: ${caught instanceof Error ? caught.message : 'Unknown error'}`);
      }
      return;
    }
    try {
      await sendCommand('session.send_message', {
        sessionId: draft.attempt.lease.destination.sessionId,
        projectId: draft.attempt.lease.destination.projectId,
        body: draft.body,
        attachments: draft.attachments,
        ...(draft.model ? { model: draft.model } : {}),
        ...(draft.reasoningLevel ? { reasoningLevel: draft.reasoningLevel } : {}),
        ...(draft.fastMode ? { fastMode: true } : {}),
        imageInputMode,
      });
      composerDrafts.finish(draft.attempt);
      if (composerDrafts.isActive(draft.attempt.lease)) setImageOmitNotice(imageInputMode === 'omit');
    } catch (caught) {
      composerDrafts.finish(draft.attempt, caught instanceof Error ? caught.message : 'Could not send message');
    }
  };

  const send = async () => {
    const lease = composerLease.current;
    if (!lease || lease.key !== draftKey || !draftsReady || draftSaveError || composerBlocked || runBusy) return;
    let attempt: ComposerAttempt | null;
    try { attempt = composerDrafts.begin(lease); }
    catch (caught) {
      setComposerError(caught instanceof Error ? caught.message : 'Could not prepare attachments.');
      return;
    }
    if (!attempt) return;
    const body = attempt.body.trim();
    const outgoingAttachments = attempt.attachments;
    const draft = {
      attempt,
      body,
      attachments: outgoingAttachments,
      model: selectedModel,
      reasoningLevel,
      fastMode,
    };
    const currentImages = outgoingAttachments.filter((attachment) => attachment.type === 'image').length;
    let historicalImages = snapshot.feed.reduce(
      (count, entry) =>
        count + (entry.kind === 'user'
          ? entry.attachments?.filter((attachment) => attachment.type === 'image').length ?? 0
          : 0),
      0,
    );

    setComposerError('');
    try {
      if (selectedModelEntry && snapshot.activeSessionId) {
        try {
          const preview = await inspect<{
            imageAttachmentCount?: number;
            hasImageAttachments?: boolean;
          }>('context.model_preview', {
            sessionId: lease.destination.sessionId,
            projectId: lease.destination.projectId,
            model: selectedModelEntry.id,
            provider: selectedModelEntry.provider,
            contextWindow: selectedModelEntry.contextWindow,
          });
          historicalImages =
            typeof preview.imageAttachmentCount === 'number'
              ? preview.imageAttachmentCount
              : preview.hasImageAttachments
                ? Math.max(historicalImages, 1)
                : 0;
        } catch {
          // The visible transcript is conservative when an older host cannot
          // provide the authoritative context image count.
        }
      }

      if (!composerDrafts.canContinue(attempt)) return;

      const imageCount = historicalImages + currentImages;
      let imageInputMode: ImageInputMode = 'reject';
      if (imageCount > 0 && selectedModel && selectedModelEntry?.supportsAttachments !== true) {
        imageInputMode = await readImageInputPreference(selectedModel);
        if (!composerDrafts.canContinue(attempt)) return;
        if (imageInputMode === 'reject') {
          if (!composerDrafts.waitForConsent(attempt)) return;
          setPendingImageSend({
            ...draft,
            modelLabel: selectedModelEntry?.name || modelLabel,
            modelSupportsVision: selectedModelEntry?.vision === true,
            imageCount,
          });
          return;
        }
      }

      await dispatchMessage(draft, imageInputMode);
    } finally {
      if (attempt.phase === 'preflight') composerDrafts.cancel(attempt);
    }
  };

  const resolveImageSend = async (mode: Exclude<ImageInputMode, 'reject'>, remember: boolean) => {
    const pending = pendingImageSend;
    if (!pending || !composerDrafts.resumeConsent(pending.attempt)) return;
    if (remember) {
      try {
        await rememberImageInputPreference(mode, pending.model);
      } catch {
        // Sending should still work if the preference cannot be persisted.
      }
    }
    await dispatchMessage(pending, mode);
  };

  const confirmRemoteAgentSend = async () => {
    const pending = pendingRemoteAgentSend;
    if (!pending || !composerDrafts.resumeConsent(pending.draft.attempt)) return;
    const consentKey = JSON.stringify([pending.draft.attempt.lease.key, pending.provider]);
    setRemoteAgentConsent((current) => new Set([...current, consentKey]));
    await dispatchMessage(pending.draft, pending.imageInputMode, true);
  };

  const stopRun = async () => {
    const lease = composerLease.current;
    if (!runBusy || !lease || lease.key !== draftKey || !composerDrafts.isActive(lease)) return;
    const pending = pendingActions.begin(stopKey, 'stop');
    if (!pending) return;
    setComposerError('');
    try {
      await sendCommand('agent.control', {
        sessionId: lease.destination.sessionId,
        projectId: lease.destination.projectId,
        agentId: manager?.id || 'kory-manager',
        action: 'stop',
      });
    } catch (caught) {
      if (composerDrafts.isActive(lease)) {
        setComposerError(caught instanceof Error ? caught.message : 'Could not stop Koryphaios');
      }
    } finally {
      pendingActions.finish(pending);
    }
  };

  const addAttachments = async () => {
    const lease = composerLease.current;
    if (!lease) return;
    setComposerMenuOpen(false);
    setComposerError('');
    const existingBytes = attachments.reduce((sum, item) => sum + (item.size ?? Math.ceil(item.data.length * 0.75)), 0);
    const remaining = Math.max(1, 15 * 1024 * 1024 - existingBytes);
    try {
      const picked = await pickChatAttachments(remaining);
      if (picked.length) setAttachments((current) => [...current, ...picked]);
    } catch (caught) {
      if (composerDrafts.isActive(lease)) setComposerError(caught instanceof Error ? caught.message : 'Could not attach files');
    }
  };

  const pasteClipboardImage = async () => {
    const lease = composerLease.current;
    if (!lease) return;
    setComposerMenuOpen(false);
    setComposerError('');
    try {
      const image = await Clipboard.getImageAsync({ format: 'png' });
      if (!image?.data) {
        if (composerDrafts.isActive(lease)) setComposerError('No image is available on the clipboard.');
        return;
      }
      const data = image.data.replace(/^data:image\/[^;]+;base64,/, '');
      const size = Math.ceil(data.length * 0.75);
      const existingBytes = composerDrafts.read(draftKey).attachments.reduce(
        (sum, item) => sum + (item.size ?? Math.ceil(item.data.length * 0.75)),
        0,
      );
      if (existingBytes + size > 15 * 1024 * 1024) {
        if (composerDrafts.isActive(lease)) setComposerError('Attachments exceed the 15 MB limit.');
        return;
      }
      setAttachments((current) => [
        ...current,
        {
          type: 'image',
          data,
          name: `clipboard-${Date.now()}.png`,
          mimeType: 'image/png',
          size,
        },
      ]);
    } catch (caught) {
      if (composerDrafts.isActive(lease)) setComposerError(caught instanceof Error ? caught.message : 'Could not paste the clipboard image');
    }
  };

  const listenToMessage = async (origin: MessageActionOrigin) => {
    const { entry, lease } = origin;
    const isCurrent = () => composerDrafts.isActive(lease) && AppState.currentState === 'active';
    if (!isCurrent()) return;
    if (microphoneOwner) {
      setComposerError('Finish dictation before listening to a response.');
      return;
    }
    setComposerError('');
    const readSetting = (id: string, fallback: string | number) => {
      const setting = snapshot.settings.find((field) => field.id === id)?.value;
      return typeof setting === 'string' || typeof setting === 'number' ? setting : fallback;
    };
    const operation = messagePlayback.start({
      text: entry.body,
      provider: String(readSetting('voice.output.provider', 'system')),
      modelId: String(readSetting('voice.output.modelId', 'web-speech-synthesis')),
      voiceId: String(readSetting('voice.output.voiceId', 'system-default')),
      speed: Number(readSetting('voice.output.speed', 1)),
      isCurrent,
      synthesize: (payload) => origin.sendCommand('voice.synthesize', {
        ...payload, sessionId: lease.destination.sessionId, projectId: lease.destination.projectId,
      }),
      onState: (state) => { if (composerDrafts.isActive(lease)) setPlaybackState(state); },
      onError: (message) => { if (isCurrent()) setComposerError(message); },
    });
    playbackOperation.current = operation;
    await operation.ready;
  };

  const loadWorkspaceReferences = async () => {
    const scope = referenceScope.current;
    if (!scope || !composerDrafts.isActive(scope.lease) || scope.request?.query === scope.query) return;
    const { lease, query } = scope;
    const request = { query };
    scope.request = request;
    const isCurrent = () => referenceScope.current === scope && scope.request === request &&
      scope.query === query && composerDrafts.isActive(lease);
    setReferenceLoading(true);
    setReferenceError('');
    try {
      const result = await inspect<WorkspaceFilesInspection>('workspace.files', {
        query,
        sessionId: lease.destination.sessionId,
        projectId: lease.destination.projectId,
      });
      if (isCurrent()) setReferenceFiles(result.files);
    } catch (caught) {
      if (isCurrent()) setReferenceError(caught instanceof Error ? caught.message : 'Could not browse workspace files');
    } finally {
      if (isCurrent()) {
        scope.request = null;
        setReferenceLoading(false);
      }
    }
  };

  const openWorkspaceReferences = () => {
    const lease = composerLease.current;
    if (!lease || !composerDrafts.isActive(lease) || referenceScope.current) return;
    referenceScope.current = { lease, query: referenceQuery, request: null };
    setComposerMenuOpen(false);
    setReferenceOpen(true);
    setReferenceFiles([]);
    void loadWorkspaceReferences();
  };

  const closeWorkspaceReferences = () => {
    referenceScope.current = null;
    setReferenceOpen(false);
    setReferenceLoading(false);
  };

  const changeReferenceQuery = (query: string) => {
    const scope = referenceScope.current;
    if (!scope || scope.query === query) return;
    scope.query = query;
    scope.request = null;
    setReferenceQuery(query);
    setReferenceFiles([]);
    setReferenceLoading(false);
    setReferenceError('');
  };

  const selectWorkspaceReference = (path: string) => {
    const scope = referenceScope.current;
    if (!scope || !composerDrafts.isActive(scope.lease)) return;
    const reference = formatWorkspaceReference(path);
    if (!reference) return;
    composerDrafts.setBody(scope.lease.key, (current) => {
      const before = current && !/\s$/.test(current) ? `${current} ` : current;
      return `${before}${reference} `;
    });
    closeWorkspaceReferences();
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const exportRecording = async (draft: SavedComposerDraft) => {
    const lease = composerLease.current;
    if (!lease || !draft.localRecording || !composerDrafts.isActive(lease)) return;
    const ticket = pendingActions.begin(JSON.stringify([lease.key, 'export-recording', draft.id]), 'Exporting recording…');
    if (!ticket) return;
    try {
      const Sharing = await import('expo-sharing');
      if (!composerDrafts.isActive(lease)) return;
      if (!await Sharing.isAvailableAsync()) throw new Error('File export is unavailable on this device. The recording is still retained.');
      if (!composerDrafts.isActive(lease)) return;
      await Sharing.shareAsync(draft.localRecording.uri, {
        mimeType: draft.localRecording.mimeType, dialogTitle: 'Export recording',
      });
    } catch (caught) {
      if (composerDrafts.isActive(lease)) setComposerError(caught instanceof Error ? caught.message : 'Could not export recording.');
    } finally { pendingActions.finish(ticket); }
  };

  const stopDictation = async () => {
    const origin = recordingOrigin.current;
    if (!origin) return;
    setComposerMenuOpen(false);
    setComposerError('');
    await finishDictation(origin, true);
  };

  const startDictation = async () => {
    if (recording) {
      await stopDictation();
      return;
    }
    const lease = composerLease.current;
    if (!lease || recordingOrigin.current || AppState.currentState !== 'active') return;
    if (microphoneOwner) {
      setComposerError('The previous recording is finishing. Try dictation again shortly.');
      return;
    }
    cancelPlayback();
    const origin: DictationOrigin = {
      lease, sendCommand, recorder: null, phase: 'permission', cancelled: false, audioModeEnabled: false,
    };
    recordingOrigin.current = origin;
    microphoneOwner = origin;
    let started = false;
    let prepared = false;
    const canStart = () => !origin.cancelled && composerDrafts.isActive(lease) && AppState.currentState === 'active';
    setComposerMenuOpen(false);
    setComposerError('');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!canStart()) return;
      if (!permission.granted) throw new Error('Microphone permission is required for dictation');
      origin.phase = 'preparing';
      // Own the recorder until asynchronous teardown completes, including when
      // this screen unmounts. The preset is applied again by prepare's SDK adapter.
      // SDK 57 types expose this native constructor; ESLint cannot inspect requireNativeModule.
      // eslint-disable-next-line import/namespace
      origin.recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
      origin.audioModeEnabled = true;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (!canStart()) return;
      await origin.recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
      prepared = true;
      if (!canStart()) return;
      origin.recorder.record();
      origin.phase = 'recording';
      started = true;
      setRecording(true);
    } catch (caught) {
      if (composerDrafts.isActive(lease)) setComposerError(caught instanceof Error ? caught.message : 'Could not start dictation');
    } finally {
      if (!started) {
        if (prepared) await origin.recorder?.stop().catch(() => undefined);
        if (origin.audioModeEnabled) await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
        try { origin.recorder?.release(); } catch { /* Native object may already be disposed. */ }
        if (microphoneOwner === origin) microphoneOwner = null;
        if (recordingOrigin.current === origin) recordingOrigin.current = null;
      }
    }
  };

  const machineStatus = live.connection === 'connecting' ? 'connecting'
    : live.connection !== 'connected' ? 'offline' : snapshot.machine.status;
  const machineName = machineDisplayName(snapshot.machine, pairing);
  const connectionLabel = live.connection === 'error' ? 'Connection lost · retrying'
    : live.connection === 'disconnected' ? 'Disconnected'
      : machineStatus === 'connecting' ? 'Connecting…'
        : machineStatus === 'online' ? 'Connected' : 'Host offline';
  const hostReady = machineStatus === 'online';

  if (!pairing) {
    return (
      <View style={[styles.root, composerOnly && styles.embeddedComposer]}>
        <View style={styles.unpairedState}>
          <Text style={styles.unpairedTitle}>Pair your Koryphaios machine</Text>
          <Text style={styles.unpairedText}>
            Your computer runs the agents. This device controls that host.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pair machine"
            onPress={() => router.push('/machines')}
            style={({ pressed }) => [styles.pairButton, pressed && styles.pressed]}
          >
            <Text style={styles.pairButtonText}>Pair machine</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, composerOnly && styles.embeddedComposer]}>
      <View style={[styles.workspaceRow, composerOnly && styles.embeddedComposer]}>
        <View style={styles.chatPane}>
          {!composerOnly ? <>
          <View style={[styles.header, width >= breakpoints.rail && styles.headerTablet, windowedIPad && styles.headerWindowedIPad]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open chats"
              onPress={() => router.push('/chats')}
              style={({ pressed }) => [styles.headerTitleButton, pressed && styles.pressed]}
            >
              <View style={styles.headerTitleRow}>
                <Text numberOfLines={1} style={styles.headerTitle}>
                  {activeSession?.title ?? 'Workspace'}
                </Text>
                <ChevronDown size={15} color={colors.textMuted} />
              </View>
              <View style={styles.headerStatusRow}>
                <StatusDot status={machineStatus} size={6} />
                <Text numberOfLines={2} style={styles.headerStatus}>
                  {machineName} · {connectionLabel}
                </Text>
              </View>
            </Pressable>

            <View style={styles.headerActions}>
              {hasAttention ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open attention"
                  onPress={() => router.push('/attention')}
                  style={({ pressed }) => [styles.attentionButton, pressed && styles.pressed]}
                >
                  <Bell size={17} color={colors.accent} />
                  <View style={styles.attentionBadge} />
                </Pressable>
              ) : null}
              <MobileContextRing
                used={snapshot.context.used}
                limit={snapshot.context.limit}
                breakdown={snapshot.context.breakdown}
                onPress={() => {
                  if (contextOpen || contextRouteOpen) closeContext();
                  else setContextOpen(true);
                }}
              />
            </View>
          </View>

          <KeyboardChatScrollView
            ref={scrollRef}
            style={styles.feed}
            contentContainerStyle={[
              styles.feedContent,
              width >= breakpoints.rail && styles.feedContentTablet,
              width >= breakpoints.wide && styles.feedContentWide,
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            keyboardLiftBehavior="whenAtEnd"
            offset={composerHeight + insets.bottom}
            onEndVisible={(visible) => {
              feedAtEnd.current = visible;
            }}
            onContentSizeChange={() => {
              if (feedAtEnd.current) {
                scrollRef.current?.scrollToEnd({ animated: false });
              }
            }}
          >
            {feed.map((entry) => (
              <ManagerMessage
                key={entry.id}
                entry={entry}
                manager={manager}
                onOpenActions={openMessageActions}
              />
            ))}
            {!feed.length ? (
              <View style={styles.emptyFeed}>
                <Text style={styles.emptyFeedTitle}>
                  {!snapshot.activeSessionId ? (hostReady ? 'Choose a chat to begin' : 'Reconnect to choose a chat')
                    : !hostReady ? 'Waiting for your computer'
                      : 'Ready for your next message'}
                </Text>
                <Text style={styles.emptyFeedDescription}>
                  {!snapshot.activeSessionId
                    ? (hostReady ? 'Open an existing conversation or create a new one from Chats.'
                      : 'The connection to your desktop is unavailable. Check the connection in Machines, then choose or create a chat.')
                    : !hostReady
                      ? `${machineName} is ${connectionLabel.toLowerCase()}. Your draft stays here while you reconnect.`
                      : 'Send a message below to work with Koryphaios.'}
                </Text>
                {(!snapshot.activeSessionId || !hostReady) ? (
                  <View style={styles.emptyFeedActions}>
                    {!hostReady ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Open connection settings"
                        onPress={() => router.push('/machines')}
                        style={({ pressed }) => [styles.emptyFeedPrimary, pressed && styles.pressed]}
                      >
                        <Text style={styles.emptyFeedPrimaryText}>Connection settings</Text>
                      </Pressable>
                    ) : null}
                    {!snapshot.activeSessionId ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Open chats to choose or create a conversation"
                        onPress={() => router.push('/chats')}
                        style={({ pressed }) => [
                          hostReady ? styles.emptyFeedPrimary : styles.emptyFeedSecondary,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={hostReady ? styles.emptyFeedPrimaryText : styles.emptyFeedSecondaryText}>
                          Open chats
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}
          </KeyboardChatScrollView>
          </> : null}

          <KeyboardStickyView
            offset={{ opened: composerOnly ? 0 : insets.bottom }}
            onLayout={(event) => {
              const nextHeight = Math.ceil(event.nativeEvent.layout.height);
              if (nextHeight > 0 && nextHeight !== composerHeight) setComposerHeight(nextHeight);
            }}
            style={[styles.composerWrap, width >= breakpoints.rail && styles.composerWrapTablet]}
          >
            {composerError ? <Text accessibilityRole="alert" style={styles.composerError}>{composerError}</Text> : null}
            {!draftsReady ? (
              <View style={styles.savedDraft}>
                <Text accessibilityRole="alert" style={styles.savedDraftMessage}>
                  {draftRecoveryError
                    ? `Saved messages could not be restored: ${draftRecoveryError}`
                    : 'Restoring saved messages…'}
                </Text>
                {draftRecoveryError ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Retry message recovery"
                    onPress={() => composerDrafts.retryLoad()} style={styles.savedDraftAction}>
                    <Text style={styles.savedDraftMessage}>Retry recovery</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : draftSaveError ? (
              <View style={styles.savedDraft}>
                <Text accessibilityRole="alert" style={styles.savedDraftMessage}>
                  {`Saved messages could not be updated: ${draftSaveError}. Sending is paused to protect your work.`}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Retry saving messages"
                  onPress={() => void composerDrafts.flush().catch(() => {})} style={styles.savedDraftAction}>
                  <Text style={styles.savedDraftMessage}>Retry save</Text>
                </Pressable>
              </View>
            ) : null}
            {playbackState !== 'idle' ? (
              <Pressable accessibilityRole="button"
                accessibilityLabel={playbackState === 'preparing' ? 'Cancel audio' : 'Stop audio'}
                onPress={cancelPlayback} style={styles.savedDraftAction}>
                <Square size={14} color={colors.textSecondary} />
                <Text style={styles.savedDraftMessage}>
                  {playbackState === 'preparing' ? 'Preparing audio… · Cancel' : 'Playing response · Stop'}
                </Text>
              </Pressable>
            ) : null}
            {savedDrafts.map((draft) => (
              <View key={draft.id} style={styles.savedDraft}>
                <Text accessibilityRole="alert" style={styles.savedDraftMessage}>{draft.message}</Text>
                <Text numberOfLines={2} style={styles.savedDraftPreview}>
                  {draft.localRecording?.name || draft.body || `${draft.attachments.length} attachment${draft.attachments.length === 1 ? '' : 's'}`}
                </Text>
                <View style={styles.savedDraftActions}>
                  {draft.localRecording ? (
                    <Pressable accessibilityRole="button" accessibilityLabel="Export recording"
                      onPress={() => void exportRecording(draft)} style={styles.savedDraftAction}>
                      <Text style={styles.savedDraftMessage}>Export recording</Text>
                    </Pressable>
                  ) : (
                    <Pressable accessibilityRole="button" accessibilityLabel="Restore saved draft"
                      disabled={!draftsReady}
                      onPress={() => {
                        try { composerDrafts.restore(draftKey, draft.id); }
                        catch (caught) { setComposerError(caught instanceof Error ? caught.message : 'Could not restore draft.'); }
                      }} style={styles.savedDraftAction}>
                      <Text style={styles.savedDraftMessage}>Restore draft</Text>
                    </Pressable>
                  )}
                  <Pressable accessibilityRole="button" accessibilityLabel="Discard saved draft"
                    disabled={!draftsReady}
                    onPress={() => composerDrafts.discardSaved(draftKey, draft.id)} style={styles.savedDraftAction}>
                    <Text style={styles.savedDraftPreview}>Discard</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            {!snapshot.activeSessionId ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/chats')} style={styles.savedDraftAction}>
                <Text style={styles.savedDraftMessage}>Choose or create a chat to send a message</Text>
              </Pressable>
            ) : null}
            {imageOmitNotice ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ask about image input next time"
                onPress={() => {
                  void resetImageOmitPreference().finally(() => setImageOmitNotice(false));
                }}
                style={({ pressed }) => [styles.imageOmitNotice, pressed && styles.pressed]}
              >
                <ImageOff size={13} color={colors.textMuted} />
                <Text style={styles.imageOmitNoticeText}>Images omitted · Ask next time</Text>
              </Pressable>
            ) : null}
            {recording || transcribing ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={recording ? 'Stop dictation' : 'Transcribing'}
                disabled={transcribing}
                onPress={() => void stopDictation()}
                style={({ pressed }) => [styles.recordingPill, pressed && !transcribing && styles.pressed]}
              >
                <Mic size={14} color={colors.error} />
                <Text style={styles.recordingText}>{transcribing ? 'Transcribing…' : 'Recording  Tap to stop'}</Text>
              </Pressable>
            ) : null}
            {attachments.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachmentStrip}>
                {attachments.map((attachment, index) => (
                  <View key={`${attachment.name}:${index}`} style={styles.attachmentChip}>
                    <Text numberOfLines={1} style={styles.attachmentName}>{attachment.name}</Text>
                    <Pressable
                      accessibilityLabel={`Remove ${attachment.name}`}
                      onPress={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      style={styles.attachmentRemove}
                    >
                      <X size={12} color={colors.textMuted} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.composer}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More message actions"
                disabled={!draftsReady}
                onPress={() => setComposerMenuOpen(true)}
                style={({ pressed }) => [styles.plusButton, pressed && styles.pressed]}
              >
                <Plus size={21} color={colors.textSecondary} />
                {hasActiveGoal ? <View style={styles.plusBadge} /> : null}
              </Pressable>

              <TextInput
                ref={composerRef}
                accessibilityLabel="Message Koryphaios"
                value={value}
                onChangeText={setValue}
                multiline
                editable={draftsReady && !composerBlocked}
                placeholder={!draftsReady ? 'Restoring your messages' : composerBlocked ? 'Answer Kory first' : 'Message Koryphaios'}
                placeholderTextColor={colors.textMuted}
                style={styles.composerInput}
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Model ${modelDisplay}`}
                onPress={() => router.push('/model')}
                style={({ pressed }) => [styles.modelButton, pressed && styles.pressed]}
              >
                <Text numberOfLines={1} style={styles.modelButtonText}>{modelLabel}</Text>
                <ChevronDown size={12} color={colors.textMuted} />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  composerAction === 'stop'
                    ? 'Stop Koryphaios'
                    : composerAction === 'waiting'
                      ? activeRun?.waitingReason
                        ? `Waiting on ${activeRun.waitingReason}. Cancel wait`
                        : 'Waiting. Cancel wait'
                      : 'Send'
                }
                disabled={composerAction === 'disabled' || ((composerAction === 'stop' || composerAction === 'waiting') && !stopEnabled)}
                onPress={() => composerAction === 'send' ? void send() : void stopRun()}
                style={({ pressed }) => [
                  styles.sendButton,
                  (composerAction === 'disabled' || stopping) && styles.disabled,
                  pressed && composerAction !== 'disabled' && !stopping ? styles.pressed : null,
                ]}
              >
                {composerAction === 'stop' || composerAction === 'waiting' ? (
                  <Square size={14} color={colors.onAccent} fill={colors.onAccent} />
                ) : (
                  <Send size={17} color={colors.onAccent} />
                )}
              </Pressable>
            </View>
          </KeyboardStickyView>
        </View>
      </View>
      <MobileContextPopover visible={contextOpen || contextRouteOpen} onClose={closeContext} />
      <ComposerMenu
        visible={composerMenuOpen}
        recording={recording}
        onClose={() => setComposerMenuOpen(false)}
        onFiles={() => void addAttachments()}
        onPasteImage={() => void pasteClipboardImage()}
        onReferences={openWorkspaceReferences}
        onVoice={() => void startDictation()}
        onTemplate={insertPromptTemplate}
        onClearView={composerOnly ? undefined : clearChatView}
      />
      <ImageInputFallbackModal
        key={pendingImageSend?.attempt.id ?? 'idle'}
        pending={pendingImageSend && composerDrafts.canContinue(pendingImageSend.attempt) ? pendingImageSend : null}
        onAllow={(remember) => void resolveImageSend('allow', remember)}
        onChooseModel={() => {
          if (pendingImageSend) composerDrafts.cancel(pendingImageSend.attempt);
          setPendingImageSend(null);
          router.push('/model');
        }}
        onOmit={(remember) => void resolveImageSend('omit', remember)}
        onClose={() => {
          if (pendingImageSend) composerDrafts.cancel(pendingImageSend.attempt);
          setPendingImageSend(null);
        }}
      />
      <RemoteAgentConsentModal
        pending={pendingRemoteAgentSend && composerDrafts.canContinue(pendingRemoteAgentSend.draft.attempt) ? pendingRemoteAgentSend : null}
        onConfirm={() => void confirmRemoteAgentSend()}
        onClose={() => {
          if (pendingRemoteAgentSend) composerDrafts.cancel(pendingRemoteAgentSend.draft.attempt);
          setPendingRemoteAgentSend(null);
        }}
      />
      <ReferencePicker
        visible={referenceOpen}
        files={referenceFiles}
        query={referenceQuery}
        loading={referenceLoading}
        error={referenceError}
        onQueryChange={changeReferenceQuery}
        onSearch={() => void loadWorkspaceReferences()}
        onSelect={selectWorkspaceReference}
        onClose={closeWorkspaceReferences}
      />
      {messageMenu && messageMenu.lease.key === draftKey && composerDrafts.isActive(messageMenu.lease) ? (
        <MessageActionsPopover
          key={messageMenu.id}
          origin={messageMenu}
          onClose={() => setMessageMenu((current) => current === messageMenu ? null : current)}
          onListen={listenToMessage}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  embeddedComposer: { flex: 0 },
  savedDraft: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  savedDraftMessage: { color: colors.textPrimary, fontSize: 13 },
  savedDraftPreview: { color: colors.textMuted, fontSize: 12 },
  savedDraftActions: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  savedDraftAction: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  root: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.surface1,
  },
  workspaceRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    backgroundColor: colors.surface1,
  },
  chatPane: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface1,
  },
  header: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface1,
  },
  headerTablet: {
    paddingHorizontal: spacing.xl,
  },
  headerWindowedIPad: {
    minHeight: 96,
    paddingTop: 42,
  },
  headerTitleButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  headerTitle: {
    maxWidth: '92%',
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: 2,
  },
  headerStatus: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.xs,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  attentionButton: {
    position: 'relative',
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  attentionBadge: {
    position: 'absolute',
    right: 8,
    top: 7,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  feed: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.surface1,
  },
  feedContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  feedContentTablet: {
    paddingHorizontal: spacing.xl,
  },
  feedContentWide: {
    paddingHorizontal: spacing.xxl,
  },
  userMessageRow: {
    width: '100%',
    alignItems: 'flex-end',
  },
  hiddenMessageRow: {
    minHeight: 30,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  hiddenMessageText: {
    color: colors.textMuted,
    fontSize: typography.xs,
  },
  userBubble: {
    maxWidth: '88%',
    borderRadius: 19,
    borderBottomRightRadius: 7,
    backgroundColor: colors.accentSofter,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  managerMessage: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  managerMessageCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  messageText: {
    color: colors.textPrimary,
    fontSize: typography.base,
    lineHeight: 22,
  },
  messagePressed: {
    opacity: 0.72,
  },
  messageMenuOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  messageMenu: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: 4,
  },
  variantBlock: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  messageMenuLabel: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  variantStrip: {
    gap: spacing.xs,
  },
  variantButton: {
    minWidth: 38,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.surface3,
  },
  variantButtonActive: {
    backgroundColor: colors.accentSoft,
  },
  variantButtonText: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '800',
  },
  variantButtonTextActive: {
    color: colors.accent,
  },
  messageMenuRow: {
    minHeight: 50,
    borderRadius: 16,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  messageMenuText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  messageMenuDanger: {
    color: colors.error,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  emptyFeed: {
    flex: 1,
    minHeight: 220,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyFeedTitle: {
    color: colors.textPrimary,
    fontSize: typography.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyFeedDescription: {
    maxWidth: 350,
    color: colors.textSecondary,
    fontSize: typography.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyFeedActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  emptyFeedPrimary: {
    minHeight: 44,
    minWidth: 124,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyFeedPrimaryText: { color: colors.onAccent, fontWeight: '700', fontSize: typography.sm },
  emptyFeedSecondary: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyFeedSecondaryText: { color: colors.textSecondary, fontWeight: '700', fontSize: typography.sm },
  composerWrap: {
    paddingHorizontal: spacing.sm,
    paddingTop: 5,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface1,
  },
  composerWrapTablet: {
    paddingHorizontal: spacing.xl,
  },
  composerError: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    marginBottom: 4,
    paddingHorizontal: spacing.sm,
    color: colors.error,
    fontSize: typography.xs,
  },
  recordingPill: {
    minHeight: 32,
    alignSelf: 'center',
    marginBottom: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: 16,
    backgroundColor: colors.surface3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recordingText: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '600',
  },
  attachmentStrip: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    paddingBottom: 5,
    gap: 6,
  },
  attachmentChip: {
    maxWidth: 210,
    minHeight: 30,
    paddingLeft: spacing.sm,
    paddingRight: 4,
    borderRadius: 15,
    backgroundColor: colors.surface3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  attachmentName: {
    maxWidth: 160,
    color: colors.textSecondary,
    fontSize: typography.xs,
  },
  attachmentRemove: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composer: {
    width: '100%',
    maxWidth: 820,
    minHeight: 52,
    maxHeight: 150,
    alignSelf: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 24,
    backgroundColor: colors.surface3,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  plusButton: {
    position: 'relative',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusBadge: {
    position: 'absolute',
    right: 5,
    top: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  composerMenuOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.26)',
  },
  composerMenu: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    padding: spacing.sm,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: colors.surface2,
  },
  composerMenuRow: {
    minHeight: 50,
    paddingHorizontal: spacing.sm,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  referenceOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.26)',
  },
  referenceSheet: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '78%',
    alignSelf: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface2,
  },
  referenceHeader: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  referenceTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '800',
  },
  referenceClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referenceSearch: {
    minHeight: 44,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: 18,
    paddingLeft: spacing.sm,
    paddingRight: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface3,
  },
  referenceSearchInput: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: typography.sm,
  },
  referenceSearchButton: {
    minWidth: 52,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface4,
  },
  referenceSearchButtonText: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  referenceError: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
    color: colors.error,
    fontSize: typography.xs,
  },
  referenceList: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
    gap: 2,
  },
  referenceRow: {
    minHeight: 46,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  referencePath: {
    flex: 1,
    minWidth: 0,
    color: colors.textSecondary,
    fontSize: typography.xs,
    lineHeight: 17,
  },
  referenceEmpty: {
    padding: spacing.lg,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: typography.xs,
  },
  composerMenuText: {
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  imageOmitNotice: {
    minHeight: 28,
    alignSelf: 'flex-start',
    marginBottom: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: 14,
    backgroundColor: colors.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  imageOmitNoticeText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  imageFallbackOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  imageFallbackSheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface2,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  imageFallbackHeader: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  imageFallbackCopy: {
    flex: 1,
    minWidth: 0,
  },
  imageFallbackEyebrow: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  imageFallbackTitle: {
    marginTop: 3,
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '800',
  },
  imageFallbackBody: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: typography.xs,
    lineHeight: 18,
  },
  imageFallbackRow: {
    minHeight: 60,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  imageFallbackRowCopy: {
    flex: 1,
    minWidth: 0,
  },
  imageFallbackRowTitle: {
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  imageFallbackRowMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: typography.xs,
  },
  imageRememberRow: {
    minHeight: 48,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  imageRememberCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageRememberCheckActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  imageRememberText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  remoteAgentOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  remoteAgentSheet: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  remoteAgentTitle: {
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '800',
  },
  remoteAgentBody: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.sm,
    lineHeight: 20,
  },
  remoteAgentMeta: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: typography.xs,
    lineHeight: 17,
  },
  remoteAgentActions: {
    marginTop: spacing.md,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  remoteAgentButton: {
    minHeight: 42,
    borderRadius: 21,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remoteAgentButtonPrimary: {
    backgroundColor: colors.accent,
  },
  remoteAgentCancel: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  remoteAgentConfirm: {
    color: colors.onAccent,
    fontSize: typography.xs,
    fontWeight: '800',
  },
  composerInput: {
    flex: 1,
    minWidth: 70,
    minHeight: 40,
    maxHeight: 126,
    color: colors.textPrimary,
    fontSize: typography.base,
    lineHeight: 20,
    paddingHorizontal: 5,
    paddingVertical: 10,
  },
  modelButton: {
    maxWidth: 112,
    minWidth: 54,
    height: 40,
    paddingHorizontal: 8,
    borderRadius: 20,
    backgroundColor: colors.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  modelButtonText: {
    minWidth: 0,
    flexShrink: 1,
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  disabled: {
    opacity: 0.3,
  },
  pressed: {
    opacity: 0.68,
  },
  unpairedState: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  unpairedTitle: {
    color: colors.textPrimary,
    fontSize: typography.xl,
    fontWeight: '800',
    textAlign: 'center',
  },
  unpairedText: {
    maxWidth: 360,
    color: colors.textMuted,
    fontSize: typography.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  pairButton: {
    minHeight: 44,
    marginTop: spacing.xs,
    borderRadius: 22,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pairButtonText: {
    color: colors.onAccent,
    fontSize: typography.sm,
    fontWeight: '800',
  },
});
