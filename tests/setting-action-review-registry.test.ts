import { expect, test } from 'bun:test';

import {
  SettingActionReviewRegistry, type SettingActionReview, type SettingActionReviewPersistence,
} from '../src/control/settingActionReviewRegistry';
import { settingActionStorageKey } from '../src/control/settingActionReviewKey';

function setup() {
  const disk = new Map<string, SettingActionReview>();
  let failRead = false;
  let failWrite = false;
  let failDelete = false;
  const persistence: SettingActionReviewPersistence = {
    async load(key) { if (failRead) throw new Error('read failed'); return disk.get(key) ?? null; },
    async save(key, record) { if (failWrite) throw new Error('write failed'); disk.set(key, record); },
    async clear(key) { if (failDelete) throw new Error('delete failed'); disk.delete(key); },
  };
  return {
    disk, persistence,
    fail: (read: boolean, write: boolean, deletion: boolean) => {
      failRead = read; failWrite = write; failDelete = deletion;
    },
  };
}

test('destructive action review survives process restart, A→B→A and explicit release', async () => {
  const { disk, persistence } = setup();
  const keyA = 'http://host-a\u0000machine-a\u0000agent.reset';
  const keyB = 'http://host-b\u0000machine-b\u0000agent.reset';
  const first = new SettingActionReviewRegistry(persistence);
  expect(await first.load(keyA)).toBeNull();
  const saved = first.reserve(keyA, 'Reset');
  expect(saved).not.toBeNull();
  await first.persist(keyA, saved!);
  expect(disk.has(keyA)).toBe(true);

  // A second registry is what the app sees after a cold process restart.
  const restarted = new SettingActionReviewRegistry(persistence);
  expect(await restarted.load(keyA)).toEqual({ label: 'Reset' });
  expect(restarted.reserve(keyA, 'Reset')).toBeNull();
  expect(await restarted.load(keyB)).toBeNull();
  expect(restarted.reserve(keyB, 'Reset')).not.toBeNull();
  expect(await restarted.load(keyA)).toEqual({ label: 'Reset' });
  expect(await restarted.release(keyA, restarted.get(keyA)!)).toBe(true);
  expect(await new SettingActionReviewRegistry(persistence).load(keyA)).toBeNull();
});

test('save, read and delete failures never imply a successfully cleared lock', async () => {
  const { persistence, fail } = setup();
  const first = new SettingActionReviewRegistry(persistence);
  const record = first.reserve('host\u0000delete', 'Delete')!;
  fail(false, true, false);
  await expect(first.persist('host\u0000delete', record)).rejects.toThrow('write failed');
  expect(first.get('host\u0000delete')).toBe(record);
  fail(false, false, false);
  await first.persist('host\u0000delete', record);
  fail(false, false, true);
  await expect(first.release('host\u0000delete', record)).rejects.toThrow('delete failed');
  expect(first.get('host\u0000delete')).toBe(record);
  fail(true, false, false);
  await expect(new SettingActionReviewRegistry(persistence).load('host\u0000delete')).rejects.toThrow('read failed');
  fail(false, false, false);
  expect(await new SettingActionReviewRegistry(persistence).load('host\u0000delete')).toEqual(record);
});

test('stable device storage keys hide host strings and isolate distinct machines/fields', () => {
  const key = settingActionStorageKey('https://private-host:3001\u0000machine-a\u0000agent.reset');
  expect(key).toBe(settingActionStorageKey('https://private-host:3001\u0000machine-a\u0000agent.reset'));
  expect(key).not.toContain('private-host');
  expect(key).toMatch(/^koryphaios\.setting-action-review\.v1\.[0-9a-f]{64}$/);
  expect(key).not.toBe(settingActionStorageKey('https://private-host:3001\u0000machine-b\u0000agent.reset'));
  expect(key).not.toBe(settingActionStorageKey('https://private-host:3001\u0000machine-a\u0000agent.mode'));
});
