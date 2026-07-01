/**
 * WaitingScreen — the terminal's idle state between sessions.
 *
 * Responsibilities:
 * - device-heartbeat every HEARTBEAT_INTERVAL_MS (30s; schedule-tick marks
 *   devices offline after 90s of silence and pushes the owner)
 * - listen for the "session starting" push over Realtime and auto-join
 * - remind the human that the device must stay plugged in and awake
 *
 * Keep-awake: the real app build must disable screen sleep
 * (react-native-keep-awake / UIApplication.idleTimerDisabled + Guided
 * Access). That's a native-build concern; this screen carries the visible
 * reminder and the TODO marker for it.
 */

import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  deviceHeartbeat,
  HEARTBEAT_INTERVAL_MS,
  subscribeToSessionStart,
  type SessionStartPush,
} from './terminalApi';

export interface WaitingScreenProps {
  deviceId: string;
  /** The pet this terminal is bound to. */
  petId: string;
  petName?: string;
  /** Fired when a session push arrives — host swaps to TerminalSessionScreen. */
  onSessionStart: (push: SessionStartPush) => void;
}

export function WaitingScreen({
  deviceId,
  petId,
  petName,
  onSessionStart,
}: WaitingScreenProps): JSX.Element {
  // Heartbeat loop: immediately on mount, then every 30s.
  useEffect(() => {
    const beat = (): void => {
      void deviceHeartbeat(deviceId).catch(() => {
        // Transient network failure: the next beat retries; schedule-tick
        // only alerts the owner after 90s of silence.
      });
    };
    beat();
    const interval = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [deviceId]);

  // TODO(native build): activate keep-awake here (idleTimerDisabled).

  // Session push → auto-join, no interaction needed at the cage.
  useEffect(() => {
    const unsubscribe = subscribeToSessionStart(deviceId, (push) => {
      if (push.pet_id === petId) onSessionStart(push);
    });
    return unsubscribe;
  }, [deviceId, petId, onSessionStart]);

  return (
    <View style={styles.container}>
      <Text style={styles.bird}>🦜</Text>
      <Text style={styles.title}>
        {petName ? `${petName} is on the wire` : 'On the wire'}
      </Text>
      <Text style={styles.subtitle}>Waiting for a friend to call…</Text>
      <View style={styles.noteBox}>
        <Text style={styles.note}>
          Keep this device plugged in and awake — sessions start automatically.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  bird: {
    fontSize: 72,
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFBEB',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 17,
    color: '#99f6e4',
    marginBottom: 40,
    textAlign: 'center',
  },
  noteBox: {
    backgroundColor: 'rgba(255, 251, 235, 0.12)',
    borderRadius: 12,
    padding: 16,
  },
  note: {
    color: '#FFFBEB',
    fontSize: 14,
    textAlign: 'center',
  },
});
