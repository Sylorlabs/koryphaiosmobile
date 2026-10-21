import type { RemoteTransport, RemoteTransportFormPart, RemoteTransportResponse } from './remoteClient';

export type LinkedDeviceRpc = <T>(
  hostId: string,
  operation: string,
  input?: Record<string, unknown>,
  signal?: AbortSignal,
  timeoutMs?: number,
) => Promise<T>;

function bodyValue(body: BodyInit | null | undefined): unknown {
  if (body === undefined || body === null) return undefined;
  if (typeof body !== 'string') throw new Error('Remote controls require JSON request bodies.');
  if (!body) return undefined;
  try { return JSON.parse(body); }
  catch { return body; }
}

function inferSessionId(endpoint: string, init: RequestInit, fallbackSessionId: string): string {
  const headers = new Headers(init.headers);
  const headerSession = headers.get('x-koryphaios-session');
  if (headerSession) return headerSession;

  const body = bodyValue(init.body);
  if (body && typeof body === 'object') {
    const sessionId = (body as Record<string, unknown>).sessionId;
    if (typeof sessionId === 'string' && sessionId) return sessionId;
  }

  const url = new URL(endpoint, 'http://koryphaios.local');
  const querySession = url.searchParams.get('sessionId');
  if (querySession) return querySession;
  for (const pattern of [
    /^\/api\/messages\/([^/?]+)/,
    /^\/api\/sessions\/([^/?]+)/,
    /^\/api\/agent\/threads\/([^/?]+)/,
  ]) {
    const match = pattern.exec(url.pathname);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return fallbackSessionId;
}

export function createLinkedRemoteTransport(options: {
  hostId: string;
  defaultSessionId: string;
  rpc: LinkedDeviceRpc;
}): RemoteTransport {
  return {
    key: `linked:${options.hostId}`,
    async request(endpoint, init, timeoutMs): Promise<RemoteTransportResponse> {
      const sessionId = inferSessionId(endpoint, init, options.defaultSessionId);
      const method = String(init.method ?? 'GET').toUpperCase();
      const url = new URL(endpoint, 'http://koryphaios.local');
      const isNoteDelete = method === 'DELETE' && !url.search && /^\/api\/notes\/[^/]+$/.test(url.pathname);
      let noteRevision: number | undefined;
      if (isNoteDelete) {
        const revision = new Headers(init.headers).get('x-kory-note-revision');
        if (!revision || !/^[1-9]\d*$/.test(revision) || !Number.isSafeInteger(Number(revision))) {
          throw new Error('A valid note revision is required for linked note deletion.');
        }
        noteRevision = Number(revision);
      }
      return options.rpc<RemoteTransportResponse>(
        options.hostId,
        'workbench',
        {
          ...(sessionId ? { sessionId } : {}),
          path: endpoint,
          method,
          ...(noteRevision !== undefined ? { noteRevision } : {}),
          ...(init.body !== undefined ? { body: bodyValue(init.body) } : {}),
        },
        init.signal ?? undefined,
        timeoutMs,
      );
    },
    async requestForm(
      endpoint: string,
      parts: RemoteTransportFormPart[],
      headers: Record<string, string>,
      timeoutMs: number,
    ): Promise<RemoteTransportResponse> {
      const sessionId = inferSessionId(endpoint, { headers }, options.defaultSessionId);
      return options.rpc<RemoteTransportResponse>(
        options.hostId,
        'workbench',
        {
          ...(sessionId ? { sessionId } : {}),
          path: endpoint,
          method: 'POST',
          form: { parts },
        },
        undefined,
        timeoutMs,
      );
    },
  };
}
