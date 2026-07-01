/**
 * Email + password auth via Supabase Auth. Sign-up sends a verification
 * email (Supabase default); the user verifies, then signs in here.
 */

import React, { useState } from 'react';
import { TextInput } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureOwnerRow } from '../api/queries';
import {
  Button,
  ErrorText,
  FieldLabel,
  InfoText,
  Screen,
  errorMessage,
  inputStyle,
} from './ui';

export interface SignedInOwner {
  id: string;
  email: string | null;
}

export interface SignInScreenProps {
  client: SupabaseClient;
  onSignedIn: (owner: SignedInOwner) => void;
}

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

export function SignInScreen({ client, onSignedIn }: SignInScreenProps): React.ReactElement {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const finishSignIn = async (userId: string, userEmail: string | null): Promise<void> => {
    await ensureOwnerRow(client, {
      id: userId,
      email: userEmail,
      timezone: deviceTimezone(),
    });
    onSignedIn({ id: userId, email: userEmail });
  };

  const signIn = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { data, error: authError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      if (!data.user) {
        setError('Sign-in failed — no user returned.');
        return;
      }
      await finishSignIn(data.user.id, data.user.email ?? null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const signUp = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { data, error: authError } = await client.auth.signUp({
        email: email.trim(),
        password,
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      if (data.session && data.user) {
        // Email confirmation disabled on this project — signed in directly.
        await finishSignIn(data.user.id, data.user.email ?? null);
        return;
      }
      setInfo(
        'Account created. Check your inbox for a verification email, then come back and sign in.',
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const ready = email.trim().length > 0 && password.length > 0 && !busy;

  return (
    <Screen title="LonelyBirds — Sign in">
      <FieldLabel text="Email" />
      <TextInput
        style={inputStyle}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="you@example.com"
      />
      <FieldLabel text="Password" />
      <TextInput
        style={inputStyle}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        placeholder="********"
      />
      <ErrorText message={error} />
      <InfoText message={info} />
      <Button label={busy ? 'Working…' : 'Sign in'} onPress={() => void signIn()} disabled={!ready} />
      <Button
        label="Create account"
        kind="secondary"
        onPress={() => void signUp()}
        disabled={!ready}
      />
      <InfoText message="New accounts must verify their email address before signing in." />
    </Screen>
  );
}
