import { useCallback, useRef } from 'react';
import { router, useFocusEffect } from 'expo-router';

/** Only the focused phone workspace opens blocking attention automatically. */
export function useAttentionRedirect(key: string, embedded: boolean): void {
  const lastOpened = useRef('');
  useFocusEffect(useCallback(() => {
    // Wide layouts already display attention alongside their embedded composer.
    if (embedded || !key || lastOpened.current === key) return;
    lastOpened.current = key;
    router.push('/attention');
  }, [key, embedded]));
}
