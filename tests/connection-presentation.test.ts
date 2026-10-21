import { expect, test } from 'bun:test';
import {
  isHostConnectionError, machineDisplayName, machineLivePresentation, readableControlError,
} from '../src/control/connectionPresentation';
import type { PairingTarget } from '../src/types/control';

const paired: PairingTarget = {
  baseUrl: 'http://192.0.2.1:3001',
  token: 'example',
  machineId: 'host-1',
  machineName: 'Studio Mac',
};

test('offline snapshots retain the authenticated pairing identity', () => {
  expect(machineDisplayName({ id: 'unpaired', name: 'Pair a machine' }, paired)).toBe('Studio Mac');
  expect(machineDisplayName({ id: 'host-1', name: 'Koryphaios Pro' }, paired)).toBe('Koryphaios Pro');
  expect(machineDisplayName({ id: 'unpaired', name: 'Pair a machine' }, null)).toBe('Pair machine');
});

test('a reachable desktop with a failed live channel is never presented as fully connected', () => {
  expect(machineLivePresentation(true, 'online', 'connected')).toEqual({ status: 'online', label: 'Live connected' });
  expect(machineLivePresentation(true, 'online', 'connecting')).toEqual({ status: 'connecting', label: 'Desktop online · live reconnecting' });
  expect(machineLivePresentation(true, 'online', 'error')).toEqual({ status: 'offline', label: 'Desktop online · live connection lost' });
  expect(machineLivePresentation(true, 'online', 'disconnected')).toEqual({ status: 'offline', label: 'Desktop online · live disconnected' });
  expect(machineLivePresentation(true, 'offline', 'connected')).toEqual({ status: 'offline', label: 'Desktop offline' });
  expect(machineLivePresentation(false, 'online', 'connected')).toEqual({ status: 'offline', label: 'Not paired' });
});

test('native connection failures become recoverable UI copy without exposing internal paths', () => {
  const swiftError = 'fetch failed: UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)';
  expect(isHostConnectionError(swiftError)).toBe(true);
  expect(readableControlError(swiftError, paired)).toContain("Can't reach Studio Mac");
  expect(readableControlError(swiftError, null)).toContain('Check its address');
  expect(readableControlError(swiftError, paired)).not.toContain('Promise.swift');
});

test('host permission errors preserve their actionable explanation', () => {
  const denied = 'Host rejected the permission request for this device';
  expect(isHostConnectionError(denied)).toBe(false);
  expect(readableControlError(denied, paired)).toBe(denied);
});

test('generic missing-resource replies offer a recovery path instead of Not Found', () => {
  const error = readableControlError('Not Found', paired);
  expect(error).toContain('desktop');
  expect(error).toContain('Machines');
  expect(error).not.toBe('Not Found');
});
