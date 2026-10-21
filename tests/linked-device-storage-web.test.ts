import { afterEach, expect, test } from 'bun:test';
import {
  loadActiveDeviceHost,
  loadDeviceIdentity,
  loadDeviceLinks,
  saveActiveDeviceHost,
} from '../src/control/linkedDeviceStorage.web';

afterEach(async () => { await saveActiveDeviceHost(''); });

test('web pairing startup loads all three values without a missing platform export', async () => {
  const startup = await Promise.all([
    loadDeviceIdentity(), loadDeviceLinks(), loadActiveDeviceHost(),
  ]);
  expect(startup).toEqual([null, [], '']);
});

test('web active-host selection can be changed and cleared within the preview session', async () => {
  await saveActiveDeviceHost('audit-host-a');
  expect(await loadActiveDeviceHost()).toBe('audit-host-a');
  await saveActiveDeviceHost('audit-host-b');
  expect(await loadActiveDeviceHost()).toBe('audit-host-b');
  await saveActiveDeviceHost('');
  expect(await loadActiveDeviceHost()).toBe('');
});
