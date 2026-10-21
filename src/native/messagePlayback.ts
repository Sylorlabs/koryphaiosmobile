import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

export type MessagePlaybackState = 'idle' | 'preparing' | 'playing';

type PlaybackRequest = {
  text: string;
  provider: string;
  modelId: string;
  voiceId: string;
  speed: number;
  isCurrent: () => boolean;
  synthesize: (payload: Record<string, unknown>) => Promise<{ data?: unknown }>;
  onState: (state: MessagePlaybackState) => void;
  onError: (message: string) => void;
};

export type MessagePlaybackOperation = {
  id: number;
  request: PlaybackRequest;
  ready: Promise<void>;
  settle: () => void;
  cancelled: boolean;
  speaking: boolean;
  player?: AudioPlayer;
  subscription?: { remove: () => void };
  file?: File;
  writing?: boolean;
};

const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a',
  'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/wav': 'wav',
  'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
};
const MAX_AUDIO_BASE64_LENGTH = 20 * 1024 * 1024;

/** One speaker per device, with each native player and cache file owned by one request. */
class MessagePlayback {
  private current: MessagePlaybackOperation | null = null;
  private nextId = 0;
  private speechStops: Promise<void> = Promise.resolve();

  start(request: PlaybackRequest): MessagePlaybackOperation {
    if (this.current) this.cancel(this.current);
    let settle!: () => void;
    const operation: MessagePlaybackOperation = {
      id: ++this.nextId, request, ready: new Promise<void>((resolve) => { settle = resolve; }),
      settle: () => settle(), cancelled: false, speaking: false,
    };
    this.current = operation;
    if (!request.isCurrent()) {
      this.finish(operation);
      return operation;
    }
    request.onState('preparing');
    void this.prepare(operation);
    return operation;
  }

  private isCurrent(operation: MessagePlaybackOperation) {
    return this.current === operation && !operation.cancelled && operation.request.isCurrent();
  }

  private stopSpeech() {
    // Speech.stop is asynchronous and device-wide. A late stop from an old
    // screen must settle before a newer screen is allowed to speak.
    const stopped = this.speechStops.then(() => Speech.stop());
    this.speechStops = stopped.catch(() => undefined);
    return stopped;
  }

  private dispose(operation: MessagePlaybackOperation) {
    try { operation.subscription?.remove(); } catch { /* The listener may already be removed. */ }
    operation.subscription = undefined;
    try { operation.player?.release(); } catch { /* Native interruption may have released it. */ }
    operation.player = undefined;
    if (operation.file && !operation.writing) {
      try { operation.file.delete(); } catch { /* This generated cache file remains OS-reclaimable. */ }
      operation.file = undefined;
    }
  }

  private finish(operation: MessagePlaybackOperation, error?: string) {
    const owned = this.current === operation;
    operation.cancelled = true;
    if (owned) this.current = null;
    this.dispose(operation);
    operation.settle();
    if (owned) {
      operation.request.onState('idle');
      if (error) operation.request.onError(error);
    }
  }

  cancel(operation: MessagePlaybackOperation) {
    if (this.current !== operation || operation.cancelled) return;
    const speaking = operation.speaking;
    this.finish(operation);
    if (speaking) {
      void this.stopSpeech().catch((caught) => {
        if (this.nextId === operation.id && operation.request.isCurrent()) {
          operation.request.onError(caught instanceof Error ? `Could not stop audio: ${caught.message}` : 'Could not stop audio.');
        }
      });
    }
  }

  private async prepare(operation: MessagePlaybackOperation) {
    const request = operation.request;
    try {
      await this.stopSpeech();
      if (!this.isCurrent(operation)) return;
      const rate = Number.isFinite(request.speed) && request.speed > 0 ? request.speed : 1;
      if (request.provider === 'system') {
        const voices = await Speech.getAvailableVoicesAsync();
        if (!this.isCurrent(operation)) return;
        const voice = voices.find((item) => item.identifier === request.voiceId || item.name === request.voiceId);
        operation.speaking = true;
        Speech.speak(request.text, {
          rate, ...(voice ? { voice: voice.identifier } : {}),
          onStart: () => {
            if (this.isCurrent(operation)) request.onState('playing');
          },
          onDone: () => this.finish(operation),
          onStopped: () => this.finish(operation),
          onError: (error) => this.finish(operation, error.message || 'Could not play this response.'),
        });
        operation.settle();
        return;
      }

      const result = await request.synthesize({
        text: request.text, provider: request.provider, modelId: request.modelId,
        voiceId: request.voiceId, speed: rate,
      });
      if (!this.isCurrent(operation)) return;
      const speech = result.data as { audioBase64?: unknown; mimeType?: unknown } | undefined;
      const data = speech?.audioBase64;
      const mimeType = typeof speech?.mimeType === 'string' ? speech.mimeType.split(';')[0].trim().toLowerCase() : '';
      const extension = AUDIO_EXTENSIONS[mimeType];
      if (typeof data !== 'string' || !data || !extension) {
        throw new Error('The host did not return a supported speech audio file.');
      }
      if (data.length > MAX_AUDIO_BASE64_LENGTH) {
        throw new Error('This response is too large to play. Try a shorter response.');
      }
      let uri: string;
      if (Platform.OS === 'web') {
        uri = `data:${mimeType};base64,${data}`;
      } else {
        const file = new File(Paths.cache, `kory-message-${Date.now()}-${operation.id}.${extension}`);
        operation.file = file;
        operation.writing = true;
        try {
          await file.write(data, { encoding: 'base64' });
        } finally {
          operation.writing = false;
        }
        if (!this.isCurrent(operation)) return;
        uri = file.uri;
      }
      const player = createAudioPlayer(uri);
      operation.player = player;
      operation.subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (!this.isCurrent(operation)) return;
        if (status.error) this.finish(operation, `Could not play this response: ${status.error}`);
        else if (status.didJustFinish) this.finish(operation);
        else if (status.playing) request.onState('playing');
      });
      player.play();
      operation.settle();
    } catch (caught) {
      if (this.isCurrent(operation)) {
        this.finish(operation, caught instanceof Error ? caught.message : 'Could not play this response.');
      }
    } finally {
      if (!this.isCurrent(operation)) {
        this.dispose(operation);
        operation.settle();
      }
    }
  }
}

export const messagePlayback = new MessagePlayback();
