import { afterEach, expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createLinkedRemoteTransport, type LinkedDeviceRpc } from '../src/control/linkedRemoteTransport';
import { runCommandLifecycle, type CommandStatus } from '../src/control/commandLifecycle';
import type { RemoteTransportResponse } from '../src/control/remoteClient';
import type { MobileCommand, PairingTarget, RemoteBinaryFile } from '../src/types/control';

// Only appearance I/O is replaced. Both RemoteClient and the linked RPC adapter
// are real; the subprocess prevents Bun module mocks leaking into other suites.
if (process.env.KORYPHAIOS_TRANSPORT_TEST_CHILD !== '1') {
  test('remote client: isolated direct and linked transport contracts', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORYPHAIOS_TRANSPORT_TEST_CHILD: '1' },
      encoding: 'utf8',
      timeout: 30_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Transport tests failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 35_000);
} else {
  mock.module('../src/theme/tokens', () => ({ applyAppearanceSettings: () => {} }));
  const { RemoteClient, isRemoteAuthError } = await import('../src/control/remoteClient');
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });
  const target: PairingTarget = {
    baseUrl: 'http://audit.invalid', token: 'audit-token',
    machineId: 'host-a', machineName: 'Audit host',
  };
  const rename: MobileCommand = {
    id: 'rename', name: 'session.rename', payload: { sessionId: 'chat-a', title: 'Renamed' },
  };
  const upload: MobileCommand = {
    id: 'upload', name: 'notes.import_file',
    payload: { name: 'note.md', mimeType: 'text/markdown', data: btoa('Note content') },
  };
  type Captured = { path: string; method: string; init?: RequestInit; host?: string; operation?: string; input?: Record<string, unknown>; timeout?: number };

  function harness(mode: 'direct' | 'linked', reply: RemoteTransportResponse) {
    const calls: Captured[] = [];
    if (mode === 'direct') {
      globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ path: new URL(String(url)).pathname, method: init?.method ?? 'GET', init });
        return new Response(reply.status === 204 ? null : reply.bodyEncoding === 'base64'
          ? Uint8Array.from(atob(reply.body ?? ''), (char) => char.charCodeAt(0))
          : reply.body, {
          status: reply.status,
          headers: {
            'content-type': reply.contentType ?? 'application/json',
            ...(reply.contentDisposition ? { 'content-disposition': reply.contentDisposition } : {}),
          },
        });
      }) as typeof fetch;
      return { calls, client: new RemoteClient(target) };
    }
    const rpc: LinkedDeviceRpc = async <T>(host: string, operation: string, input?: Record<string, unknown>, _signal?: AbortSignal, timeout?: number) => {
      calls.push({ path: String(input?.path), method: String(input?.method), host, operation, input, timeout });
      return reply as T;
    };
    return { calls, client: new RemoteClient(target, createLinkedRemoteTransport({
      hostId: target.machineId, defaultSessionId: 'fallback-chat', rpc,
    })) };
  }

  async function rejected(operation: Promise<unknown>): Promise<Error> {
    try { await operation; } catch (error) {
      expect(error).toBeInstanceOf(Error);
      return error as Error;
    }
    throw new Error('Expected the remote operation to reject');
  }

  const invalidBodies: [string, string | undefined][] = [
    ['HTML', '<html>login audit-secret</html>'], ['empty', ''], ['missing', undefined],
    ['whitespace', '  '], ['null', 'null'], ['boolean', 'true'], ['number', '42'],
    ['string', '"accepted"'], ['array', '[{"ok":true}]'], ['empty object', '{}'],
    ['error object', '{"error":"not accepted"}'], ['truncated JSON', '{"ok":true'],
    ['string flag', '{"ok":"true"}'], ['number flag', '{"ok":1}'],
    ['null flag', '{"ok":null}'], ['malformed success flag', '{"success":"true"}'],
    ['conflicting flag type', '{"ok":true,"success":"true"}'],
  ];

  for (const mode of ['direct', 'linked'] as const) {
    for (const [label, body] of invalidBodies) {
      test(`${mode}: ${label} never confirms a mutation or replays it`, async () => {
        const { client, calls } = harness(mode, { status: 200, body });
        const statuses: CommandStatus[] = [];
        let refreshes = 0;
        const error = await rejected(runCommandLifecycle({
          id: rename.id, name: rename.name,
          execute: () => client.command(rename),
          reconcile: async () => { refreshes++; },
          publish: (status) => statuses.push(status),
        }));
        expect(error.message).toContain('invalid acknowledgement');
        expect(error.message).not.toContain('audit-secret');
        expect(statuses.map((status) => status.state)).toEqual(['running', 'error']);
        expect(statuses.at(-1)?.acknowledgedAt).toBeUndefined();
        expect(refreshes).toBe(0);
        expect(calls).toHaveLength(1);
      });
    }

    test(`${mode}: a 204 is not the host's JSON mutation acknowledgement`, async () => {
      const { client } = harness(mode, { status: 204 });
      await expect(client.command(rename)).rejects.toThrow('invalid acknowledgement');
    });

    for (const flags of [{ ok: false }, { success: false }, { ok: true, success: false }]) {
      test(`${mode}: explicit rejection ${JSON.stringify(flags)} stays rejected`, async () => {
        const { client } = harness(mode, { status: 200, body: JSON.stringify({ ...flags, message: 'Revision changed' }) });
        await expect(client.command(rename)).rejects.toThrow('Revision changed');
      });
    }

    test(`${mode}: valid rename acknowledgement preserves chat and routing`, async () => {
      const { client, calls } = harness(mode, { status: 200, body: '{"ok":true,"data":{"id":"chat-a","title":"Renamed"}}' });
      expect(await client.command(rename)).toEqual({ accepted: true, sessionId: 'chat-a' });
      expect(calls).toHaveLength(1);
      expect(calls[0].path).toBe('/api/sessions/chat-a');
      expect(calls[0].method).toBe('PATCH');
      if (mode === 'linked') {
        expect(calls[0].host).toBe('host-a');
        expect(calls[0].operation).toBe('workbench');
        expect(calls[0].input).toEqual({ path: '/api/sessions/chat-a', method: 'PATCH', sessionId: 'chat-a', body: { title: 'Renamed' } });
      } else {
        expect(new Headers(calls[0].init?.headers).get('authorization')).toBe('Bearer audit-token');
      }
    });

    for (const [name, path, payload] of [
      ['goal.create', '/api/goals', { objective: 'Verify streaming', scope: 'session' }],
      ['checklist.create', '/api/checklists', { title: 'Verify streaming', scope: 'session' }],
    ] as const) {
      test(`${mode}: ${name} exposes its exact created ID for independent host readback`, async () => {
        const { client, calls } = harness(mode, {
          status: 200,
          body: JSON.stringify({ ok: true, data: { id: 'created-123', ...payload } }),
        });
        const result = await client.command({ id: `create-${name}`, name, payload }, 'session-a', 'project-a');
        expect(result).toEqual({ accepted: true, data: { id: 'created-123' } });
        expect(calls).toHaveLength(1);
        expect(calls[0].path).toBe(path);
        expect(calls[0].method).toBe('POST');
        if (mode === 'linked') expect(calls[0].host).toBe('host-a');
      });

      test(`${mode}: ${name} never invents an ID from an incomplete host acknowledgement`, async () => {
        const { client, calls } = harness(mode, {
          status: 200,
          body: JSON.stringify({ ok: true, data: { id: '' } }),
        });
        const result = await client.command({ id: `create-${name}-missing`, name, payload }, 'session-a', 'project-a');
        expect(result).toEqual({ accepted: true });
        expect(calls).toHaveLength(1);
      });
    }

    test(`${mode}: an acknowledgement without data remains valid for stop invite`, async () => {
      const { client } = harness(mode, { status: 200, body: '{"ok":true}' });
      expect(await client.command({ id: 'stop', name: 'device.stop_invite' })).toEqual({ accepted: true });
    });

    test(`${mode}: notes retain their success:true response contract`, async () => {
      const data = { fromId: 'note-a', toId: 'note-b', revision: 2 };
      const { client } = harness(mode, { status: 200, body: JSON.stringify({ success: true, data }) });
      expect(await client.command({ id: 'relationship', name: 'notes.relationship_create', payload: {
        fromId: 'note-a', toId: 'note-b', evidence: 'Related audit notes',
        expectedSourceRevision: 1, expectedTargetRevision: 1,
      } })).toEqual({ accepted: true, data });
    });

    for (const [name, path] of [
      ['notes.drafts', '/api/notes/drafts'],
      ['notes.relationships', '/api/notes/relationships'],
    ] as const) {
      test(`${mode}: ${name} accepts a complete host list`, async () => {
        const data = [{ id: 'draft-a', fromId: 'note-a', toId: 'note-b' }];
        const { client, calls } = harness(mode, { status: 200, body: JSON.stringify({ success: true, data }) });
        expect(await client.inspect(name)).toEqual(data);
        expect(calls).toHaveLength(1);
        expect(calls[0].path.startsWith(path)).toBe(true);
      });

      for (const [label, body] of [
        ['missing array', { success: true }],
        ['non-array data', { success: true, data: {} }],
        ['missing success flag', { data: [] }],
        ['host rejection with an empty array', { success: false, data: [] }],
      ] as const) {
        test(`${mode}: ${name} rejects ${label} instead of confirming an empty host state`, async () => {
          const { client } = harness(mode, { status: 200, body: JSON.stringify(body) });
          await expect(client.inspect(name)).rejects.toThrow();
        });
      }
    }

    test(`${mode}: note deletion retains optimistic revision without leaking privileged headers`, async () => {
      const note = { id: 'note-a', revision: 5 };
      const { client, calls } = harness(mode, { status: 200, body: JSON.stringify({ success: true, data: note }) });
      expect(await client.command({ id: 'delete-note', name: 'note.delete',
        payload: { noteId: 'note-a', expectedRevision: 4 },
      }, 'chat-a', 'project-a')).toEqual({ accepted: true, data: note });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ path: '/api/notes/note-a', method: 'DELETE' });
      if (mode === 'linked') {
        expect(calls[0].input).toEqual({
          path: '/api/notes/note-a', method: 'DELETE', sessionId: 'chat-a', noteRevision: 4,
        });
        expect(calls[0].input).not.toHaveProperty('headers');
      } else {
        const headers = new Headers(calls[0].init?.headers);
        expect(headers.get('x-kory-note-revision')).toBe('4');
        expect(headers.get('authorization')).toBe('Bearer audit-token');
      }
    });

    test(`${mode}: invalid note deletion revision does not dispatch`, async () => {
      const { client, calls } = harness(mode, { status: 200, body: '{"success":true}' });
      await expect(client.command({ id: 'delete-note', name: 'note.delete',
        payload: { noteId: 'note-a', expectedRevision: -1 },
      })).rejects.toThrow('current revision');
      expect(calls).toHaveLength(0);
    });

    test(`${mode}: raw object reads do not require a mutation envelope`, async () => {
      const summary = { sessionId: 'chat-a', totalCost: 4 };
      const { client } = harness(mode, { status: 200, body: JSON.stringify({ summary }) });
      expect(await client.inspect('billing.session', { sessionId: 'chat-a' })).toEqual(summary);
    });

    test(`${mode}: raw provider auth response stays compatible`, async () => {
      const response = { ok: true, authUrl: 'https://example.invalid/sign-in' };
      const { client } = harness(mode, { status: 200, body: JSON.stringify(response) });
      expect(await client.command({ id: 'auth', name: 'provider.auth.start', payload: { provider: 'audit-provider' } })).toEqual({ accepted: true, data: response });
    });

    for (const [label, body] of invalidBodies) {
      test(`${mode}: upload ${label} cannot claim completion`, async () => {
        const { client, calls } = harness(mode, { status: 200, body });
        await expect(client.command(upload, 'chat-a', 'project-a')).rejects.toThrow('invalid acknowledgement');
        expect(calls).toHaveLength(1);
      });
    }

    test(`${mode}: a valid upload preserves the form and origin`, async () => {
      const note = { id: 'note-a', title: 'Note' };
      const { client, calls } = harness(mode, { status: 200, body: JSON.stringify({ ok: true, data: note }) });
      expect(await client.command(upload, 'chat-a', 'project-a')).toEqual({ accepted: true, data: note });
      if (mode === 'linked') {
        expect(calls[0].input?.sessionId).toBe('chat-a');
        expect(calls[0].input?.form).toEqual({ parts: [{ name: 'file', filename: 'note.md', mimeType: 'text/markdown', base64: btoa('Note content') }] });
      } else {
        expect(calls[0].init?.body).toBeInstanceOf(FormData);
        expect(new Headers(calls[0].init?.headers).get('x-koryphaios-project')).toBe('project-a');
      }
    });

    for (const kind of ['command', 'upload', 'text', 'binary'] as const) {
      for (const status of [401, 403]) {
        test(`${mode}: non-JSON ${status} ${kind} preserves auth classification without leaking HTML`, async () => {
          const { client } = harness(mode, { status, body: '<html>audit-secret</html>', contentType: 'text/html' });
          const operation = kind === 'command' ? client.command(rename)
            : kind === 'upload' ? client.command(upload)
            : kind === 'text' ? client.inspect('note.export', { noteId: 'note-a' })
            : client.inspect('notes.vault_export');
          const error = await rejected(operation);
          expect(isRemoteAuthError(error)).toBe(status === 401);
          expect(error.message).toContain(String(status));
          expect(error.message).not.toContain('audit-secret');
        });
      }
      test(`${mode}: explicit AUTH_REQUIRED remains classified for ${kind}`, async () => {
        const { client } = harness(mode, { status: 403, body: '{"ok":false,"code":"AUTH_REQUIRED","error":"Session expired"}' });
        const operation = kind === 'command' ? client.command(rename)
          : kind === 'upload' ? client.command(upload)
          : kind === 'text' ? client.inspect('note.export', { noteId: 'note-a' })
          : client.inspect('notes.vault_export');
        expect(isRemoteAuthError(await rejected(operation))).toBe(true);
      });
    }

    test(`${mode}: successful text exports stay unchanged, including HTML note content`, async () => {
      const body = '<h1>My note</h1>';
      const { client } = harness(mode, { status: 200, contentType: 'text/html', body });
      expect(await client.inspect('note.export', { noteId: 'note-a' })).toBe(body);
    });

    test(`${mode}: successful binary exports preserve every byte and metadata`, async () => {
      const { client } = harness(mode, { status: 200, contentType: 'application/zip', bodyEncoding: 'base64',
        body: btoa('\x50\x4b\x00\xff'), contentDisposition: 'attachment; filename="notes.zip"' });
      const result = await client.inspect<RemoteBinaryFile>('notes.vault_export');
      expect(Array.from(result.bytes)).toEqual([80, 75, 0, 255]);
      expect(result.filename).toBe('notes.zip');
      expect(result.mimeType).toBe('application/zip');
    });

    test(`${mode}: structured errors redact bearer credentials`, async () => {
      const { client } = harness(mode, { status: 403, body: '{"error":"Denied Bearer audit-secret"}' });
      const error = await rejected(client.command(rename));
      expect(error.message).toBe('Denied Bearer [redacted]');
    });
  }

  test('linked note revision is scoped to DELETE /api/notes/:id with strict validation', async () => {
    const calls: Record<string, unknown>[] = [];
    const transport = createLinkedRemoteTransport({ hostId: 'host-a', defaultSessionId: 'chat-a',
      rpc: async <T>(_host: string, _operation: string, input?: Record<string, unknown>) => {
        calls.push(input ?? {});
        return { status: 200, body: '{"success":true}' } as T;
      },
    });
    const untrustedHeaders = {
      authorization: 'Bearer injected', 'x-koryphaios-project': '/private',
      'x-kory-note-revision': '5',
    };
    await transport.request('/api/notes/note-a', { method: 'DELETE', headers: untrustedHeaders }, 1000);
    expect(calls[0]).toEqual({ sessionId: 'chat-a', path: '/api/notes/note-a', method: 'DELETE', noteRevision: 5 });
    await transport.request('/api/notes/note-a', { method: 'PATCH', headers: untrustedHeaders }, 1000);
    expect(calls[1]).not.toHaveProperty('noteRevision');
    await transport.request('/api/git/status', { headers: untrustedHeaders }, 1000);
    expect(calls[2]).not.toHaveProperty('noteRevision');
    expect(calls.every((input) => !('headers' in input))).toBe(true);
    for (const bad of ['0', '-1', 'abc', '2.5', '9007199254740992', '']) {
      await expect(transport.request('/api/notes/note-a', {
        method: 'DELETE', headers: { 'x-kory-note-revision': bad },
      }, 1000)).rejects.toThrow('note revision');
    }
    expect(calls).toHaveLength(3);
  });
}
