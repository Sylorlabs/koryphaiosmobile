import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Archive,
  Bot,
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  FileText,
  FlaskConical,
  House,
  Image as ImageIcon,
  Keyboard,
  KeyRound,
  MemoryStick,
  Mic2,
  MonitorSmartphone,
  Palette,
  PlugZap,
  Search,
  Settings2,
  Users,
  Video,
} from 'lucide-react-native';
import { router } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { SettingActionReviewRegistry } from '../control/settingActionReviewRegistry';
import { settingActionReviewStorage } from '../control/settingActionReviewStorage';
import { breakpoints, colors, radii, spacing, type as typography } from '../theme/tokens';
import type { SettingAction, SettingField } from '../types/control';
import { ActionButton } from './ui';
import { ProviderSettingsView } from './ProviderSettingsView';
import { MachinesView } from './MachinesView';
import { VoicePreviewControl } from './VoicePreviewControl';
import { SkillsControlView } from './AgentControlViews';

const icons: Record<string, LucideIcon> = {
  providers: KeyRound,
  agent: Bot,
  devices: MonitorSmartphone,
  mcp: PlugZap,
  memory: MemoryStick,
  skills: Boxes,
  audio: Mic2,
  voice: Mic2,
  welcome: House,
  shortcuts: Keyboard,
  images: ImageIcon,
  video: Video,
  appearance: Palette,
  billing: CircleDollarSign,
  teams: Users,
  notes: FileText,
  archived: Archive,
  experimental: FlaskConical,
};

// Preserve action review locks across route changes and process restarts.
// Remote actions are sent only after their scoped review lock is durable.
const settingActionReviewLocks = new SettingActionReviewRegistry(settingActionReviewStorage);

function KorySwitch({
  label, value, onChange, disabled,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.switchHitTarget, (pressed || disabled) && styles.pressed]}
    >
      <View style={[styles.switchTrack, value && styles.switchTrackOn]}>
        <View style={[styles.switchThumb, value && styles.switchThumbOn]} />
      </View>
    </Pressable>
  );
}

function matchesSavedSetting(kind: SettingField['kind'], actual: string, expected: unknown): boolean {
  if (kind === 'json') {
    try {
      const normalize = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(normalize);
        if (value && typeof value === 'object') {
          return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, normalize(item)]));
        }
        return value;
      };
      return JSON.stringify(normalize(JSON.parse(actual))) === JSON.stringify(normalize(expected));
    } catch { return false; }
  }
  if (kind === 'list' && Array.isArray(expected)) {
    return actual.split('\n').map((item) => item.trim()).filter(Boolean).join('\n') === expected.join('\n');
  }
  if (kind === 'number' || kind === 'number-auto') {
    return expected === null ? actual === '' : actual.trim() !== '' && Number(actual) === expected;
  }
  return actual === String(expected ?? '');
}

