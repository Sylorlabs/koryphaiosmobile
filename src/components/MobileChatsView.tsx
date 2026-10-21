import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { FolderOpen, MoreHorizontal, Plus, Trash2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useControl } from '../control/ControlProvider';
import { SettingActionReviewRegistry } from '../control/settingActionReviewRegistry';
import { settingActionReviewStorage } from '../control/settingActionReviewStorage';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import { StatusDot } from './ui';
import { MobileSurface } from './MobileSurface';

// Review locks are stored in the device Keychain before a non-idempotent
// session.create request. An accepted request can lose its reply or the app
// can be killed before the new session becomes visible in a snapshot.
const chatCreationReviews = new SettingActionReviewRegistry(settingActionReviewStorage);
// Delete-all affects the entire desktop, including other projects and archives.
// Its uncertain-result lock must therefore be scoped to the host, not a project.
const chatDeletionReviews = new SettingActionReviewRegistry(settingActionReviewStorage);

export function MobileChatsView() {
  const { snapshot, pairing } = useControl();
  // A host or project change starts a fresh action scope. The old instance's
  // pending responses cannot navigate or update feedback in the new one.
  const scopeKey = JSON.stringify([
    pairing?.baseUrl ?? '', pairing?.machineId ?? '', snapshot.machine.id, snapshot.activeProjectId,
  ]);
  const reviewKey = pairing?.machineId && snapshot.machine.id
    ? JSON.stringify(['session.create', pairing.baseUrl, pairing.machineId, snapshot.machine.id, snapshot.activeProjectId])
    : '';
  const deletionReviewKey = pairing?.machineId && snapshot.machine.id
    ? JSON.stringify(['session.delete_all', pairing.baseUrl, pairing.machineId, snapshot.machine.id])
    : '';
  return <ScopedMobileChatsView key={scopeKey} reviewKey={reviewKey} deletionReviewKey={deletionReviewKey} />;
}

