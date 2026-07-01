/**
 * TerminalSessionScreen — the bird's view: the partner bird, full screen,
 * no controls (the pet can't tap and mustn't need to). All control lives in
 * the owner app; the terminal just joins, streams, reconnects, and obeys
 * `bye`.
 *
 * Wiring: role from core `whoAmI` (lexically smaller pet id → terminal_a,
 * impolite offerer), NativeRTCProvider (640x480@15fps), Supabase Realtime
 * signalling on `session:{sessionId}`, SessionController for the machine +
 * reconnect/teardown behaviour.
 */

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import type { ComponentType } from 'react';
import type { EndReason, SessionStatus } from '../core/sessionMachine';
import { whoAmI } from '../core/signalling';
import { NativeRTCProvider } from '../rtc/NativeRTCProvider';
import { SessionController } from '../rtc/SessionController';
import { SupabaseSignallingChannel } from '../rtc/signallingChannel';
import { getRealtimeClient } from './terminalApi';

/**
 * RTCView placeholder-typing: react-native-webrtc is ambient-declared (the
 * native module only exists in real app builds), so we cast its component to
 * the props we use. This is the sanctioned `unknown` boundary.
 */
const RemoteVideo = RTCView as unknown as ComponentType<{
  streamURL?: string;
  objectFit?: 'cover' | 'contain';
  zOrder?: number;
  style?: unknown;
}>;

export interface TerminalSessionScreenProps {
  sessionId: string;
  /** This terminal's pet. */
  petId: string;
  /** The partner pet on the other terminal. */
  partnerPetId: string;
  /** Session over (bye received, ended remotely, or reconnect gave up). */
  onSessionEnded: (reason: EndReason) => void;
}

export function TerminalSessionScreen({
  sessionId,
  petId,
  partnerPetId,
  onSessionEnded,
}: TerminalSessionScreenProps): JSX.Element {
  const [remoteStreamUrl, setRemoteStreamUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;

  useEffect(() => {
    const provider = new NativeRTCProvider();
    const controller = new SessionController({
      role: whoAmI(petId, partnerPetId),
      provider,
      channel: new SupabaseSignallingChannel(getRealtimeClient(), sessionId),
      onStateChange: (state) => setStatus(state.status),
      onRemoteStream: (stream) => setRemoteStreamUrl(stream.url ?? null),
      onEnded: (reason) => {
        provider.releaseLocalStream();
        onSessionEndedRef.current(reason);
      },
    });
    void controller.start().catch(() => {
      // Join failed outright (channel down, camera denied): give up cleanly;
      // the partner's reconnect timeout ends their side as failed.
      void controller.end('failed');
    });

    return () => {
      // Unmount mid-session (app killed / mode switch): tear down so the
      // partner sees a bye instead of waiting out the 60s reconnect window.
      void controller.end('failed');
      provider.releaseLocalStream();
    };
  }, [sessionId, petId, partnerPetId]);

  const showVideo = remoteStreamUrl !== null && (status === 'active' || status === 'reconnecting');

  return (
    <View style={styles.container}>
      {showVideo ? (
        <RemoteVideo
          streamURL={remoteStreamUrl ?? undefined}
          objectFit="cover"
          style={styles.video}
        />
      ) : (
        <View style={styles.placeholder}>
          <ActivityIndicator size="large" color="#F59E0B" />
          <Text style={styles.placeholderText}>
            {status === 'reconnecting' ? 'Reconnecting…' : 'Your friend is on the way…'}
          </Text>
        </View>
      )}
      {status === 'reconnecting' && remoteStreamUrl !== null && (
        <View style={styles.reconnectBadge}>
          <Text style={styles.reconnectText}>Reconnecting…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  video: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#FFFBEB',
    fontSize: 18,
    marginTop: 16,
    textAlign: 'center',
  },
  reconnectBadge: {
    position: 'absolute',
    top: 48,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  reconnectText: {
    color: '#FFFBEB',
    fontSize: 14,
  },
});
