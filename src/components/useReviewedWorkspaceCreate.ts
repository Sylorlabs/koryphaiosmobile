import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { SettingActionReviewRegistry } from '../control/settingActionReviewRegistry';
import { workspaceCreationReviewStorage } from '../control/workspaceCreationReviewStorage';
import type { CommandResult, ControlSnapshot, GoalScope } from '../types/control';

type CreateKind = 'goal' | 'checklist';
type CreateReceipt = {
  id: string;
  value: string;
  revision: number;
  scope: GoalScope;
  projectId: string;
  sessionId: string;
};

const reviews = new SettingActionReviewRegistry(workspaceCreationReviewStorage);
const drafts = new Map<string, { value: string; revision: number }>();
const receipts = new Map<string, CreateReceipt>();
const sending = new Set<string>();
const releasing = new Set<string>();

function creationKey(machineId: string | undefined, kind: CreateKind): string {
  return machineId && machineId !== 'unpaired'
    ? `workspace-create\u0000${machineId}\u0000${kind}`
    : '';
}

function readCreatedId(result: CommandResult): string | null {
  const data = result.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const id = (data as { id?: unknown }).id;
  return typeof id === 'string' && id.trim() ? id : null;
}

function verifiedInSnapshot(kind: CreateKind, snapshot: ControlSnapshot, receipt: CreateReceipt): boolean {
  const items = kind === 'goal' ? snapshot.goals : snapshot.checklists;
  return items.some((item) => item.id === receipt.id &&
    item.scope === receipt.scope &&
    (kind === 'goal' ? (item as typeof snapshot.goals[number]).objective : (item as typeof snapshot.checklists[number]).title) === receipt.value &&
    (receipt.scope !== 'project' || item.projectPath === receipt.projectId) &&
    (receipt.scope !== 'session' || item.sessionId === receipt.sessionId));
}

/** Create commands are non-idempotent. Reserve durable review before sending
 * and release it only after the host snapshot contains the exact created ID. */
