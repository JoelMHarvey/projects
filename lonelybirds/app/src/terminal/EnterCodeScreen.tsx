/**
 * EnterCodeScreen — first (and only) typing the old device ever needs.
 * The owner reads a 6-digit code off PairTerminalScreen; entering it here
 * calls the anon `pair-device` edge function and binds this device as the
 * pet's companion terminal.
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { isValidPairingCode, PAIRING_CODE_LENGTH } from '../core/pairing';
import { pairDevice, type PairDeviceResult } from './terminalApi';

export interface EnterCodeScreenProps {
  /** Human-readable name stored on the devices row. */
  deviceName?: string;
  onPaired: (result: PairDeviceResult) => void;
}

export function EnterCodeScreen({
  deviceName = 'Companion Terminal',
  onPaired,
}: EnterCodeScreenProps): JSX.Element {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = isValidPairingCode(code) && !submitting;

  const handleChange = (text: string): void => {
    setError(null);
    setCode(text.replace(/[^0-9]/g, '').slice(0, PAIRING_CODE_LENGTH));
  };

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await pairDevice(code, deviceName);
      onPaired(result);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'That code did not work. Codes expire after 10 minutes — ask for a fresh one.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pair this terminal</Text>
      <Text style={styles.subtitle}>
        Enter the 6-digit code shown in the LonelyBirds app on your phone.
      </Text>
      <TextInput
        style={styles.codeInput}
        value={code}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={PAIRING_CODE_LENGTH}
        placeholder="000000"
        placeholderTextColor="#d1cbb8"
        autoFocus
        accessibilityLabel="Pairing code"
        testID="pairing-code-input"
      />
      {error !== null && (
        <Text style={styles.error} testID="pairing-error">
          {error}
        </Text>
      )}
      <Pressable
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={() => void handleSubmit()}
        disabled={!canSubmit}
        accessibilityRole="button"
        testID="pairing-submit"
      >
        {submitting ? (
          <ActivityIndicator color="#FFFBEB" />
        ) : (
          <Text style={styles.buttonText}>Pair device</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F766E',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#57534e',
    textAlign: 'center',
    marginBottom: 32,
  },
  codeInput: {
    fontSize: 40,
    letterSpacing: 12,
    fontVariant: ['tabular-nums'],
    color: '#1c1917',
    borderBottomWidth: 2,
    borderBottomColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 240,
    textAlign: 'center',
    marginBottom: 16,
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#FFFBEB',
    fontSize: 18,
    fontWeight: '600',
  },
});
