/**
 * First-run mode selection: the app runs either as the OWNER REMOTE (the
 * owner's daily phone) or as a COMPANION TERMINAL (the old device by the
 * cage). The choice is made once and persisted through a tiny storage
 * interface — in-memory by default (survives remounts within the process);
 * the app root can inject a durable implementation later without touching
 * this file.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type AppMode = 'owner' | 'terminal';

/** Tiny persistence seam for the chosen mode. */
export interface ModeStorage {
  get(): Promise<AppMode | null>;
  set(mode: AppMode): Promise<void>;
}

/** In-memory ModeStorage (module-lifetime persistence). */
export function createMemoryModeStorage(initial: AppMode | null = null): ModeStorage {
  let stored: AppMode | null = initial;
  return {
    get: async () => stored,
    set: async (mode: AppMode) => {
      stored = mode;
    },
  };
}

/** Default shared storage: mode chosen once per app process. */
export const defaultModeStorage: ModeStorage = createMemoryModeStorage();

export interface ModeGateProps {
  storage?: ModeStorage;
  renderOwner: () => React.ReactElement;
  renderTerminal: () => React.ReactElement;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBEB',
    justifyContent: 'center',
    padding: 24,
  },
  brand: { fontSize: 26, fontWeight: '700', color: '#1F2937', textAlign: 'center' },
  tagline: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 28,
  },
  choice: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 18,
    marginVertical: 8,
  },
  choiceTitle: { fontSize: 17, fontWeight: '700', color: '#0F766E' },
  choiceBody: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  note: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 20 },
});

export function ModeGate({
  storage = defaultModeStorage,
  renderOwner,
  renderTerminal,
}: ModeGateProps): React.ReactElement {
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<AppMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    storage
      .get()
      .then((stored) => {
        if (!cancelled) {
          setMode(stored);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const choose = useCallback(
    (next: AppMode) => {
      setMode(next);
      // Fire-and-forget persistence; the in-memory state is authoritative
      // for this process either way.
      void storage.set(next).catch(() => undefined);
    },
    [storage],
  );

  if (!loaded) return <View style={styles.container} />;
  if (mode === 'owner') return renderOwner();
  if (mode === 'terminal') return renderTerminal();

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>LonelyBirds</Text>
      <Text style={styles.tagline}>Every bird deserves a flock.</Text>
      <Pressable
        accessibilityRole="button"
        style={styles.choice}
        onPress={() => choose('owner')}
      >
        <Text style={styles.choiceTitle}>Owner Remote</Text>
        <Text style={styles.choiceBody}>
          This is my own phone — manage profiles, matches and sessions.
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={styles.choice}
        onPress={() => choose('terminal')}
      >
        <Text style={styles.choiceTitle}>Companion Terminal</Text>
        <Text style={styles.choiceBody}>
          This is the old device by the cage — it will show my pet&apos;s companion.
        </Text>
      </Pressable>
      <Text style={styles.note}>You choose once per device; the terminal stays paired.</Text>
    </View>
  );
}