function SettingControl({ field, owner }: { field: SettingField; owner: string }) {
  const { sendCommand, pairing, refresh } = useControl();
  const actionReviewKey = `${owner}\u0000${field.id}`;
  const hasRemoteAction = field.kind === 'action' || Boolean(field.actions?.length);
  // A live settings snapshot can change a non-action into a remote action.
  // Readiness must belong to the *current* control, never to a previous kind.
  const actionRevisionKey = `${actionReviewKey}\u0000${field.kind}\u0000${field.actions?.map((action) => action.id).join('\u0000') ?? ''}`;
  const mountedRef = useRef(true);
  const originalOwner = useRef(owner);
  const ownerRef = useRef(owner);
  useEffect(() => { ownerRef.current = owner; }, [owner]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const validOwner = () => mountedRef.current && ownerRef.current === originalOwner.current;
  const current = String(field.value ?? '');
  // Remote snapshots arrive while a setting is being edited. Keep the local
  // draft and the value it was based on so a concurrent desktop edit cannot
  // silently replace it or be overwritten by a stale Save.
  const [edit, setEdit] = useState<{ text: string; base: string } | null>(null);
  const draft = edit?.text ?? current;
  const dirty = draft !== current;
  const conflict = Boolean(edit && dirty && edit.base !== current);
  // An accepted command can outlive a failed state refresh. Retain the draft
  // and require host verification before allowing another write.
  const [awaiting, setAwaiting] = useState<{
    text: string; base: string; value: unknown; acknowledged: boolean; draftRevision: number;
  } | null>(null);
  const awaitingRef = useRef(awaiting);
  useEffect(() => { awaitingRef.current = awaiting; }, [awaiting]);
  const setPendingVerification = useCallback((next: typeof awaiting) => {
    awaitingRef.current = next;
    setAwaiting(next);
  }, []);
  // An action such as Reset/Delete has no single setting value that proves
  // completion. A timed-out request may already have run on the desktop.
  const [uncertainAction, setUncertainAction] = useState<{ label: string } | null>(
    () => settingActionReviewLocks.get(actionReviewKey),
  );
  const uncertainActionRef = useRef(uncertainAction);
  useEffect(() => { uncertainActionRef.current = uncertainAction; }, [uncertainAction]);
  const setActionForReview = useCallback((next: typeof uncertainAction) => {
    uncertainActionRef.current = next;
    setUncertainAction(next);
  }, []);
  const [reviewReadError, setReviewReadError] = useState('');
  const [reviewReadAttempt, setReviewReadAttempt] = useState(0);
  const [reviewReadyForKey, setReviewReadyForKey] = useState<string | null>(null);
  const reviewReady = !hasRemoteAction || reviewReadyForKey === actionRevisionKey;
  // A→B→A still invalidates an open confirmation, even though A is visible again.
  const previousDesktopValueRef = useRef(current);
  const desktopRevisionRef = useRef(0);
  const draftRevisionRef = useRef(0);
  const draftRef = useRef(draft);
  const latestValueRef = useRef(current);
  useEffect(() => {
    if (previousDesktopValueRef.current !== current) {
      previousDesktopValueRef.current = current;
      desktopRevisionRef.current += 1;
    }
    latestValueRef.current = current;
    draftRef.current = draft;
  }, [current, draft]);
  const setDraft = (text: string) => {
    if (pendingRef.current || awaitingRef.current) return;
    draftRevisionRef.current += 1;
    setEdit((previous) => text === current ? null : { text, base: previous?.base ?? current });
  };
  const [selectOpen, setSelectOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorError, setEditorError] = useState('');
  // Remote actions stay disabled until the current action identity has a
  // successful saved-lock read. A storage error never means "no lock".
  const [pending, setPending] = useState(false);
  const [writeError, setWriteError] = useState('');
  const [actionFeedback, setActionFeedback] = useState('');
  useEffect(() => {
    if (!awaiting) return;
    const confirmed = matchesSavedSetting(field.kind, current, awaiting.value);
    if (!confirmed && current === awaiting.base) return;
    // State change runs after the committed desktop snapshot, not synchronously in the effect.
    let active = true;
    queueMicrotask(() => {
      if (!active || awaitingRef.current !== awaiting) return;
      setPendingVerification(null);
      if (confirmed) {
        if (draftRevisionRef.current === awaiting.draftRevision) {
          setEdit((previous) => previous?.text === awaiting.text ? null : previous);
        }
        setWriteError('');
        setEditorError('');
      } else {
        setWriteError('Desktop reports another value after your request. Review it before saving again.');
      }
    });
    return () => { active = false; };
  }, [awaiting, current, field.kind, setPendingVerification]);
  // The ref closes the double-tap window before React commits disabled state.
  const pendingRef = useRef(false);
  useEffect(() => {
    if (!hasRemoteAction) return;
    let active = true;
    void settingActionReviewLocks.load(actionReviewKey).then((saved) => {
      if (!active) return;
      setActionForReview(settingActionReviewLocks.get(actionReviewKey) ?? saved);
      setReviewReadError('');
      setReviewReadyForKey(actionRevisionKey);
    }).catch(() => {
      if (!active) return;
      setReviewReadyForKey(null);
      setReviewReadError('Saved action status could not be read. Remote actions are locked until storage is available.');
    });
    return () => { active = false; };
  }, [actionReviewKey, actionRevisionKey, hasRemoteAction, reviewReadAttempt, setActionForReview]);
  const request = async (name: string, payload: Record<string, unknown>): Promise<string | null> => {
    if (!validOwner()) return 'This desktop selection is no longer active.';
    if (!reviewReady) return 'Saved action state is still being checked on this device.';
    if (awaitingRef.current) return 'Review the previous setting change before sending another request.';
    if (uncertainActionRef.current || settingActionReviewLocks.get(actionReviewKey)) return 'Review the previous action result before another setting change.';
    if (pendingRef.current) return 'A setting request is already in progress.';
    pendingRef.current = true;
    setPending(true);
    setWriteError('');
    try {
      const result = await sendCommand(name, payload);
      if (!result.accepted) {
        throw new Error('Desktop did not confirm the request. Check the current setting before retrying.');
      }
      return null;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not confirm the setting change.';
      setWriteError(message);
      return message;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };
  const update = (value: unknown) => request('setting.update', { settingId: field.id, value });
  const updateDirect = async (value: boolean | string) => {
    if (!validOwner() || pendingRef.current || awaitingRef.current || uncertainActionRef.current ||
      matchesSavedSetting(field.kind, latestValueRef.current, value)) return;
    const base = latestValueRef.current;
    const error = await update(value);
    if (!validOwner()) return;
    if (!matchesSavedSetting(field.kind, latestValueRef.current, value)) {
      setPendingVerification({ text: String(value), base, value, acknowledged: !error,
        draftRevision: draftRevisionRef.current });
    }
  };
  const updateDraft = async (text: string, expectedCurrent: string, expectedRevision = desktopRevisionRef.current): Promise<string | null> => {
    if (!validOwner() || awaitingRef.current || uncertainActionRef.current || pendingRef.current) return 'Review the desktop state before another setting change.';
    if (latestValueRef.current !== expectedCurrent || desktopRevisionRef.current !== expectedRevision) {
      const message = 'Desktop changed this setting again. Review the current value before saving.';
      setWriteError(message);
      if (field.kind === 'json' || field.kind === 'list') setEditorError(message);
      return message;
    }
    let parsed: unknown = text;
    try {
      if (field.kind === 'list') {
        parsed = text.split('\n').map((item) => item.trim()).filter(Boolean);
      } else if (field.kind === 'json') {
        parsed = JSON.parse(text || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Enter a JSON object.');
        }
      } else if (field.kind === 'number' || field.kind === 'number-auto') {
        if (!text.trim() && field.kind === 'number-auto') parsed = null;
        else if (!text.trim() || !Number.isFinite(Number(text.trim()))) {
          throw new Error('Enter a valid number.');
        } else parsed = Number(text.trim());
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Invalid value';
      setWriteError(message);
      if (field.kind === 'json' || field.kind === 'list') setEditorError(message);
      return message;
    }
    const draftRevision = draftRevisionRef.current;
    const error = await update(parsed);
    if (!validOwner()) return 'Desktop selection changed while saving.';
    if (error && (field.kind === 'json' || field.kind === 'list')) setEditorError(error);
    if (matchesSavedSetting(field.kind, latestValueRef.current, parsed)) {
      if (draftRevisionRef.current === draftRevision) {
        setEdit((previous) => previous?.text === text ? null : previous);
      }
    } else {
      setPendingVerification({ text, base: expectedCurrent, value: parsed, acknowledged: !error, draftRevision });
    }
    if (!error && (field.kind === 'json' || field.kind === 'list')) setEditorOpen(false);
    return error;
  };
  const confirmOverwriting = (save: (value: string, expected: string) => void) => {
    const expected = latestValueRef.current;
    const value = draft;
    const revision = draftRevisionRef.current;
    const desktopRevision = desktopRevisionRef.current;
    let confirmed = false;
    Alert.alert(
      `Overwrite ${field.label}?`,
      `The value changed on ${pairing?.machineName || 'the selected desktop'} while you were editing. Your draft will replace that newer value.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Overwrite', style: 'destructive', onPress: () => {
          if (confirmed || !validOwner() || pendingRef.current || awaitingRef.current || uncertainActionRef.current ||
            draftRevisionRef.current !== revision || draftRef.current !== value ||
            desktopRevisionRef.current !== desktopRevision) return;
          confirmed = true;
          save(value, expected);
        } },
      ],
    );
  };
  const conflictControls = conflict ? (
    <View style={styles.conflictArea}>
      <Text style={styles.inlineError}>Desktop changed this value while you were editing. Your draft is preserved.</Text>
      <View style={styles.controlActions}>
        <ActionButton
          label="Use desktop value"
          disabled={pending || Boolean(awaiting || uncertainAction)}
          onPress={() => {
            const revision = draftRevisionRef.current;
            Alert.alert('Discard your draft?', 'Your unsaved changes will be lost.', [
              { text: 'Keep draft', style: 'cancel' },
              { text: 'Discard', style: 'destructive', onPress: () => {
                if (validOwner() && draftRevisionRef.current === revision) {
                  draftRevisionRef.current += 1;
                  setEdit(null);
                }
              } },
            ]);
          }}
        />
        <ActionButton
          label="Overwrite desktop"
          danger
          disabled={pending || Boolean(awaiting || uncertainAction)}
          onPress={() => confirmOverwriting((value, expected) => {
            void updateDraft(value, expected);
          })}
        />
      </View>
    </View>
  ) : null;
  const confirmAction = (label: string, run: () => void) => {
    const expected = latestValueRef.current;
    const desktopRevision = desktopRevisionRef.current;
    const draftRevision = draftRevisionRef.current;
    let confirmed = false;
    Alert.alert(
      `${label} ${field.label}?`,
      `This changes ${pairing?.machineName || 'the selected desktop'}. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: label, style: 'destructive', onPress: () => {
          if (confirmed || !validOwner() || pendingRef.current || awaitingRef.current || uncertainActionRef.current ||
            latestValueRef.current !== expected || desktopRevisionRef.current !== desktopRevision ||
            draftRevisionRef.current !== draftRevision) return;
          confirmed = true;
          run();
        } },
      ],
    );
  };
  const performAction = (action?: SettingAction) => {
    if (!validOwner() || !reviewReady || pendingRef.current || awaitingRef.current || uncertainActionRef.current ||
      settingActionReviewLocks.get(actionReviewKey)) return;
    const label = action?.label ?? String(field.value ?? field.label);
    const run = () => {
      if (!validOwner() || !reviewReady || pendingRef.current || awaitingRef.current || uncertainActionRef.current) return;
      const review = settingActionReviewLocks.reserve(actionReviewKey, label);
      if (!review) return;
      pendingRef.current = true;
      setPending(true);
      setActionForReview(review);
      void (async () => {
        let saved = false;
        try {
          setActionFeedback(`Preparing ${label}…`);
          // The persistent review lock must be committed BEFORE network send.
          await settingActionReviewLocks.persist(actionReviewKey, review);
          saved = true;
          if (!validOwner()) return;
          setActionFeedback(`Requesting ${label}…`);
          const result = await sendCommand('setting.action', action
            ? { settingId: field.id, actionId: action.id, value: draft }
            : { settingId: field.id });
          if (!validOwner()) return;
          if (!result.accepted) throw new Error('Desktop did not confirm the request.');
          setActionFeedback(`Desktop accepted ${label}. Check its current state to confirm the result.`);
        } catch {
          if (!validOwner()) return;
          if (!saved) {
            setWriteError('Could not save the action review on this device. No desktop request was sent.');
            setActionFeedback('Action blocked until its review state can be saved.');
          } else {
            setActionFeedback('Desktop action result could not be confirmed.');
          }
        } finally {
          pendingRef.current = false;
          if (validOwner()) setPending(false);
        }
      })();
    };
    if (action?.tone === 'danger' || (!action && field.id.endsWith('.reset'))) {
      confirmAction(action?.label ?? 'Reset', run);
    } else {
      run();
    }
  };
  const inlineError = writeError ? <Text style={styles.inlineError}>{writeError}</Text> : null;
  const actionResult = actionFeedback ? <Text style={styles.actionFeedback}>{actionFeedback}</Text> : null;
  const awaitingControls = awaiting ? (
    <View style={styles.conflictArea}>
      <Text style={styles.inlineError}>
        {awaiting.acknowledged
          ? 'Desktop accepted the request, but its current value is not confirmed. Refresh and check the result before attempting another change.'
          : 'Desktop did not confirm the request. It may already have applied your change. Refresh and check before trying again.'}
      </Text>
      <View style={styles.controlActions}>
        <ActionButton label="Refresh desktop value" onPress={() => {
          void refresh().catch(() => setWriteError('Could not refresh the desktop value. Try again when connected.'));
        }} />
        <ActionButton label="Review uncertain change" onPress={() => {
          const revision = draftRevisionRef.current;
          const reviewed = awaiting;
          Alert.alert(
            'Desktop value not confirmed',
            'The request may already have been applied. Check the desktop before submitting another value.',
            [
              { text: 'Keep waiting', style: 'cancel' },
              { text: 'Allow editing', onPress: () => {
                if (!validOwner() || draftRevisionRef.current !== revision || awaitingRef.current !== reviewed) return;
                setPendingVerification(null);
                setWriteError('Result still unverified. Check desktop before saving again.');
              } },
            ],
          );
        }} />
      </View>
    </View>
  ) : null;
  const uncertainActionControls = uncertainAction ? (
    <View style={styles.conflictArea}>
      <Text style={styles.inlineError}>
        {`${uncertainAction.label} may have run on the desktop. Check its actual result before attempting another action.`}
      </Text>
      <View style={styles.controlActions}>
        <ActionButton label="Refresh desktop value" onPress={() => {
          void refresh().catch(() => setWriteError('Could not refresh the desktop value. Try again when connected.'));
        }} />
        <ActionButton label="Review action result" disabled={pending} onPress={() => {
          const reviewed = uncertainAction;
          Alert.alert(
            'Action result unverified',
            `Check ${pairing?.machineName || 'the selected desktop'} before allowing another attempt. Repeating this action may have unintended effects.`,
            [
              { text: 'Keep locked', style: 'cancel' },
              { text: 'Enable another attempt', style: 'destructive', onPress: () => {
                if (!validOwner() || pendingRef.current || uncertainActionRef.current !== reviewed) return;
                pendingRef.current = true;
                setPending(true);
                void settingActionReviewLocks.release(actionReviewKey, reviewed).then((released) => {
                  if (!validOwner()) return;
                  if (released) {
                    setActionForReview(null);
                    setWriteError('Previous action outcome remains unverified. Confirm the desktop state before retrying.');
                  }
                }).catch(() => {
                  if (validOwner()) setWriteError('Could not clear the saved review lock. The action remains disabled.');
                }).finally(() => {
                  pendingRef.current = false;
                  if (validOwner()) setPending(false);
                });
              } },
            ],
          );
        }} />
      </View>
    </View>
  ) : null;
  const actionStorageErrorControls = reviewReadError ? (
    <View style={styles.conflictArea}>
      <Text style={styles.inlineError}>{reviewReadError}</Text>
      <ActionButton label="Retry saved action check" onPress={() => {
        setReviewReadyForKey(null);
        setReviewReadAttempt((attempt) => attempt + 1);
      }} />
    </View>
  ) : null;

  const controlDisabled = pending || !reviewReady || Boolean(awaiting || uncertainAction);

  const rowActions = field.actions?.map((action) => (
    <ActionButton
      key={action.id}
      label={action.label}
      primary={action.tone === 'primary'}
      danger={action.tone === 'danger'}
      disabled={controlDisabled}
      onPress={() => performAction(action)}
    />
  ));

  if (field.kind === 'toggle') {
    return <View><KorySwitch label={field.label} value={field.value === true} disabled={controlDisabled} onChange={(value) => void updateDirect(value)} />{awaitingControls}{uncertainActionControls}{actionStorageErrorControls}{inlineError}</View>;
  }

  if (field.kind === 'select') {
    const options = field.options ?? [];
    return (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${field.label}: ${String(field.value ?? 'Not selected')}`}
          accessibilityState={{ disabled: controlDisabled, expanded: selectOpen }}
          disabled={controlDisabled}
          onPress={() => setSelectOpen((open) => !open)}
          style={({ pressed }) => [styles.selectControl, pressed && styles.pressed]}
        >
          <Text numberOfLines={1} style={styles.selectText}>{String(field.value ?? '')}</Text>
          <ChevronDown size={14} color={colors.textMuted} />
        </Pressable>
        <Modal
          transparent
          animationType="fade"
          visible={selectOpen}
          onRequestClose={() => setSelectOpen(false)}
        >
          <SafeAreaView style={styles.selectBackdrop} edges={['left', 'right', 'bottom']}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close options"
              onPress={() => setSelectOpen(false)}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.selectSheet}>
              <Text numberOfLines={1} style={styles.selectSheetTitle}>{field.label}</Text>
              <ScrollView contentContainerStyle={styles.selectOptions}>
                {options.map((option) => {
                  const active = option === String(field.value ?? '');
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      accessibilityLabel={`${field.label}: ${option}`}
                      accessibilityState={{ selected: active, disabled: controlDisabled }}
                      disabled={controlDisabled}
                      onPress={() => {
                        setSelectOpen(false);
                        if (!active) void updateDirect(option);
                      }}
                      style={({ pressed }) => [
                        styles.selectOption,
                        active && styles.selectOptionActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.selectOptionText, active && styles.selectOptionTextActive]}>{option}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </SafeAreaView>
        </Modal>
        {awaitingControls}
        {uncertainActionControls}
        {actionStorageErrorControls}
        {inlineError}
      </View>
    );
  }

  if (field.kind === 'action') {
    return (
      <View style={styles.controlActions}>
        <ActionButton label={String(field.value ?? 'Open')} disabled={controlDisabled} onPress={() => performAction()} />
        {rowActions}
        {actionResult}
        {uncertainActionControls}
        {actionStorageErrorControls}
        {inlineError}
      </View>
    );
  }

  if (field.kind === 'readonly') {
    return (
      <View style={styles.controlActions}>
        {field.value !== undefined ? <Text style={styles.readonlyValue}>{String(field.value)}</Text> : null}
        {rowActions}
        {actionResult}
        {uncertainActionControls}
        {actionStorageErrorControls}
        {inlineError}
      </View>
    );
  }

  if (field.kind === 'list' || field.kind === 'json') {
    const itemCount =
      field.kind === 'list'
        ? draft.split('\n').map((item) => item.trim()).filter(Boolean).length
        : null;
    const saveStructured = async () => {
      setEditorError('');
      if (conflict) return;
      await updateDraft(draft, current);
    };

    return (
      <>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${field.label}`}
          accessibilityState={{ disabled: controlDisabled }}
          disabled={controlDisabled}
          onPress={() => {
            setEditorError('');
            setEditorOpen(true);
          }}
          style={({ pressed }) => [styles.structuredButton, pressed && styles.pressed]}
        >
          <Text style={styles.structuredButtonText}>
            {field.kind === 'list' ? `${itemCount} item${itemCount === 1 ? '' : 's'}` : 'Edit'}
          </Text>
          <ChevronRight size={14} color={colors.textMuted} />
        </Pressable>
        <Modal
          animationType="slide"
          visible={editorOpen}
          onRequestClose={() => { if (!pendingRef.current) setEditorOpen(false); }}
        >
          <SafeAreaView style={styles.structuredScreen}>
            <View style={styles.structuredHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel editing"
                accessibilityState={{ disabled: pending }}
                disabled={pending}
                onPress={() => setEditorOpen(false)}
                style={({ pressed }) => [styles.structuredHeaderButton, pressed && styles.pressed]}
              >
                <Text style={styles.structuredHeaderButtonText}>Cancel</Text>
              </Pressable>
              <Text numberOfLines={1} style={styles.structuredTitle}>{field.label}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Save ${field.label}`}
                accessibilityState={{ disabled: controlDisabled || conflict }}
                disabled={controlDisabled || conflict}
                onPress={() => void saveStructured()}
                style={({ pressed }) => [styles.structuredHeaderButton, pressed && styles.pressed]}
              >
                <Text style={[styles.structuredHeaderButtonText, styles.structuredSaveText]}>Save</Text>
              </Pressable>
            </View>
            <Text style={styles.structuredHelp}>
              {field.kind === 'list' ? 'One item per line' : 'Advanced policy object'}
            </Text>
            <TextInput
              accessibilityLabel={field.label}
              value={draft}
              onChangeText={setDraft}
              editable={!controlDisabled}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              textAlignVertical="top"
              style={[styles.structuredInput, field.kind === 'json' && styles.structuredInputMono]}
            />
            {editorError ? <Text style={styles.structuredError}>{editorError}</Text> : null}
            {conflictControls}
            {awaitingControls}
            {uncertainActionControls}
            {actionStorageErrorControls}
          </SafeAreaView>
        </Modal>
        {!editorOpen ? awaitingControls : null}
        {!editorOpen ? uncertainActionControls : null}
        {!editorOpen ? actionStorageErrorControls : null}
        {inlineError}
      </>
    );
  }

  const isNumber = field.kind === 'number' || field.kind === 'number-auto';
  const numberValid = !isNumber || (field.kind === 'number-auto' && !draft.trim()) ||
    (Boolean(draft.trim()) && Number.isFinite(Number(draft.trim())));
  const save = () => {
    if (!dirty || conflict || pendingRef.current || awaiting || uncertainAction || !numberValid) return;
    void updateDraft(draft, current);
  };

  return (
    <View style={styles.controlStack}>
      <View style={styles.editControl}>
        <TextInput
          accessibilityLabel={field.label}
          value={draft}
          onChangeText={setDraft}
          editable={!pending && !awaiting && !uncertainAction}
          onSubmitEditing={save}
          keyboardType={isNumber ? 'numbers-and-punctuation' : 'default'}
          returnKeyType="done"
          style={styles.textControl}
          placeholderTextColor={colors.textMuted}
        />
        <ActionButton
          label="Save"
      disabled={!dirty || conflict || !numberValid || controlDisabled}
          onPress={save}
        />
      </View>
      {rowActions?.length ? <View style={styles.controlActions}>{rowActions}</View> : null}
      {actionResult}
      {conflictControls}
      {awaitingControls}
      {uncertainActionControls}
      {inlineError}
    </View>
  );
}

export function SettingsSectionView({ sectionId, inRoute = false }: { sectionId: string; inRoute?: boolean }) {
  const { width, fontScale } = useWindowDimensions();
  const { snapshot, pairing } = useControl();
  const owner = pairing ? `${pairing.baseUrl}\u0000${pairing.machineId ?? ''}` : 'unpaired';
  const compact = width < breakpoints.medium;
  const section = snapshot.settingsSections.find((item) => item.id === sectionId);
  const fields = snapshot.settings.filter((field) => field.sectionId === sectionId);
  if (!section) return <View style={styles.empty}><Text style={styles.emptyText}>Setting section unavailable.</Text></View>;
  if (sectionId === 'providers') return <ProviderSettingsView showIntro={!compact} />;
  if (sectionId === 'devices') return <MachinesView />;
  if (sectionId === 'skills') return <SkillsControlView />;

  return (
    <ScrollView contentContainerStyle={styles.sectionContent}>
      {!compact ? (
        <View style={styles.sectionIntro}>
          {/* Routed sections already name the page in the native header. */}
          {!inRoute ? <Text style={styles.sectionHeading}>{section.label}</Text> : null}
          <Text style={styles.sectionDescription}>{section.description}</Text>
        </View>
      ) : null}

      <View style={styles.settingsCard}>
        {fields.length ? (
          fields.map((field) => {
            // Common one-tap controls can share a line with short labels on phones.
            // Keep stacked controls for long copy, narrow screens and large text.
            const inlineQuickControl = compact && width >= 375 && fontScale <= 1.15 &&
              !field.description && field.label.length <= 27 &&
              (field.kind === 'toggle' || field.kind === 'select');
            return <View key={field.id} style={[styles.fieldRow,
              compact && !inlineQuickControl && styles.fieldRowCompact,
              inlineQuickControl && styles.fieldRowQuick]}>
              <View style={styles.fieldCopy}>
                <Text style={styles.fieldLabel}>{field.label}</Text>
                {field.description ? <Text style={styles.fieldDescription}>{field.description}</Text> : null}
              </View>
              <View style={[styles.fieldControl,
                compact && !inlineQuickControl && styles.fieldControlCompact,
                inlineQuickControl && styles.fieldControlQuick]}>
                <SettingControl
                  key={`${owner}:${field.id}:${field.kind}:${field.actions?.map((action) => action.id).join(',') ?? ''}`}
                  owner={owner}
                  field={field}
                />
              </View>
            </View>;
          })
        ) : (
          <View style={styles.noFields}><Text style={styles.noFieldsText}>No settings here</Text></View>
        )}
      </View>
      {sectionId === 'voice' ? <VoicePreviewControl /> : null}
    </ScrollView>
  );
}

export function SettingsView() {
  const { width, height } = useWindowDimensions();
  const { snapshot } = useControl();
  const split = width >= breakpoints.threeColumn && height >= breakpoints.medium;
  const [selectedSection, setSelectedSection] = useState(snapshot.settingsSections[0]?.id ?? 'providers');
  const visibleSection = snapshot.settingsSections.some((section) => section.id === selectedSection)
    ? selectedSection : snapshot.settingsSections[0]?.id ?? selectedSection;
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return snapshot.settingsSections;
    return snapshot.settingsSections.filter((section) => {
      const sectionMatches = `${section.label} ${section.description}`.toLowerCase().includes(normalized);
      const fieldMatches = snapshot.settings.some(
        (field) => field.sectionId === section.id && `${field.label} ${field.description ?? ''}`.toLowerCase().includes(normalized),
      );
      return sectionMatches || fieldMatches;
    });
  }, [query, snapshot.settings, snapshot.settingsSections]);

  const open = (id: string) => {
    setSelectedSection(id);
    if (!split) router.push(`/settings/${id}`);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.settingsListPane, !split && styles.settingsListPaneSingle, split && styles.settingsListPaneSplit]}>
        <View style={styles.searchWrap}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            accessibilityLabel="Search settings"
            value={query}
            onChangeText={setQuery}
            placeholder="Search settings"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
        </View>
        <ScrollView contentContainerStyle={styles.settingsList}>
          {filtered.map((section) => {
            const Icon = icons[section.id] ?? Settings2;
            const active = split && visibleSection === section.id;
            return (
              <Pressable
                key={section.id}
                accessibilityRole="button"
                accessibilityLabel={section.label}
                accessibilityState={{ selected: split && visibleSection === section.id }}
                onPress={() => open(section.id)}
                style={({ pressed }) => [styles.sectionRow, active && styles.sectionRowActive, pressed && styles.pressed]}
              >
                <View style={[styles.sectionIcon, active && styles.sectionIconActive]}>
                  <Icon size={18} color={active ? colors.accent : colors.textMuted} strokeWidth={1.9} />
                </View>
                <View style={styles.sectionRowCopy}>
                  <Text style={[styles.sectionRowLabel, active && styles.sectionRowLabelActive]}>{section.label}</Text>
                  {split ? <Text numberOfLines={1} style={styles.sectionRowDetail}>{section.description}</Text> : null}
                </View>
                <ChevronRight size={16} color={colors.textMuted} />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {split ? (
        <View style={styles.settingsDetailPane}>
          <SettingsSectionView sectionId={visibleSection} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: colors.surface1,
  },
  settingsListPane: {
    flex: 1,
    minWidth: 0,
  },
  settingsListPaneSingle: {
    maxWidth: 760,
  },
  settingsListPaneSplit: {
    width: 360,
    flex: 0,
  },
  searchWrap: {
    minHeight: 44,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.sm,
    paddingVertical: spacing.xs,
  },
  settingsList: {
    padding: spacing.sm,
    gap: spacing.xxs,
    paddingBottom: spacing.huge,
  },
  sectionRow: {
    minHeight: 64,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionRowActive: {
    backgroundColor: colors.surface3,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  sectionIconActive: {
    backgroundColor: colors.accentSoft,
  },
  sectionRowCopy: {
    flex: 1,
    minWidth: 0,
  },
  sectionRowLabel: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  sectionRowLabelActive: { color: colors.textPrimary },
  sectionRowDetail: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: typography.xs,
  },
  settingsDetailPane: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface0,
  },
  sectionContent: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: spacing.xl,
    paddingBottom: spacing.huge,
  },
  sectionIntro: {
    paddingVertical: spacing.md,
  },
  sectionHeading: {
    marginTop: 6,
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
  },
  sectionDescription: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: typography.sm,
    lineHeight: 20,
  },
  settingsCard: {
    marginTop: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    paddingVertical: spacing.xxs,
  },
  fieldRow: {
    minHeight: 76,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  fieldRowCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  fieldRowQuick: {
    minHeight: 58,
    paddingVertical: spacing.xs,
  },
  fieldCopy: {
    flex: 1,
    minWidth: 0,
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  fieldDescription: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: typography.xs,
    lineHeight: 16,
  },
  fieldControl: {
    maxWidth: '44%',
    alignItems: 'flex-end',
  },
  fieldControlCompact: {
    maxWidth: '100%',
    width: '100%',
    alignItems: 'stretch',
  },
  fieldControlQuick: {
    maxWidth: '48%',
    alignItems: 'flex-end',
  },
  switchHitTarget: {
    minWidth: 48,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchTrack: {
    width: 46,
    height: 27,
    borderRadius: 14,
    padding: 3,
    justifyContent: 'center',
    backgroundColor: colors.surface4,
  },
  switchTrackOn: { backgroundColor: colors.accent },
  switchThumb: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: colors.textSecondary,
    transform: [{ translateX: 0 }],
  },
  switchThumbOn: {
    backgroundColor: colors.onAccent,
    transform: [{ translateX: 19 }],
  },
  selectControl: {
    minHeight: 44,
    minWidth: 120,
    maxWidth: 220,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface3,
  },
  selectBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  selectSheet: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '72%',
    borderRadius: radii.xxl,
    backgroundColor: colors.surface2,
    padding: spacing.sm,
  },
  selectSheetTitle: {
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  selectOptions: {
    paddingBottom: spacing.xs,
    gap: 2,
  },
  selectOption: {
    minHeight: 48,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  selectOptionActive: {
    backgroundColor: colors.accentSoft,
  },
  selectOptionText: {
    color: colors.textSecondary,
    fontSize: typography.xs,
  },
  selectOptionTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  selectText: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '600',
  },
  structuredButton: {
    minWidth: 108,
    minHeight: 38,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    backgroundColor: colors.surface3,
  },
  structuredButtonText: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  structuredScreen: {
    flex: 1,
    backgroundColor: colors.surface1,
  },
  structuredHeader: {
    minHeight: 52,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  structuredHeaderButton: {
    minWidth: 64,
    minHeight: 40,
    justifyContent: 'center',
  },
  structuredHeaderButtonText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  structuredTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '800',
    textAlign: 'center',
  },
  structuredSaveText: {
    color: colors.accent,
    textAlign: 'right',
  },
  structuredHelp: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    color: colors.textMuted,
    fontSize: typography.xs,
  },
  structuredInput: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    color: colors.textPrimary,
    fontSize: typography.sm,
    lineHeight: 21,
    padding: spacing.md,
  },
  structuredInputMono: {
    fontFamily: 'monospace',
  },
  structuredError: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    color: colors.error,
    fontSize: typography.xs,
  },
  inlineError: {
    marginTop: spacing.xs,
    color: colors.error,
    fontSize: typography.xs,
    lineHeight: 17,
  },
  actionFeedback: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    lineHeight: 17,
    flexShrink: 1,
  },
  conflictArea: {
    width: '100%',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  textControl: {
    flex: 1,
    minWidth: 120,
    minHeight: 38,
    borderRadius: radii.md,
    backgroundColor: colors.surface3,
    color: colors.textPrimary,
    fontSize: typography.sm,
    paddingHorizontal: spacing.sm,
  },
  editControl: {
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  controlStack: {
    gap: spacing.xs,
    alignItems: 'flex-end',
  },
  controlActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  readonlyValue: {
    maxWidth: 260,
    color: colors.textSecondary,
    fontSize: typography.xs,
    lineHeight: 17,
    textAlign: 'right',
  },
  noFields: { padding: spacing.lg },
  noFieldsText: { color: colors.textMuted, fontSize: typography.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textMuted, fontSize: typography.sm },
  pressed: { opacity: 0.7 },
});
