/**
 * Suggested matches: same species, weekly schedule overlap (P0 filter — no
 * ML). Each match can receive a connection request; sessions become possible
 * only after the partner owner accepts (mutual consent).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MatchCandidate } from '../api/matching';
import { getMatches, requestConnection } from '../api/queries';
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
} from './ui';

export interface MatchesScreenProps {
  client: SupabaseClient;
  pet: PetRow;
  onBack?: () => void;
}

const styles = StyleSheet.create({
  petName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  petMeta: { fontSize: 13, color: colors.faint, marginTop: 2 },
  empty: { color: colors.faint, marginTop: 16 },
});

export function MatchesScreen({ client, pet, onBack }: MatchesScreenProps): React.ReactElement {
  const [matches, setMatches] = useState<MatchCandidate[] | null>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback((): void => {
    setMatches(null);
    setError(null);
    getMatches(client, pet.id)
      .then(setMatches)
      .catch((err: unknown) => {
        setError(errorMessage(err));
        setMatches([]);
      });
  }, [client, pet.id]);

  useEffect(load, [load]);

  const request = async (candidate: PetRow): Promise<void> => {
    setError(null);
    setInfo(null);
    try {
      await requestConnection(client, pet.id, candidate.id);
      setRequested((current) => new Set(current).add(candidate.id));
      setInfo(`Request sent to ${candidate.name}'s owner — sessions unlock once they accept.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Screen title={`Matches for ${pet.name}`} onBack={onBack}>
      <ErrorText message={error} />
      <InfoText message={info} />
      {matches === null ? (
        <Loading />
      ) : matches.length === 0 ? (
        <Text style={styles.empty}>
          No matches yet. Make sure {pet.name} has availability windows — matching needs a
          schedule overlap.
        </Text>
      ) : (
        matches.map(({ pet: candidate }) => (
          <Card key={candidate.id}>
            <Text style={styles.petName}>{candidate.name}</Text>
            <Text style={styles.petMeta}>
              {candidate.species} · {candidate.timezone}
              {candidate.personality_tags && candidate.personality_tags.length > 0
                ? ` · ${candidate.personality_tags.join(', ')}`
                : ''}
            </Text>
            <Button
              label={requested.has(candidate.id) ? 'Requested' : 'Request connection'}
              onPress={() => void request(candidate)}
              disabled={requested.has(candidate.id)}
            />
          </Card>
        ))
      )}
      <Button label="Refresh" kind="secondary" onPress={load} />
    </Screen>
  );
}
