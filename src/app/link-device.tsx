import React from 'react';
import { AdaptiveShell } from '../components/AdaptiveShell';
import { DevicePairingView } from '../components/DevicePairingView';

export default function LinkDeviceScreen() {
  return <AdaptiveShell title="Link device"><DevicePairingView /></AdaptiveShell>;
}
