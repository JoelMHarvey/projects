/**
 * Tiny shared UI primitives for the owner screens. MVP: function over polish,
 * dawn-light accents (amber/teal/cream) matching the landing page.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export const colors = {
  amber: '#F59E0B',
  teal: '#0F766E',
  cream: '#FFFBEB',
  ink: '#1F2937',
  faint: '#6B7280',
  danger: '#B91C1C',
  border: '#E5E7EB',
} as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  scrollContent: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: colors.faint, marginTop: 12, marginBottom: 4 },
  error: { color: colors.danger, marginVertical: 8 },
  info: { color: colors.teal, marginVertical: 8 },
  button: {
    backgroundColor: colors.teal,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.teal },
  buttonDanger: { backgroundColor: colors.danger },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#FFFFFF', fontWeight: '600' },
  buttonTextSecondary: { color: colors.teal, fontWeight: '600' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginVertical: 6,
  },
  backRow: { marginBottom: 8 },
  backText: { color: colors.teal, fontWeight: '600' },
});

export interface ScreenProps {
  title: string;
  onBack?: (() => void) | undefined;
  children: React.ReactNode;
}

/** Scrollable screen scaffold with a title and optional back link. */
export function Screen({ title, onBack, children }: ScreenProps): React.ReactElement {
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {onBack ? (
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.backRow}>
            <Text style={styles.backText}>{'< Back'}</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title}>{title}</Text>
        {children}
      </ScrollView>
    </View>
  );
}

export interface ButtonProps {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled = false,
}: ButtonProps): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        kind === 'secondary' && styles.buttonSecondary,
        kind === 'danger' && styles.buttonDanger,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={kind === 'secondary' ? styles.buttonTextSecondary : styles.buttonText}>
        {label}
      </Text>
    </Pressable>
  );
}

export function FieldLabel({ text }: { text: string }): React.ReactElement {
  return <Text style={styles.label}>{text}</Text>;
}

export function ErrorText({ message }: { message: string | null }): React.ReactElement | null {
  if (!message) return null;
  return <Text style={styles.error}>{message}</Text>;
}

export function InfoText({ message }: { message: string | null }): React.ReactElement | null {
  if (!message) return null;
  return <Text style={styles.info}>{message}</Text>;
}

export function Card({ children }: { children: React.ReactNode }): React.ReactElement {
  return <View style={styles.card}>{children}</View>;
}

export function Loading(): React.ReactElement {
  return (
    <View style={{ paddingVertical: 24, alignItems: 'center' }}>
      <ActivityIndicator color={colors.teal} />
    </View>
  );
}

/** Coerce a thrown value to a display string. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const inputStyle = {
  backgroundColor: '#FFFFFF',
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 8,
  paddingHorizontal: 10,
  paddingVertical: 8,
  color: colors.ink,
} as const;
