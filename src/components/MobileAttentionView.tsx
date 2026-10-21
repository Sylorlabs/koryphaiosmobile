import React, { useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronRight, Send } from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { useAttentionResponse } from '../control/useAttentionResponse';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import { ActionButton } from './ui';
import { MobileSurface } from './MobileSurface';

export function MobileAttentionView() {
  const { snapshot, live, pairing, attentionResponses, answerQuestion, resolveReview } = useControl();
  useSyncExternalStore(attentionResponses.subscribe, attentionResponses.getVersion, attentionResponses.getVersion);
  const saved = attentionResponses.savedFor(pairing).slice(0, 30);
  const question = live.questions[snapshot.activeSessionId];
  const review = live.reviews[snapshot.activeSessionId];
  const questionResponse = useAttentionResponse('question', question);
  const reviewResponse = useAttentionResponse('review', review);
  const { text: other, setText: setOther } = questionResponse;

  if (question) {
    const answer = (selection: string, text?: string) => {
      void answerQuestion(question.sessionId, selection, text, questionResponse.key);
    };
    const submitOther = () => {
      const value = other.trim();
      if (value) answer(value, value);
    };
    return (
      <MobileSurface title="Kory needs input">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.question}>{question.question}</Text>
          <View style={styles.options}>
            {question.options.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ disabled: questionResponse.busy, busy: questionResponse.busy }}
                disabled={questionResponse.busy}
                onPress={() => answer(option)}
                style={({ pressed }) => [styles.option, questionResponse.busy && styles.disabled, pressed && styles.pressed]}
              >
                <Text style={styles.optionText}>{option}</Text>
                <ChevronRight size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
          {question.allowOther ? (
            <View style={styles.otherRow}>
              <TextInput
                value={other}
                onChangeText={setOther}
                accessibilityLabel="Your answer"
                editable={!questionResponse.busy}
                multiline
                placeholder="Write an answer"
                placeholderTextColor={colors.textMuted}
                style={styles.otherInput}
              />
              <Pressable
                accessibilityLabel="Send answer"
                accessibilityRole="button"
                accessibilityState={{ disabled: !other.trim() || questionResponse.busy, busy: questionResponse.busy }}
                disabled={!other.trim() || questionResponse.busy}
                onPress={submitOther}
                style={({ pressed }) => [styles.sendButton, (!other.trim() || questionResponse.busy) && styles.disabled, pressed && other.trim() ? styles.pressed : null]}
              >
                <Send size={17} color={colors.onAccent} />
              </Pressable>
            </View>
          ) : null}
          {questionResponse.message ? (
            <Text accessibilityLiveRegion="polite" accessibilityRole={questionResponse.error ? 'alert' : undefined}
              style={[styles.feedback, questionResponse.error && { color: colors.error }]}>
              {questionResponse.message}
            </Text>
          ) : null}
          {attentionResponses.getRecoveryError() ? (
            <ActionButton label="Retry saved-response recovery" onPress={() => attentionResponses.retryLoad()} />
          ) : null}
        </ScrollView>
      </MobileSurface>
    );
  }

  if (review) {
    const resolve = (accepted: boolean) => {
      void resolveReview(review.sessionId, accepted, reviewResponse.key);
    };
    return (
      <MobileSurface title="Review changes">
        <View style={styles.reviewRoot}>
          <ScrollView contentContainerStyle={styles.reviewList}>
            {reviewResponse.message ? (
              <Text accessibilityLiveRegion="polite" accessibilityRole={reviewResponse.error ? 'alert' : undefined}
                style={[styles.feedback, reviewResponse.error && { color: colors.error }]}>
                {reviewResponse.message}
              </Text>
            ) : null}
            {attentionResponses.getRecoveryError() ? (
              <ActionButton label="Retry saved-response recovery" onPress={() => attentionResponses.retryLoad()} />
            ) : null}
            {review.changes.map((change) => (
              <View key={`${change.operation}:${change.path}`} style={styles.changeRow}>
                <Text numberOfLines={2} style={styles.changePath}>{change.path}</Text>
                <View style={styles.changeMeta}>
                  <Text style={styles.changeOperation}>{change.operation}</Text>
                  <Text style={styles.added}>+{change.linesAdded}</Text>
                  <Text style={styles.deleted}>-{change.linesDeleted}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={styles.reviewActions}>
            <ActionButton label="Reject" danger disabled={reviewResponse.busy} onPress={() => resolve(false)} style={styles.action} />
            <ActionButton label="Keep" primary disabled={reviewResponse.busy} onPress={() => resolve(true)} style={styles.action} />
          </View>
        </View>
      </MobileSurface>
    );
  }

  return (
    <MobileSurface title="Attention">
      <ScrollView contentContainerStyle={styles.savedContent}>
        <Text style={styles.empty}>No current desktop request.</Text>
        {!attentionResponses.isReady() ? (
          <View style={styles.savedCard}>
            <Text accessibilityLiveRegion="polite" style={styles.feedback}>
              {attentionResponses.getRecoveryError() ?? 'Restoring saved responses…'}
            </Text>
            {attentionResponses.getRecoveryError() ? (
              <ActionButton label="Retry recovery" onPress={() => attentionResponses.retryLoad()} />
            ) : null}
          </View>
        ) : null}
        {attentionResponses.getPersistenceError() ? (
          <Text accessibilityRole="alert" style={[styles.feedback, { color: colors.error }]}>
            {attentionResponses.getPersistenceError()}
          </Text>
        ) : null}
        {saved.length ? (
          <>
            <Text style={styles.savedHeading}>Responses saved for this machine</Text>
            <Text style={styles.feedback}>
              {attentionResponses.isDurable()
                ? 'Recovered from this device. Check the desktop before sending an uncertain response again.'
                : 'Available during this preview session only.'}
            </Text>
            {saved.map(({ key, kind, sessionId, response }) => (
              <View key={key} style={styles.savedCard}>
                <Text style={styles.savedLabel}>{kind === 'review' ? 'Change review' : 'Question'} · {sessionId}</Text>
                <Text style={styles.feedback}>{attentionResponseMessageForHistory(response.phase, response.choice)}</Text>
                {response.text ? <Text selectable style={styles.savedText}>{response.text}</Text> : null}
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </MobileSurface>
  );
}

function attentionResponseMessageForHistory(phase: string, choice?: string): string {
  const label = choice ? `Selected: ${choice.slice(0, 120)}${choice.length > 120 ? '…' : ''}. ` : '';
  if (phase === 'idle') return 'Draft saved on this device.';
  if (phase === 'uncertain') return `${label}Sending was interrupted; the desktop may have received it.`;
  if (phase === 'waiting') return `${label}Sent; waiting for desktop confirmation.`;
  if (phase === 'resolved') return `${label}Desktop resolved the request.`;
  if (phase === 'closed') return `${label}Request closed; execution was not confirmed.`;
  if (phase === 'error') return `${label}Sending failed or could not be confirmed.`;
  return `${label}Sending…`;
}

const styles = StyleSheet.create({
  savedContent: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.huge,
  },
  savedHeading: { color: colors.textPrimary, fontSize: typography.base, fontWeight: '700', marginTop: spacing.sm },
  savedLabel: { color: colors.textSecondary, fontSize: typography.sm, fontWeight: '600' },
  savedCard: { padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface2, gap: spacing.xs },
  savedText: { color: colors.textPrimary, fontSize: typography.sm, lineHeight: 21 },
  feedback: {
    color: colors.textMuted,
    fontSize: typography.sm,
    lineHeight: 20,
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: spacing.md,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  question: {
    color: colors.textPrimary,
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '700',
  },
  options: {
    gap: spacing.xs,
  },
  option: {
    minHeight: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  optionText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.sm,
    lineHeight: 19,
  },
  otherRow: {
    minHeight: 52,
    maxHeight: 180,
    borderRadius: radii.xl,
    backgroundColor: colors.surface3,
    padding: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  otherInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 160,
    color: colors.textPrimary,
    fontSize: typography.base,
    lineHeight: 20,
    paddingHorizontal: spacing.xs,
    paddingVertical: 9,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewRoot: {
    flex: 1,
    minHeight: 0,
  },
  reviewList: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: spacing.md,
    gap: spacing.xs,
    paddingBottom: 100,
  },
  changeRow: {
    minHeight: 62,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  changePath: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontFamily: 'monospace',
  },
  changeMeta: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  changeOperation: {
    color: colors.textMuted,
    fontSize: 10,
    textTransform: 'capitalize',
  },
  added: {
    color: colors.success,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  deleted: {
    color: colors.error,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  reviewActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: colors.surface1,
  },
  action: {
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    color: colors.textMuted,
    fontSize: typography.sm,
  },
  disabled: {
    opacity: 0.3,
  },
  pressed: {
    opacity: 0.68,
  },
});