export function useReviewedWorkspaceCreate({
  kind, snapshot, sendCommand,
}: {
  kind: CreateKind;
  snapshot: ControlSnapshot;
  sendCommand: (name: string, payload?: Record<string, unknown>) => Promise<CommandResult>;
}) {
  const key = creationKey(snapshot.machine.id, kind);
  const [draft, setDraft] = useState(() => drafts.get(key)?.value ?? '');
  const [scope, setScope] = useState<GoalScope>('session');
  const [readyKey, setReadyKey] = useState('');
  const [issue, setIssue] = useState<{ key: string; message: string } | null>(null);
  const [version, setVersion] = useState(0);
  const activeKey = useRef(key);
  const mounted = useRef(true);

  const selectionSignature = `${key}\u0000${snapshot.activeProjectId}\u0000${snapshot.activeSessionId}\u0000${scope}`;
  const selection = useRef({ signature: selectionSignature, epoch: 0 });
  useLayoutEffect(() => {
    activeKey.current = key;
    if (selection.current.signature !== selectionSignature) {
      selection.current = { signature: selectionSignature, epoch: selection.current.epoch + 1 };
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
      setDraft(drafts.get(key)?.value ?? '');
    });
    if (!key) return () => { active = false; };
    void reviews.load(key).then((saved) => {
      if (!active || activeKey.current !== key) return;
      // The label preserves the original draft through a cold process restart,
      // while a later in-memory edit always takes precedence.
      const prefix = `Create ${kind}: `;
      if (!drafts.has(key) && saved?.label.startsWith(prefix)) {
        const value = saved.label.slice(prefix.length);
        drafts.set(key, { value, revision: 0 });
        setDraft(value);
      }
      setReadyKey(key);
      setVersion((value) => value + 1);
    }).catch(() => {
      if (!active || activeKey.current !== key) return;
      setIssue({ key, message: 'Saved creation status could not be read. Creating is disabled until storage is available.' });
    });
    return () => { active = false; };
  }, [key, kind]);

  useEffect(() => {
    if (!key || readyKey !== key || releasing.has(key)) return;
    const receipt = receipts.get(key);
    if (!receipt || !verifiedInSnapshot(kind, snapshot, receipt)) return;
    const review = reviews.get(key);
    if (!review) return;
    releasing.add(key);
    queueMicrotask(() => {
      if (mounted.current && activeKey.current === key) setVersion((value) => value + 1);
    });
    void reviews.release(key, review).then((released) => {
      if (!released) throw new Error('The saved creation review changed.');
      receipts.delete(key);
      const latest = drafts.get(key);
      if (latest?.revision === receipt.revision) {
        drafts.delete(key);
        if (mounted.current && activeKey.current === key) setDraft('');
      }
      if (mounted.current && activeKey.current === key) setIssue(null);
    }).catch(() => {
      if (mounted.current && activeKey.current === key) {
        setIssue({ key, message: 'Created item is visible, but its saved review could not be cleared. Try checking storage again.' });
      }
    }).finally(() => {
      releasing.delete(key);
      if (mounted.current) setVersion((value) => value + 1);
    });
  }, [key, kind, readyKey, snapshot, snapshot.goals, snapshot.checklists, version]);

  const onChangeDraft = (value: string) => {
    if (key) {
      const revision = (drafts.get(key)?.revision ?? 0) + 1;
      drafts.set(key, { value, revision });
    }
    setDraft(value);
  };

  const eligible = !!key && readyKey === key &&
    (scope === 'workspace' || scope === 'project' && !!snapshot.activeProjectId || scope === 'session' && !!snapshot.activeSessionId);
  const locked = Boolean(key && reviews.get(key));
  const busy = Boolean(key && (sending.has(key) || releasing.has(key)));
  const canCreate = eligible && !locked && !busy && !!draft.trim();

  const create = async () => {
    if (!canCreate || !key || reviews.get(key) || sending.has(key)) return;
    const value = draft.trim();
    const review = reviews.reserve(key, `Create ${kind}: ${value}`);
    if (!review) return;
    const epoch = selection.current.epoch;
    const source = { machineId: snapshot.machine.id, projectId: snapshot.activeProjectId, sessionId: snapshot.activeSessionId };
    const draftRevision = drafts.get(key)?.revision ?? 0;
    sending.add(key);
    setVersion((version) => version + 1);
    setIssue(null);
    try {
      await reviews.persist(key, review);
      // A delayed Keychain save must never redirect a request into a new host,
      // project, chat, or scope after the user has switched destinations.
      if (!mounted.current || activeKey.current !== key || selection.current.epoch !== epoch) {
        throw new Error('Selection changed before the request was sent. Review the saved attempt before retrying.');
      }
      const result = await sendCommand(
        kind === 'goal' ? 'goal.create' : 'checklist.create',
        { [kind === 'goal' ? 'objective' : 'title']: value, scope },
      );
      if (!result.accepted) throw new Error('The desktop rejected the creation request.');
      const id = readCreatedId(result);
      if (id) receipts.set(key, { id, value, revision: draftRevision, scope, ...source });
      if (mounted.current && activeKey.current === key) {
        setIssue({ key, message: id
          ? 'Desktop accepted the creation. Waiting for the exact item to appear in its list…'
          : 'Desktop accepted the request without an item ID. Check the desktop list before repeating it.' });
      }
    } catch (caught) {
      if (mounted.current && activeKey.current === key) {
        setIssue({ key, message: `${caught instanceof Error ? caught.message : 'Creation was not confirmed.'} Check the desktop before repeating.` });
      }
    } finally {
      sending.delete(key);
      if (mounted.current) setVersion((version) => version + 1);
    }
  };

  const reviewedDesktop = async () => {
    if (!key || readyKey !== key || sending.has(key) || releasing.has(key)) return;
    const review = reviews.get(key);
    if (!review) return;
    releasing.add(key);
    setVersion((value) => value + 1);
    try {
      if (!await reviews.release(key, review)) throw new Error('The saved creation status changed.');
      receipts.delete(key);
      if (mounted.current && activeKey.current === key) setIssue(null);
    } catch {
      if (mounted.current && activeKey.current === key) {
        setIssue({ key, message: 'Could not clear the saved creation review. Another request remains blocked.' });
      }
    } finally {
      releasing.delete(key);
      if (mounted.current) setVersion((value) => value + 1);
    }
  };

  const notice = issue?.key === key ? issue.message
    : !key ? 'Connect to a machine before creating.'
    : readyKey !== key ? 'Checking saved creation status…'
    : busy ? 'Sending creation request or verifying its saved status…'
    : receipts.has(key) ? 'Waiting for the created item to appear in the desktop list. Do not submit another.'
    : locked ? 'A previous creation might already exist. Check the desktop list before making another.'
    : !eligible ? 'Select a chat or project for this scope.'
    : '';

  return {
    draft, onChangeDraft, scope, setScope, create, canCreate, busy, notice,
    canReview: eligible && locked && !busy,
    reviewedDesktop,
  };
}
