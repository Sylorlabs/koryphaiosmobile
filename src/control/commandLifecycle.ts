import type { CommandResult } from '../types/control';

export type CommandStatus = {
  id: string;
  name: string;
  label: string;
  state: 'running' | 'accepted' | 'success' | 'warning' | 'error';
  message: string;
  startedAt: number;
  feedbackPublishedAt: number;
  sentAt?: number;
  acknowledgedAt?: number;
  reconciledAt?: number;
};

const labels: Record<string, string> = {
  'session.create': 'Create chat',
  'session.select': 'Open chat',
  'session.send_message': 'Send message',
  'session.rename': 'Rename chat',
  'session.archive': 'Archive chat',
  'session.delete': 'Delete chat',
  'session.delete_all': 'Delete chats',
  'session.compact': 'Compact context',
  'project.select': 'Select project',
  'workspace.open': 'Open workspace',
  'workspace.directory.create': 'Create folder',
  'agent.control': 'Control agent',
  'agent.message': 'Message agent',
  'voice.transcribe': 'Transcribe recording',
  'voice.synthesize': 'Generate speech',
  'native_command.run': 'Run command',
  'live.answer': 'Send answer',
  'live.review': 'Review changes',
};

const areas: Record<string, string> = {
  session: 'Chat', project: 'Project', workspace: 'Workspace', device: 'Device',
  context: 'Context', response_style: 'Response style', agent: 'Agent', skill: 'Skill',
  message: 'Message', workflow: 'Workflow', memory: 'Memory', note: 'Note', notes: 'Notes',
  collab: 'Collaboration', model_sharing: 'Model sharing', mcp: 'MCP server', media: 'Media',
  timetravel: 'Restore point', computer: 'Computer control', process: 'Process', goal: 'Goal',
  checklist: 'Checklist', git: 'Git', provider: 'Provider', setting: 'Settings',
};

export function commandLabel(name: string): string {
  return labels[name] ?? `${areas[name.split('.')[0]] ?? 'Remote control'} update`;
}

/** Retain concurrent operations by ID; bound completed, in-memory diagnostics. */
export function recordCommand(current: CommandStatus[], next: CommandStatus): CommandStatus[] {
  const index = current.findIndex((item) => item.id === next.id);
  const updated = index < 0
    ? [...current, next]
    : current.map((item, offset) => offset === index ? next : item);
  const completed = updated.filter((item) => item.state !== 'running').slice(-30);
  const retained = new Set(completed.map((item) => item.id));
  return updated.filter((item) => item.state === 'running' || retained.has(item.id));
}

/** Host acknowledgement is independent of the following read of host state. */
export async function runCommandLifecycle({
  id, name, execute, reconcile, publish, now = () => performance.now(),
}: {
  id: string;
  name: string;
  execute: () => Promise<CommandResult>;
  /** Return false when a stale selection prevents reading the current host state. */
  reconcile: (result: CommandResult) => Promise<void | boolean>;
  publish: (status: CommandStatus) => void;
  now?: () => number;
}): Promise<CommandResult> {
  const startedAt = now();
  let status: CommandStatus = {
    id, name, label: commandLabel(name), state: 'running',
    message: 'Sending request…', startedAt, feedbackPublishedAt: now(),
  };
  publish(status);
  let result: CommandResult;
  try {
    status = { ...status, sentAt: now() };
    result = await execute();
    if (!result.accepted) throw new Error('The host did not accept this request.');
  } catch (error) {
    publish({
      ...status, state: 'error',
      message: 'Request not confirmed. Check the host state before repeating the action.',
    });
    throw error;
  }

  status = { ...status, state: 'accepted', message: 'Host accepted the request. Checking its current state…', acknowledgedAt: now() };
  publish(status);
  try {
    const reconciled = await reconcile(result);
    if (reconciled === false) {
      publish({ ...status, message: 'Host accepted the request. Selection changed; check the result on the host.' });
    } else {
      publish({
        ...status, reconciledAt: now(),
        message: 'Host accepted the request. Latest state loaded; check the requested change.',
      });
    }
  } catch {
    publish({
      ...status, state: 'warning',
      message: 'Request accepted. State refresh failed; refresh to check the result. Do not repeat the action.',
    });
  }
  return result;
}

/** A request may update only the host and selection for which it was started. */
export class ControlRequestScope {
  private sequence = 0;
  private selection = 0;
  private active = true;

  constructor(readonly key = '') {}

  selectionVersion(): number { return this.selection; }

  beginCommand(changesSelection: boolean): number {
    this.sequence += 1;
    if (changesSelection) this.selection += 1;
    return this.selection;
  }

  beginSnapshot(): { sequence: number; selection: number } {
    return { sequence: ++this.sequence, selection: this.selection };
  }

  acceptsSelection(version: number): boolean {
    return this.active && version === this.selection;
  }

  acceptsSnapshot(ticket: { sequence: number; selection: number }): boolean {
    return this.acceptsSelection(ticket.selection) && ticket.sequence === this.sequence;
  }

  dispose(): void { this.active = false; }
}

export function changesSelection(name: string): boolean {
  return ['session.select', 'session.create', 'project.select', 'workspace.open',
    'workspace.deselect', 'workspace.clear', 'session.delete', 'session.delete_all'].includes(name);
}
