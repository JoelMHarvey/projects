/**
 * Pair a companion terminal: fetch a one-time 6-digit code from the
 * `create-pairing-code` edge function and display it. The old device enters
 * the code once (EnterCodeScreen, terminal mode) and becomes bound to the pet.
 */

import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPairingCode } from '../api/queries';
import type { CreatePairingCodeResponse, PetRow } from '../api/types';
import { Button, Card, ErrorText, Screen, colors, errorMessage } from './ui';

export interface PairTerminalScreenProps {
  client: SupabaseClient;
  pet: PetRow;
  onBack?: () => void;
}

const styles = StyleSheet.create({
  code: {
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: 10,
    color: colors.teal,
    textAlign: 'center',
    marginVertical: 8,
  },
  expiry: { textAlign: 'center', color: colors.faint, fontSize: 13 },
  steps: { color: colors.ink, marginTop: 16, lineHeight: 20 },
});

export function PairTerminalScreen({
  client,
  pet,
  onBack,
}: PairTerminalScreenProps): React.ReactElement {
  const [code, setCode] = useState<CreatePairingCodeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setCode(await createPairingCode(client, pet.id));
    } catch (err) {
      setError(errorMessage(err));
      setCode(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={`Pair a terminal for ${pet.name}`} onBack={onBack}>
      {code ? (
        <Card>
          <Text style={styles.code}>{code.code}</Text>
          <Text style={styles.expiry}>
            Valid until {new Date(code.expires_at).toLocaleTimeString()} (10 minutes).
          </Text>
        </Card>
      ) : null}
      <ErrorText message={error} />
      <Button
        label={busy ? 'Generating…' : code ? 'Generate a new code' : 'Generate pairing code'}
        onPress={() => void generate()}
        disabled={busy}
      />
      <Text style={styles.steps}>
        1. Install the app on the old device by the cage.{'\n'}
        2. Choose &quot;Companion Terminal&quot; at first launch.{'\n'}
        3. Enter this 6-digit code — no typing needed afterwards.{'\n'}
        4. Keep the device plugged in; the screen stays awake.
      </Text>
    </Screen>
  );
}
