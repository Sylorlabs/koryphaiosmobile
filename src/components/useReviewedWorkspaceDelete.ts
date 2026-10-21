import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { SettingActionReviewRegistry } from '../control/settingActionReviewRegistry';
import { workspaceDeletionReviewStorage } from '../control/workspaceDeletionReviewStorage';
import type { CommandResult, ControlSnapshot, PairingTarget } from '../types/control';

type DeleteKind = 'goal' | 'checklist';
type DeletionReceipt = {
  key: string;
  id: string;
  before: ControlSnapshot;
  hostId: string;
  projectId: string;
  sessionId: string;
};

// A screen remount or host A→B→A must never clear an uncertain delete.
// Serialize deletions per machine and resource type until the host confirms
// absence of the exact ID, or the user explicitly reviews that machine.
const reviews = new SettingActionReviewRegistry(workspaceDeletionReviewStorage);
const sending = new Set<string>();
const releasing = new Set<string>();

function deletionKey(kind: DeleteKind, snapshot: ControlSnapshot, pairing: PairingTarget | null): string {
  if (!pairing?.machineId || !snapshot.machine.id || snapshot.machine.id === 'unpaired' ||
    pairing.machineId !== snapshot.machine.id) return '';
  return JSON.stringify(['workspace.delete', pairing.baseUrl, pairing.machineId, snapshot.machine.id, kind]);
}

/** Deletion is destructive on the desktop, and a lost response cannot be
 * distinguished from a successful delete. Persist a review before dispatch. */
