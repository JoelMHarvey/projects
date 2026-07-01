/**
 * Connection management: accept incoming requests (mutual consent), pause /
 * resume, delete, block, and report. Reporting suspends the connection
 * (paused) pending review, per the trust & safety requirement.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  acceptConnection,
  blockConnection,
  canAcceptConnection,
  deleteConnection,
  listConnectionsForPet,
  pauseConnection,
  reportConnection,
  resumeConnection,
  type ConnectionWithPartner,
} from '../api/queries';
import type { PetRow } from '../api/types';
import {
  Button,
  Card,
  ErrorText,
  InfoText,
  Loading,
  Screen,
  colors,
  errorMessage,
  inputStyle,
} from './ui';

export interface ConnectionsScreenProps {
  client: SupabaseClient;
  ownerId: string;
  pet: PetRow;
  onOpenSession: (item: ConnectionWithPartner) => void;
  onBack?: () => void;
}

const styles = StyleSheet.create({
  partner: { fontSize: 16, fontWeight: '700', color: colors.ink },
  status: { fontSize: 13, color: colors.faint, marginTop: 2 },
  empty: { color: colors.faint, marginTop: 16 },
});

export function ConnectionsScreen({
  client,
  ownerId,
  pet,
  onOpenSession,
  onBack,
}: ConnectionsScreenProps): React.ReactElement {
  const [items, setItems] = useState<ConnectionWithPartner[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');

  const load = useCallback((): void => {
    setItems(null);
    setError(null);
    listConnectionsForPet(client, pet.id)
      .then(setItems)
      .catch((err: unknown) => {
        setError(errorMessage(err));
        setItems([]);
      });
  }, [client, pet.id]);

  useEffect(load, [load]);

  const run = async (action: () => Promise<unknown>, doneMessage?: string): Promise<void> => {
    setError(null);
    setInfo(null);
    try {
      await action();
      if (doneMessage) setInfo(doneMessage);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const submitReport = (connectionId: string): void => {
    const reason = reportReason.trim();
    if (reason === '') {
      setError('Please describe the problem before reporting.');
      return;
    }
    setReportingId(null);
    setReportReason('');
    void run(async () => {
      await reportConnection(client, connectionId, ownerId, reason);
      // Flagged connections are suspended pending review.
      await pauseConnection(client, connectionId);
    }, 'Report filed — the connection is suspended pending review.');
  };

  return (
    <Screen title={`${pet.name}'s connections`} onBack={onBack}>
      <ErrorText message={error} />
      <InfoText message={info} />
      {items === null ? (
        <Loading />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>No connections yet — find one in Matches.</Text>
      ) : (
        items.map((item) => {
          const { connection, partnerPet } = item;
          const pendingMine =
            connection.status === 'pending' &&
            connection.requested_by_pet_id === pet.id;
          return (
            <Card key={connection.id}>
              <Text style={styles.partner}>{partnerPet?.name ?? 'Unknown pet'}</Text>
              <Text style={styles.status}>
                {connection.status}
                {pendingMine ? ' · waiting for their owner to accept' : ''}
              </Text>

              {canAcceptConnection(connection, pet.id) ? (
                <Button
                  label="Accept request"
                  onPress={() => void run(() => acceptConnection(client, connection.id), 'Connection active.')}
                />
              ) : null}

              {connection.status === 'active' ? (
                <>
                  <Button label="Sessions" onPress={() => onOpenSession(item)} />
                  <Button
                    label="Pause"
                    kind="secondary"
                    onPress={() => void run(() => pauseConnection(client, connection.id))}
                  />
                </>
              ) : null}

              {connection.status === 'paused' ? (
                <Button
                  label="Resume"
                  kind="secondary"
                  onPress={() => void run(() => resumeConnection(client, connection.id))}
                />
              ) : null}

              {connection.status !== 'blocked' ? (
                <Button
                  label="Block"
                  kind="danger"
                  onPress={() => void run(() => blockConnection(client, connection.id), 'Connection blocked.')}
                />
              ) : null}

              <Button
                label="Delete"
                kind="danger"
                onPress={() => void run(() => deleteConnection(client, connection.id), 'Connection deleted.')}
              />

              {reportingId === connection.id ? (
                <>
                  <TextInput
                    style={inputStyle}
                    value={reportReason}
                    onChangeText={setReportReason}
                    placeholder="What went wrong?"
                  />
                  <Button label="Submit report" kind="danger" onPress={() => submitReport(connection.id)} />
                  <Button
                    label="Cancel"
                    kind="secondary"
                    onPress={() => {
                      setReportingId(null);
                      setReportReason('');
                    }}
                  />
                </>
              ) : (
                <Button
                  label="Report"
                  kind="secondary"
                  onPress={() => setReportingId(connection.id)}
                />
              )}
            </Card>
          );
        })
      )}
      <Button label="Refresh" kind="secondary" onPress={load} />
    </Screen>
  );
}
