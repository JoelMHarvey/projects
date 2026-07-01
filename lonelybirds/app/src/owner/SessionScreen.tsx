/**
 * Session control for one connection: "Start session now" (remote trigger via
 * the `request-session` edge function), a live session list (polled), approve
 * or decline pending requests, join as a silent observer (recv-only — wiring
 * lands with the rtc SessionController), and End.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  endSession,
  listLiveSessionsForConnection,
  requestSession,
  respondSession,
  type ConnectionWithPartner,
} from '../api/queries';
import type {
  ObserverControllerFactory,
  ObserverSessionHandle,
} from '../api/sessionController';
import type { PetRow, SessionRow } from '../api/types';
import {
  Button,
  Card,
  ErrorText,
  InfoText,
  Loading,
  Screen,
  colors,
  errorMessage,
} from './ui';

export interface SessionScreenProps {
  client: SupabaseClient;
  ownerId: string;
  pet: PetRow;
  item: ConnectionWithPartner;
  /** Injected once app/src/rtc lands; undefined → observer placeholder. */
  observerFactory?: ObserverControllerFactory;
  onBack?: () => void;
}

const POLL_INTERVAL_MS = 5_000;

const styles = StyleSheet.create({
  sessionTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  sessionMeta: { fontSize: 13, color: colors.faint, marginTop: 2 },
  observer: { fontSize: 13, color: colors.teal, marginTop: 6 },
  empty: { color: colors.faint, marginTop: 12 },
});

interface ObserverState {
  sessionId: string;
  handle: ObserverSessionHandle;
  state: string;
}

export function SessionScreen({
  client,
  ownerId,
  pet,
  item,
  observerFactory,
  onBack,
}: SessionScreenProps): React.ReactElement {
  const { connection, partnerPet } = item;
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [observer, setObserver] = useState<ObserverState | null>(null);
  const observerRef = useRef<ObserverState | null>(null);
  observerRef.current = observer;

  const load = useCallback((): void => {
    listLiveSessionsForConnection(client, connection.id)
      .then(setSessions)
      .catch((err: unknown) => {
        setError(errorMessage(err));
        setSessions((current) => current ?? []);
      });
  }, [client, connection.id]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Leave any observed session on unmount.
  useEffect(
    () => () => {
      void observerRef.current?.handle.leave();
    },
    [],
  );

  const run = async (action: () => Promise<unknown>, doneMessage?: string): Promise<void> => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await action();
      if (doneMessage) setInfo(doneMessage);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const startNow = (): void => {
    void run(async () => {
      const result = await requestSession(client, connection.id);
      setInfo(
        result.status === 'connecting'
          ? 'Session starting — both terminals have been notified.'
          : `Outside ${partnerPet?.name ?? 'the partner'}'s availability window — their owner has been asked to approve.`,
      );
    });
  };

  const joinAsObserver = (session: SessionRow): void => {
    if (!observerFactory) {
      setInfo(
        'Observer view is wired to the rtc SessionController — available once the video layer is integrated.',
      );
      return;
    }
    const previous = observerRef.current;
    if (previous) void previous.handle.leave();
    const handle = observerFactory({ sessionId: session.id, ownerId });
    handle.onStateChange((state) => {
      setObserver((current) =>
        current && current.sessionId === session.id ? { ...current, state } : current,
      );
    });
    setObserver({ sessionId: session.id, handle, state: 'joining' });
    void handle
      .join()
      .catch((err: unknown) => setError(`Observer join failed: ${errorMessage(err)}`));
  };

  const leaveObserver = (): void => {
    const current = observerRef.current;
    if (current) void current.handle.leave();
    setObserver(null);
  };

  return (
    <Screen title={`Sessions with ${partnerPet?.name ?? 'partner'}`} onBack={onBack}>
      <Button
        label={busy ? 'Working…' : 'Start session now'}
        onPress={startNow}
        disabled={busy || connection.status !== 'active'}
      />
      {connection.status !== 'active' ? (
        <Text style={styles.empty}>
          Connection is {connection.status} — sessions need an active connection.
        </Text>
      ) : null}
      <ErrorText message={error} />
      <InfoText message={info} />

      {sessions === null ? (
        <Loading />
      ) : sessions.length === 0 ? (
        <Text style={styles.empty}>No live session right now.</Text>
      ) : (
        sessions.map((session) => (
          <Card key={session.id}>
            <Text style={styles.sessionTitle}>
              {pet.name} × {partnerPet?.name ?? '?'} — {session.status}
            </Text>
            <Text style={styles.sessionMeta}>
              {session.started_at
                ? `Started ${new Date(session.started_at).toLocaleTimeString()}`
                : 'Not started yet'}
              {session.scheduled_end_at
                ? ` · ends by ${new Date(session.scheduled_end_at).toLocaleTimeString()}`
                : ''}
            </Text>

            {session.status === 'pending_approval' ? (
              <>
                <Button
                  label="Approve"
                  onPress={() =>
                    void run(
                      () => respondSession(client, session.id, true),
                      'Approved — terminals connecting.',
                    )
                  }
                  disabled={busy}
                />
                <Button
                  label="Decline"
                  kind="secondary"
                  onPress={() =>
                    void run(() => respondSession(client, session.id, false), 'Declined.')
                  }
                  disabled={busy}
                />
              </>
            ) : null}

            {observer?.sessionId === session.id ? (
              <>
                <Text style={styles.observer}>Observing (silent) — {observer.state}</Text>
                <Button label="Leave observer view" kind="secondary" onPress={leaveObserver} />
              </>
            ) : (
              <Button
                label="Join as observer"
                kind="secondary"
                onPress={() => joinAsObserver(session)}
              />
            )}

            <Button
              label="End session"
              kind="danger"
              onPress={() =>
                void run(
                  () => endSession(client, session.id, 'owner_ended'),
                  'Session ended.',
                )
              }
              disabled={busy}
            />
          </Card>
        ))
      )}
      <Button label="Refresh" kind="secondary" onPress={load} />
    </Screen>
  );
}
