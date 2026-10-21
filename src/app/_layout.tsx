import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { ControlProvider, useControl } from '../control/ControlProvider';
import { agentMessageDrafts } from '../control/agentMessageDrafts';
import { LinkedDeviceProvider } from '../control/LinkedDeviceProvider';
import { colors, isLightTheme } from '../theme/tokens';

function ThemedRoot() {
  useControl();
  const rootBackground = colors.surface1;

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(rootBackground);
  }, [rootBackground]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'inactive' || state === 'background') {
        // Persist unsent agent messages before iOS suspends the JavaScript runtime.
        // The store keeps failures visible so the user can retry from the composer.
        void agentMessageDrafts.flush().catch(() => {});
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider
      initialMetrics={initialWindowMetrics}
      style={{ flex: 1, backgroundColor: colors.surface1 }}
    >
      <KeyboardProvider>
        <StatusBar style={isLightTheme() ? 'dark' : 'light'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.surface1 },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="workspace" options={{ animation: 'fade' }} />
          <Stack.Screen name="index" options={{ animation: 'fade' }} />
          <Stack.Screen
            name="model"
            options={{
              animation: 'fade',
              contentStyle: { backgroundColor: colors.surface1 },
            }}
          />
          <Stack.Screen
            name="controls"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.46, 0.72],
              sheetInitialDetentIndex: 0,
              sheetGrabberVisible: true,
              sheetCornerRadius: 26,
              contentStyle: { backgroundColor: colors.surface1 },
            }}
          />
        </Stack>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  return (
    <LinkedDeviceProvider>
      <ControlProvider><ThemedRoot /></ControlProvider>
    </LinkedDeviceProvider>
  );
}
