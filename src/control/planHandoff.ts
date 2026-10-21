import type { FeedEntry } from '../types/control';

const REQUIRED_HEADINGS = [
  'Decision summary',
  'Current-state evidence',
  'Detailed implementation plan',
  'User journey and failure states',
  'Risks and alternatives',
  'Acceptance criteria',
  'Verification plan',
  'Remaining assumptions',
];

export function validatePlanReadiness(plan: string): { ready: boolean; missing: string[] } {
  const missing = REQUIRED_HEADINGS.filter(
    (heading) => !new RegExp(`(?:^|\\n)#{1,6}\\s+${heading}\\s*(?:\\n|$)`, 'i').test(plan),
  );
  if (!plan.includes('<!-- KORY_PLAN_READY -->')) missing.push('readiness marker');
  const detailed =
    /(?:^|\n)#{1,6}\s+Detailed implementation plan\s*\n([\s\S]*?)(?=\n#{1,6}\s+|$)/i.exec(
      plan,
    )?.[1] ?? '';
  if (!/^\s*(?:\d+[.)]|[-*]\s+\[[ xX]\])\s+\S/m.test(detailed)) missing.push('actionable steps');
  return { ready: missing.length === 0, missing };
}

export function latestPlanText(entries: FeedEntry[]): string {
  return (
    [...entries]
      .reverse()
      .find((entry) => entry.kind === 'assistant' && entry.body.trim().length > 0)
      ?.body.trim() ?? ''
  );
}

export function originalPlanRequest(entries: FeedEntry[], fallback: string): string {
  return (
    entries.find((entry) => entry.kind === 'user' && entry.body.trim())?.body.trim() ||
    fallback.trim() ||
    'Complete the approved plan'
  );
}

export function implementationPrompt(objective: string, plan: string): string {
  const approvedPlan = plan.replace(/\s*<!-- KORY_PLAN_READY -->\s*/g, '\n').trim();
  return `Implement this approved plan. Treat it as the authoritative starting context, inspect the current workspace before editing, and verify each acceptance criterion.\n\nObjective:\n${objective}\n\nApproved plan:\n${approvedPlan}`;
}
