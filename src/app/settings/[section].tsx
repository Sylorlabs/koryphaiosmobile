import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import { AdaptiveShell } from '../../components/AdaptiveShell';
import { SettingsSectionView } from '../../components/SettingsView';
import { useControl } from '../../control/ControlProvider';

export default function SettingsSectionScreen() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const { snapshot } = useControl();
  const info = snapshot.settingsSections.find((item) => item.id === section);
  const sectionId = typeof section === 'string' ? section : snapshot.settingsSections[0]?.id ?? 'providers';
  return (
    <AdaptiveShell title={info?.label ?? 'Settings'}>
      <SettingsSectionView sectionId={sectionId} inRoute />
    </AdaptiveShell>
  );
}