function ScopedMobileChatsView({ reviewKey, deletionReviewKey }: { reviewKey: string; deletionReviewKey: string }) {
  const { snapshot, sendCommand, refresh, attentionSessionIds, live } = useControl();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const actionInFlight = useRef(false);
  const mounted = useRef(true);
  const [pendingAction, setPendingAction] = useState<'project' | 'select' | 'create' | 'delete' | null>(null);
  const [actionError, setActionError] = useState('');
  const [awaitingSelectedChat, setAwaitingSelectedChat] = useState<{
    id: string;
    projectId: string;
    title: string;
  } | null>(null);
  const selectedChatDismissed = useRef(false);
  // Creating a chat can succeed on the host even when the reply or subsequent
  // snapshot is lost. Keep the user here until the exact created chat is
  // independently visible and selected, and prevent an accidental duplicate.
  const [acceptedCreateId, setAcceptedCreateId] = useState<string | null>(
    () => reviewKey && chatCreationReviews.get(reviewKey) ? '' : null,
  );
  const createNeedsReview = useRef(Boolean(reviewKey && chatCreationReviews.get(reviewKey)));
  const createdChatDismissed = useRef(false);
  const reviewReleaseFlight = useRef(false);
  const [reviewReleasing, setReviewReleasing] = useState(false);
  const [reviewReady, setReviewReady] = useState(false);
  const [reviewLoadError, setReviewLoadError] = useState('');
  const [reviewLoadAttempt, setReviewLoadAttempt] = useState(0);
  const [deletionReviewReady, setDeletionReviewReady] = useState(false);
  const [deletionReviewLoadError, setDeletionReviewLoadError] = useState('');
  const [deletionReviewAttempt, setDeletionReviewAttempt] = useState(0);
  const [deletionNeedsReview, setDeletionNeedsReview] = useState(
    () => Boolean(deletionReviewKey && chatDeletionReviews.get(deletionReviewKey)),
  );
  const [deletionReviewReleasing, setDeletionReviewReleasing] = useState(false);
  const deletionReviewReleaseFlight = useRef(false);
  const deletionLocked = deletionNeedsReview || Boolean(deletionReviewKey && chatDeletionReviews.get(deletionReviewKey));
  const deleteDisabled = !deletionReviewKey || !deletionReviewReady || deletionLocked ||
    deletionReviewReleasing || pendingAction !== null;
  const sessions = snapshot.sessions.filter((session) => session.projectId === snapshot.activeProjectId);
  const createDisabled = !reviewKey || !reviewReady || pendingAction !== null ||
    acceptedCreateId !== null || reviewReleasing || Boolean(chatCreationReviews.get(reviewKey));

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!reviewKey) return;
    let active = true;
    void chatCreationReviews.load(reviewKey).then((saved) => {
      if (!active) return;
      const locked = Boolean(saved || chatCreationReviews.get(reviewKey));
      createNeedsReview.current = locked;
      setAcceptedCreateId(locked ? '' : null);
      setReviewLoadError('');
      setReviewReady(true);
    }).catch(() => {
      if (!active) return;
      setReviewLoadError('Saved chat status could not be read. Creation is disabled until it can be checked.');
      setReviewReady(false);
    });
    return () => { active = false; };
  }, [reviewKey, reviewLoadAttempt]);

  useEffect(() => {
    if (!deletionReviewKey) return;
    let active = true;
    void chatDeletionReviews.load(deletionReviewKey).then((saved) => {
      if (!active) return;
      setDeletionNeedsReview(Boolean(saved || chatDeletionReviews.get(deletionReviewKey)));
      setDeletionReviewLoadError('');
      setDeletionReviewReady(true);
    }).catch(() => {
      if (!active) return;
      setDeletionReviewLoadError('Saved deletion status could not be read. Another deletion is disabled until it can be checked.');
      setDeletionReviewReady(false);
    });
    return () => { active = false; };
  }, [deletionReviewKey, deletionReviewAttempt]);

  useEffect(() => {
    if (!acceptedCreateId || !reviewReady || createdChatDismissed.current) return;
    if (snapshot.activeSessionId !== acceptedCreateId ||
      !snapshot.sessions.some((session) => session.id === acceptedCreateId &&
        session.projectId === snapshot.activeProjectId)) return;
    const record = chatCreationReviews.get(reviewKey);
    if (!record) return;
    // The desktop snapshot must prove both identity and current selection.
    // Only then can the durable lock be cleared and Chats dismissed.
    createdChatDismissed.current = true;
    reviewReleaseFlight.current = true;
    queueMicrotask(() => {
      if (mounted.current) setReviewReleasing(true);
    });
    void chatCreationReviews.release(reviewKey, record).then((released) => {
      if (!released) throw new Error('The saved creation status changed.');
      if (mounted.current) router.back();
    }).catch(() => {
      if (mounted.current) setActionError('Could not clear the saved chat creation status. Check the chat list and retry the review.');
    }).finally(() => {
      reviewReleaseFlight.current = false;
      if (mounted.current) setReviewReleasing(false);
    });
  }, [reviewKey, reviewReady, acceptedCreateId, snapshot.activeSessionId, snapshot.activeProjectId, snapshot.sessions]);

  useEffect(() => {
    if (!awaitingSelectedChat || selectedChatDismissed.current) return;
    if (snapshot.activeSessionId !== awaitingSelectedChat.id ||
      snapshot.activeProjectId !== awaitingSelectedChat.projectId ||
      !snapshot.sessions.some((session) => session.id === awaitingSelectedChat.id &&
        session.projectId === awaitingSelectedChat.projectId)) return;
    selectedChatDismissed.current = true;
    router.back();
  }, [awaitingSelectedChat, snapshot.activeSessionId, snapshot.activeProjectId, snapshot.sessions]);

  const runAction = async (
    kind: NonNullable<typeof pendingAction>,
    action: (isCurrent: () => boolean) => Promise<void>,
    errorMessage: string,
  ) => {
    // Lock synchronously: a second tap can arrive before React re-renders.
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    const isCurrent = () => mounted.current;
    setPendingAction(kind);
    setActionError('');
    try {
      await action(isCurrent);
    } catch {
      if (isCurrent()) setActionError(errorMessage);
    } finally {
      actionInFlight.current = false;
      if (isCurrent()) setPendingAction(null);
    }
  };

  const selectProject = (projectId: string) => runAction('project', async () => {
    const sessionId = snapshot.sessions.find((session) => session.projectId === projectId)?.id;
    const result = await sendCommand('project.select', { projectId, sessionId });
    if (!result.accepted) throw new Error('Project selection rejected');
  }, 'The computer did not confirm the project change. Check the connection and retry.');

  const selectSession = (sessionId: string) => runAction('select', async (isCurrent) => {
    // A later selection supersedes any earlier accepted-but-unconfirmed choice.
    selectedChatDismissed.current = false;
    setAwaitingSelectedChat(null);
    const projectId = snapshot.activeProjectId;
    const title = sessions.find((session) => session.id === sessionId)?.title ?? 'the chat';
    const result = await sendCommand('session.select', { sessionId });
    if (!result.accepted) throw new Error('Chat selection rejected');
    // runCommandLifecycle can return accepted after its host-state refresh
    // failed or selected an obsolete chat. Confirm the exact current snapshot.
    if (isCurrent()) setAwaitingSelectedChat({ id: sessionId, projectId, title });
  }, 'The computer did not confirm the chat selection. Check the connection and retry.');

  const createChat = () => {
    if (!reviewKey || !reviewReady || createNeedsReview.current || chatCreationReviews.get(reviewKey)) return;
    return runAction('create', async (isCurrent) => {
      const record = chatCreationReviews.reserve(reviewKey, 'New chat');
      if (!record) {
        if (isCurrent()) {
          createNeedsReview.current = true;
          setAcceptedCreateId('');
        }
        return;
      }
      createNeedsReview.current = true;
      if (isCurrent()) setAcceptedCreateId('');
      let explicitlyRejected = false;
      try {
        // Must complete durable write before sending to avoid replay on crash.
        await chatCreationReviews.persist(reviewKey, record);
        const result = await sendCommand('session.create', { projectId: snapshot.activeProjectId });
        if (!result.accepted) {
          explicitlyRejected = true;
          await chatCreationReviews.release(reviewKey, record);
          if (isCurrent()) {
            createNeedsReview.current = false;
            setAcceptedCreateId(null);
          }
          throw new Error('Chat creation rejected');
        }
        if (isCurrent()) {
          setAcceptedCreateId(result.sessionId?.trim() ?? '');
        }
      } catch (caught) {
        // A network error can happen after the host created a chat.
        if (!explicitlyRejected && isCurrent()) {
          setAcceptedCreateId('');
        }
        throw caught;
      }
    }, 'A new chat was not confirmed. Check the chat list before retrying.');
  };

  const unlockReviewedCreate = async () => {
    if (!reviewKey || !reviewReady || actionInFlight.current || reviewReleaseFlight.current) return;
    const record = chatCreationReviews.get(reviewKey);
    if (!record) return;
    reviewReleaseFlight.current = true;
    setReviewReleasing(true);
    try {
      if (!await chatCreationReviews.release(reviewKey, record)) throw new Error('Saved review status changed.');
      if (!mounted.current) return;
      createNeedsReview.current = false;
      createdChatDismissed.current = false;
      setAcceptedCreateId(null);
      setActionError('');
    } catch {
      if (mounted.current) setActionError('Could not clear the saved chat creation status. Another chat is still disabled.');
    } finally {
      reviewReleaseFlight.current = false;
      if (mounted.current) setReviewReleasing(false);
    }
  };

  const unlockReviewedDeletion = async () => {
    if (!deletionReviewKey || !deletionReviewReady || actionInFlight.current || deletionReviewReleaseFlight.current) return;
    const record = chatDeletionReviews.get(deletionReviewKey);
    if (!record) return;
    deletionReviewReleaseFlight.current = true;
    setDeletionReviewReleasing(true);
    try {
      if (!await chatDeletionReviews.release(deletionReviewKey, record)) throw new Error('Saved deletion status changed.');
      if (!mounted.current) return;
      setDeletionNeedsReview(false);
      setDeleteArmed(false);
      setActionError('');
    } catch {
      if (mounted.current) setActionError('Could not clear the saved deletion status. Another deletion remains disabled.');
    } finally {
      deletionReviewReleaseFlight.current = false;
      if (mounted.current) setDeletionReviewReleasing(false);
    }
  };

  const deleteAll = () => {
    if (deleteDisabled || actionInFlight.current) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    return runAction('delete', async (isCurrent) => {
      const record = chatDeletionReviews.reserve(deletionReviewKey, 'Delete every chat on this desktop');
      if (!record) {
        if (isCurrent()) setDeletionNeedsReview(true);
        return;
      }
      if (isCurrent()) setDeletionNeedsReview(true);
      // Persist the lock *before* dispatch. The desktop can erase everything
      // and commit before its HTTP acknowledgement is lost or the app exits.
      await chatDeletionReviews.persist(deletionReviewKey, record);
      const result = await sendCommand('session.delete_all');
      if (!result.accepted) {
        // Only an explicit host rejection rules out execution. Even then,
        // storage-clear failure must keep deletion blocked.
        await chatDeletionReviews.release(deletionReviewKey, record);
        if (isCurrent()) setDeletionNeedsReview(false);
        throw new Error('Chat deletion rejected');
      }
      if (isCurrent()) {
        setMenuOpen(false);
        setDeleteArmed(false);
        // Acceptance alone does not prove archive/file cleanup or host state.
        // Keep the review lock until the user checks the desktop explicitly.
      }
    }, 'Chat deletion was not confirmed. Refresh the list before retrying.').finally(() => {
      if (mounted.current) setDeleteArmed(false);
    });
  };

  return (
    <MobileSurface
      title="Chats"
      right={(
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New chat"
            accessibilityState={{ disabled: createDisabled, busy: pendingAction === 'create' }}
            disabled={createDisabled}
            onPress={() => void createChat()}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          >
            <Plus size={20} color={colors.accent} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More chat controls"
            accessibilityState={{ disabled: pendingAction !== null }}
            disabled={pendingAction !== null}
            onPress={() => setMenuOpen(true)}
            style={({ pressed }) => [styles.moreHeaderButton, pressed && styles.pressed]}
          >
            <MoreHorizontal size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      )}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {actionError ? <Text accessibilityRole="alert" style={styles.actionError}>{actionError}</Text> : null}
        {reviewLoadError ? <Text accessibilityRole="alert" style={styles.actionError}>{reviewLoadError}</Text> : null}
        {deletionReviewLoadError ? <Text accessibilityRole="alert" style={styles.actionError}>{deletionReviewLoadError}</Text> : null}
        {!reviewReady && reviewKey ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry saved chat status"
            onPress={() => {
              setReviewLoadError('');
              setReviewLoadAttempt((attempt) => attempt + 1);
            }}
            style={({ pressed }) => [styles.reviewButton, pressed && styles.pressed]}
          >
            <Text style={styles.reviewText}>{reviewLoadError ? 'Retry saved chat status' : 'Checking saved chat status…'}</Text>
          </Pressable>
        ) : null}
        {!deletionReviewReady && deletionReviewKey ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry saved deletion status"
            onPress={() => {
              setDeletionReviewLoadError('');
              setDeletionReviewAttempt((attempt) => attempt + 1);
            }}
            style={({ pressed }) => [styles.reviewButton, pressed && styles.pressed]}
          >
            <Text style={styles.reviewText}>
              {deletionReviewLoadError ? 'Retry saved deletion status' : 'Checking saved deletion status…'}
            </Text>
          </Pressable>
        ) : null}
        {pendingAction ? (
          <Text style={styles.actionStatus}>
            {pendingAction === 'create' ? 'Creating chat…' : pendingAction === 'select' ? 'Opening chat…'
              : pendingAction === 'project' ? 'Switching project…' : 'Deleting chats…'}
          </Text>
        ) : null}
        {awaitingSelectedChat ? (
          <View style={styles.createReview}>
            <Text accessibilityRole="alert" style={styles.actionStatus}>
              Waiting for {awaitingSelectedChat.title} to be selected on this computer. Check the chat list if it does not open.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh chat list"
              accessibilityState={{ disabled: pendingAction !== null, busy: pendingAction === 'select' }}
              disabled={pendingAction !== null}
              onPress={() => void runAction('select', async () => { await refresh(); },
                'The chat list could not be refreshed. Check the connection and retry.')}
              style={({ pressed }) => [styles.reviewButton, pressed && styles.pressed]}
            >
              <Text style={styles.reviewText}>Refresh chat list</Text>
            </Pressable>
          </View>
        ) : null}
        {acceptedCreateId !== null ? (
          <View style={styles.createReview}>
            <Text accessibilityRole="alert" style={styles.actionStatus}>
              {acceptedCreateId
                ? 'Host accepted the new chat. Waiting for the exact chat to appear and become selected. Check the chat list before creating another.'
                : 'The desktop may have created a chat, but its identity was not confirmed. Check the chat list before creating another.'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reviewed chat list, allow another chat"
              accessibilityState={{ disabled: pendingAction !== null || reviewReleasing || !reviewReady, busy: reviewReleasing }}
              disabled={pendingAction !== null || reviewReleasing || !reviewReady}
              onPress={() => void unlockReviewedCreate()}
              style={({ pressed }) => [styles.reviewButton, pressed && styles.pressed]}
            >
              <Text style={styles.reviewText}>Reviewed chats — allow another</Text>
            </Pressable>
          </View>
        ) : null}
        {deletionLocked && deletionReviewReady ? (
          <View style={styles.createReview}>
            <Text accessibilityRole="alert" style={styles.deleteWarning}>
              Delete all chats needs review. The computer may already have erased them. Check active and archived chats on the desktop across all projects before allowing another deletion.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="I checked active and archived chats on desktop"
              accessibilityState={{ disabled: pendingAction !== null || deletionReviewReleasing, busy: deletionReviewReleasing }}
              disabled={pendingAction !== null || deletionReviewReleasing}
              onPress={() => void unlockReviewedDeletion()}
              style={({ pressed }) => [styles.reviewButton, pressed && styles.pressed]}
            >
              <Text style={styles.reviewText}>Reviewed both lists — allow deletion</Text>
            </Pressable>
          </View>
        ) : null}
        {snapshot.projects.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.projectStrip}
          >
            {snapshot.projects.map((project) => {
              const active = project.id === snapshot.activeProjectId;
              return (
                <Pressable
                  key={project.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Select project ${project.name}`}
                  accessibilityState={{ selected: active, disabled: pendingAction !== null }}
                  disabled={pendingAction !== null}
                  onPress={() => void selectProject(project.id)}
                  style={({ pressed }) => [styles.projectChip, active && styles.projectChipActive, pressed && styles.pressed]}
                >
                  <Text numberOfLines={1} style={[styles.projectText, active && styles.projectTextActive]}>
                    {project.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.list}>
          {sessions.map((session) => {
            const active = session.id === snapshot.activeSessionId;
            const attention = attentionSessionIds.includes(session.id);
            return (
              <Pressable
                key={session.id}
                accessibilityRole="button"
                accessibilityLabel={`Open chat ${session.title}`}
                accessibilityState={{ selected: active, disabled: pendingAction !== null }}
                disabled={pendingAction !== null}
                onPress={() => void selectSession(session.id)}
                style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && styles.pressed]}
              >
                <View style={styles.rowCopy}>
                  <Text numberOfLines={2} style={[styles.rowTitle, active && styles.rowTitleActive]}>
                    {session.title}
                  </Text>
                  {session.updatedAt ? <Text style={styles.rowMeta}>{session.updatedAt}</Text> : null}
                </View>
                {attention ? <View style={styles.attentionDot} /> : active ? (
                  <StatusDot status={live.connection === 'connected' ? 'online' : 'offline'} size={7} />
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Controls for ${session.title}`}
                  accessibilityState={{ disabled: pendingAction !== null }}
                  disabled={pendingAction !== null}
                  hitSlop={8}
                  onPress={(event) => {
                    event.stopPropagation();
                    router.push({
                      pathname: '/control/[kind]',
                      params: { kind: 'session', sessionId: session.id },
                    });
                  }}
                  style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}
                >
                  <MoreHorizontal size={18} color={colors.textMuted} />
                </Pressable>
              </Pressable>
            );
          })}
          {!sessions.length ? (
            <View style={styles.emptyChats}>
              <Text style={styles.empty}>No chats in this project</Text>
              <Text style={styles.emptyHint}>Start a conversation to control Koryphaios from this device.</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create first chat"
                accessibilityState={{ disabled: createDisabled, busy: pendingAction === 'create' }}
                disabled={createDisabled}
                onPress={() => void createChat()}
                style={({ pressed }) => [styles.firstChatButton, pressed && styles.pressed]}
              >
                <Plus size={17} color={colors.onAccent} />
                <Text style={styles.firstChatText}>Create chat</Text>
              </Pressable>
              {live.connection !== 'connected' ? (
                <Text style={styles.emptyHint}>Your computer must respond before a chat can be created.</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
      <Modal transparent animationType="fade" visible={menuOpen} onRequestClose={() => {
        setMenuOpen(false);
        setDeleteArmed(false);
      }}>
        <View style={styles.menuOverlay}>
          <Pressable
            accessibilityLabel="Close chat controls"
            onPress={() => {
              setMenuOpen(false);
              setDeleteArmed(false);
            }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.menuSheet, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            {actionError ? <Text accessibilityRole="alert" style={styles.actionError}>{actionError}</Text> : null}
            {deletionLocked && deletionReviewReady ? (
              <Text accessibilityRole="alert" style={styles.deleteWarning}>
                Another deletion is locked while the earlier result is checked. Close this menu to review the earlier deletion and confirm both active and archived chats on the desktop.
              </Text>
            ) : null}
            {!deletionReviewReady && deletionReviewKey ? (
              <Text style={styles.actionStatus}>Checking saved deletion status. Delete all is unavailable until this check succeeds.</Text>
            ) : null}
            {deleteArmed ? (
              <Text accessibilityRole="alert" style={styles.deleteWarning}>
                Permanently deletes every chat, including archived chats, across ALL projects on this desktop. This cannot be undone.
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open workspace controls"
              accessibilityState={{ disabled: pendingAction !== null }}
              disabled={pendingAction !== null}
              onPress={() => {
                setMenuOpen(false);
                setDeleteArmed(false);
                router.push('/control/workspace');
              }}
              style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
            >
              <FolderOpen size={18} color={colors.textSecondary} />
              <Text style={styles.menuText}>Workspace</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={deleteArmed ? 'Confirm permanent deletion of every desktop chat' : 'Delete all desktop chats'}
              accessibilityState={{ disabled: deleteDisabled, busy: pendingAction === 'delete' }}
              disabled={deleteDisabled}
              onPress={() => void deleteAll()}
              style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
            >
              <Trash2 size={18} color={colors.error} />
              <Text style={styles.menuDanger}>
                {pendingAction === 'delete' ? 'Deleting…' : deleteArmed ? 'Tap again to delete all chats' : 'Delete all chats'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </MobileSurface>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.huge,
  },
  actionError: {
    color: colors.error,
    fontSize: typography.sm,
    lineHeight: 20,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  actionStatus: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    paddingVertical: spacing.xs,
  },
  createReview: { paddingVertical: spacing.sm, gap: spacing.sm },
  reviewButton: {
    minHeight: 44,
    maxWidth: '100%',
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.accentSoft,
  },
  reviewText: { color: colors.accent, fontSize: typography.sm, fontWeight: '600' },
  deleteWarning: {
    color: colors.error,
    fontSize: typography.sm,
    lineHeight: 21,
    padding: spacing.sm,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  moreHeaderButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectStrip: {
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  projectChip: {
    maxWidth: 220,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: 17,
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  projectChipActive: {
    backgroundColor: colors.accentSoft,
  },
  projectText: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '600',
  },
  projectTextActive: {
    color: colors.accent,
  },
  list: {
    paddingTop: spacing.xs,
    gap: 3,
  },
  row: {
    minHeight: 60,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowActive: {
    backgroundColor: colors.surface2,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '600',
    lineHeight: 18,
  },
  rowTitleActive: {
    color: colors.textPrimary,
  },
  rowMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 10,
  },
  attentionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  moreButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    paddingTop: spacing.sm,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '700',
  },
  emptyChats: { minHeight: 210, justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  emptyHint: { maxWidth: 290, color: colors.textSecondary, fontSize: typography.sm, lineHeight: 20, textAlign: 'center' },
  firstChatButton: {
    minHeight: 44,
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  firstChatText: { color: colors.onAccent, fontSize: typography.sm, fontWeight: '700' },
  menuOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  menuSheet: {
    backgroundColor: colors.surface2,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  menuRow: {
    minHeight: 50,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  menuText: { color: colors.textSecondary, fontSize: typography.sm, fontWeight: '600' },
  menuDanger: { color: colors.error, fontSize: typography.sm, fontWeight: '700' },
  pressed: {
    opacity: 0.68,
  },
});