export function useReviewedWorkspaceDelete({
  kind, snapshot, pairing, sendCommand,
}: {
  kind: DeleteKind;
  snapshot: ControlSnapshot;
  pairing: PairingTarget | null;
  sendCommand: (name: string, payload?: Record<string, unknown>) => Promise<CommandResult>;
}) {
  const key = deletionKey(kind, snapshot, pairing);
  const [readyKey, setReadyKey] = useState('');
  const [armedId, setArmedId] = useState('');
  const [issue, setIssue] = useState<{ key: string; message: string } | null>(null);
  const [receipt, setReceipt] = useState<DeletionReceipt | null>(null);
  const [, bump] = useState(0);
  const activeKey = useRef(key);
  const mounted = useRef(true);
  const selectionSignature = `${key}\u0000${snapshot.activeProjectId}\u0000${snapshot.activeSessionId}`;
  const selection = useRef({ signature: selectionSignature, epoch: 0 });
  useLayoutEffect(() => {
    activeKey.current = key;
    if (selection.current.signature !== selectionSignature) {
      selection.current = { signature: selectionSignature, epoch: selection.current.epoch + 1 };
      setArmedId('');
    }
  }, [key, selectionSignature]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setReadyKey('');
      setIssue(null);
      setReceipt(null);
      setArmedId('');
    });
    if (!key) return () => { active = false; };
    void reviews.load(key).then(() => {
      if (!active || activeKey.current !== key) return;
      setReadyKey(key);
      bump((value) => value + 1);
    }).catch(() => {
      if (!active || activeKey.current !== key) return;
      setIssue({ key, message: 'Saved deletion status could not be read. Deletion is disabled until Keychain is available.' });
    });
    return () => { active = false; };
  }, [key]);

  useEffect(() => {
    if (!key || readyKey !== key || !receipt || receipt.key !== key || releasing.has(key)) return;
    // A changed object is evidence of a NEW read; the online status, exact
    // selection, and ID absence ensure that a failed/offline refresh cannot
    // masquerade as a completed host deletion.
    if (snapshot === receipt.before || snapshot.machine.status !== 'online' ||
      snapshot.machine.id !== receipt.hostId ||
      snapshot.activeProjectId !== receipt.projectId ||
      snapshot.activeSessionId !== receipt.sessionId ||
      (kind === 'goal' ? snapshot.goals : snapshot.checklists).some((item) => item.id === receipt.id)) return;
    const record = reviews.get(key);
    if (!record) return;
    releasing.add(key);
    queueMicrotask(() => {
      if (mounted.current && activeKey.current === key) bump((value) => value + 1);
    });
    void reviews.release(key, record).then((released) => {
      if (!released) throw new Error('Saved deletion review changed.');
      if (mounted.current && activeKey.current === key) {
        setReceipt(null);
        setIssue({ key, message: `${kind === 'goal' ? 'Goal' : 'Checklist'} deleted and verified on the desktop.` });
      }
    }).catch(() => {
      if (mounted.current && activeKey.current === key) {
        setIssue({ key, message: 'Desktop deletion was verified, but Keychain could not clear its saved lock. Review storage before trying another.' });
      }
    }).finally(() => {
      releasing.delete(key);
      if (mounted.current && activeKey.current === key) bump((value) => value + 1);
    });
  }, [key, kind, readyKey, snapshot, receipt]);

  const locked = Boolean(key && reviews.get(key));
  const busy = Boolean(key && (sending.has(key) || releasing.has(key)));
  const canDelete = Boolean(key && readyKey === key && !locked && !busy && snapshot.machine.status === 'online');

  const deleteItem = async (id: string, label: string) => {
    if (!canDelete || !id || !key) return;
    if (armedId !== id) {
      setArmedId(id);
      return;
    }
    setArmedId('');
    const record = reviews.reserve(key, `Delete ${kind} ${id}: ${label.slice(0, 300)}`);
    if (!record) return;
    const epoch = selection.current.epoch;
    const before = snapshot;
    const hostId = snapshot.machine.id;
    const projectId = snapshot.activeProjectId;
    const sessionId = snapshot.activeSessionId;
    sending.add(key);
    bump((value) => value + 1);
    setIssue(null);
    try {
      await reviews.persist(key, record);
      if (!mounted.current || activeKey.current !== key || selection.current.epoch !== epoch) {
        throw new Error('Machine or chat changed before the deletion was sent.');
      }
      const result = await sendCommand(kind === 'goal' ? 'goal.delete' : 'checklist.delete',
        { [kind === 'goal' ? 'goalId' : 'checklistId']: id });
      if (!result.accepted) throw new Error('Desktop did not accept the deletion.');
      if (mounted.current && activeKey.current === key && selection.current.epoch === epoch) {
        setReceipt({ key, id, before, hostId, projectId, sessionId });
        setIssue({ key, message: 'Desktop accepted deletion. Checking a fresh host list for the exact item…' });
      }
    } catch (caught) {
      if (mounted.current && activeKey.current === key) {
        setIssue({ key, message: `${caught instanceof Error ? caught.message : 'Deletion was not confirmed.'} Review the desktop before deleting again.` });
      }
    } finally {
      sending.delete(key);
      if (mounted.current && activeKey.current === key) bump((value) => value + 1);
    }
  };

  const reviewedDesktop = async () => {
    if (!key || readyKey !== key || sending.has(key) || releasing.has(key)) return;
    const record = reviews.get(key);
    if (!record) return;
    releasing.add(key);
    bump((value) => value + 1);
    try {
      if (!await reviews.release(key, record)) throw new Error('Saved deletion review changed.');
      if (mounted.current && activeKey.current === key) {
        setReceipt(null);
        setIssue(null);
      }
    } catch {
      if (mounted.current && activeKey.current === key) {
        setIssue({ key, message: 'Could not clear the saved deletion review. Another deletion is still blocked.' });
      }
    } finally {
      releasing.delete(key);
      if (mounted.current && activeKey.current === key) bump((value) => value + 1);
    }
  };

  const notice = issue?.key === key ? issue.message
    : !key ? 'Connect to the intended machine before deleting.'
    : readyKey !== key ? 'Checking saved deletion status…'
    : busy ? 'Saving or verifying the desktop deletion…'
    : locked ? `${reviews.get(key)?.label ?? 'Previous deletion'} may already have succeeded. Check the desktop before another deletion.`
    : '';

  return { armedId, deleteItem, canDelete, busy, notice,
    canReview: !!key && readyKey === key && locked && !busy,
    reviewedDesktop };
}
