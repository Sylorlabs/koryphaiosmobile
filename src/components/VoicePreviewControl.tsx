import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { Play, Square } from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type { CommandResult } from '../types/control';

const PREVIEW_TEXT = 'Koryphaios voice input and speech playback are ready.';

type SpeechResult = {
  audioBase64: string;
  mimeType: string;
};

function valueOf(
  settings: ReturnType<typeof useControl>['snapshot']['settings'],
  id: string,
  fallback: string | number,
): string | number {
  const value = settings.find((field) => field.id === id)?.value;
  return typeof value === 'string' || typeof value === 'number' ? value : fallback;
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('aac')) return 'aac';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  return 'mp3';
}

function resultData<T>(result: CommandResult): T | undefined {
  return result.data as T | undefined;
}

export function VoicePreviewControl() {
  const { snapshot, pairing, sendCommand } = useControl();
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [systemSpeaking, setSystemSpeaking] = useState(false);
  const [error, setError] = useState('');
  const generationRef = useRef(0);
  const preparingRef = useRef(false);
  const stoppingRef = useRef(false);
  const mountedRef = useRef(true);

  const voice = useMemo(() => ({
    provider: String(valueOf(snapshot.settings, 'voice.output.provider', 'system')),
    modelId: String(valueOf(snapshot.settings, 'voice.output.modelId', 'web-speech-synthesis')),
    voiceId: String(valueOf(snapshot.settings, 'voice.output.voiceId', 'system-default')),
    speed: Number(valueOf(snapshot.settings, 'voice.output.speed', 1)),
    language: String(valueOf(snapshot.settings, 'voice.input.language', 'en')),
  }), [snapshot.settings]);

  const playing = systemSpeaking || playerStatus.playing;
  const owner = JSON.stringify([pairing?.baseUrl, pairing?.machineId, voice.provider,
    voice.modelId, voice.voiceId, voice.speed, voice.language]);
  const [renderedOwner, setRenderedOwner] = useState(owner);
  if (renderedOwner !== owner) {
    // Reset local presentation before painting a new machine's settings.
    setRenderedOwner(owner);
    setBusy(false);
    setStopping(false);
    setSystemSpeaking(false);
  }

  useLayoutEffect(() => {
    const generation = generationRef;
    const preparing = preparingRef;
    const stoppingRequest = stoppingRef;
    const mounted = mountedRef;
    mountedRef.current = true;
    return () => {
      // Changing host or voice invalidates a pending synthesis and its playback.
      generation.current++;
      preparing.current = false;
      stoppingRequest.current = false;
      mounted.current = false;
      void Speech.stop().catch(() => undefined);
      try { player.pause(); } catch { /* player may already be released */ }
    };
  }, [owner, player]);

  const current = (generation: number) =>
    mountedRef.current && generation === generationRef.current;

  const stop = async () => {
    if (stoppingRef.current) return;
    const generation = ++generationRef.current;
    preparingRef.current = false;
    stoppingRef.current = true;
    setBusy(false);
    setStopping(true);
    setSystemSpeaking(false);
    try {
      await Speech.stop();
      player.pause();
      await player.seekTo(0);
    } catch {
      if (current(generation)) setError('Could not stop the voice preview.');
    } finally {
      if (current(generation)) {
        stoppingRef.current = false;
        setStopping(false);
      }
    }
  };

  const preview = async () => {
    if (preparingRef.current || stoppingRef.current) return;
    // Reserve synchronously, before the first asynchronous audio cleanup.
    preparingRef.current = true;
    const generation = ++generationRef.current;
    setBusy(true);
    setError('');
    try {
      await Speech.stop();
      if (!current(generation)) return;
      player.pause();
      await player.seekTo(0).catch(() => undefined);
      if (!current(generation)) return;

      if (voice.provider === 'system') {
        const available = await Speech.getAvailableVoicesAsync();
        if (!current(generation)) return;
        const selected = available.find(
          (candidate) => candidate.identifier === voice.voiceId || candidate.name === voice.voiceId,
        );
        Speech.speak(PREVIEW_TEXT, {
          language: voice.language,
          rate: Number.isFinite(voice.speed) ? voice.speed : 1,
          ...(selected ? { voice: selected.identifier } : {}),
          onDone: () => { if (current(generation)) setSystemSpeaking(false); },
          onStopped: () => { if (current(generation)) setSystemSpeaking(false); },
          onError: () => {
            if (current(generation)) {
              setSystemSpeaking(false);
              setError('Voice preview could not be played on this device.');
            }
          },
        });
        if (current(generation)) setSystemSpeaking(true);
        return;
      }

      const result = await sendCommand('voice.synthesize', {
        text: PREVIEW_TEXT,
        provider: voice.provider,
        modelId: voice.modelId,
        voiceId: voice.voiceId,
        speed: Number.isFinite(voice.speed) ? voice.speed : 1,
      });
      if (!current(generation)) return;
      if (result.accepted !== true) {
        throw new Error('Voice synthesis could not be confirmed by the host.');
      }
      const speech = resultData<SpeechResult>(result);
      if (!speech?.audioBase64 || !speech.mimeType) {
        throw new Error('The host did not return playable speech audio.');
      }
      const file = new File(
        Paths.cache,
        `kory-voice-preview-${Date.now()}-${generation}.${extensionFor(speech.mimeType)}`,
      );
      file.write(speech.audioBase64, { encoding: 'base64' });
      if (!current(generation)) return;
      player.replace(file.uri);
      player.play();
    } catch (caught) {
      if (current(generation)) {
        setSystemSpeaking(false);
        setError(caught instanceof Error ? caught.message : 'Voice preview failed');
      }
    } finally {
      if (current(generation)) {
        preparingRef.current = false;
        setBusy(false);
      }
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.copy}>
        <Text style={styles.label}>Test voice</Text>
        <Text numberOfLines={2} style={styles.detail}>
          {voice.provider === 'system'
            ? 'Preview the current system voice on this device.'
            : `Preview ${voice.provider} using the remote host.`}
        </Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={stopping ? 'Stopping voice preview' : busy ? 'Cancel voice preview' : playing ? 'Stop voice preview' : 'Test voice'}
        accessibilityState={{ disabled: stopping, busy: busy || stopping }}
        disabled={stopping}
        onPress={() => void ((busy || playing) ? stop() : preview())}
        style={({ pressed }) => [
          styles.button,
          pressed && !stopping && styles.pressed,
          stopping && styles.disabled,
        ]}
      >
        {playing ? (
          <Square size={14} color={colors.textSecondary} fill={colors.textSecondary} />
        ) : (
          <Play size={14} color={colors.textSecondary} fill={colors.textSecondary} />
        )}
        <Text style={styles.buttonText}>{stopping ? 'Stopping' : busy ? 'Cancel' : playing ? 'Stop' : 'Test'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 72,
    marginTop: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  detail: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: typography.xs,
    lineHeight: 16,
  },
  error: {
    marginTop: spacing.xxs,
    color: colors.error,
    fontSize: typography.xs,
  },
  button: {
    minHeight: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surface3,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  buttonText: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  pressed: { opacity: 0.66 },
  disabled: { opacity: 0.46 },
});
