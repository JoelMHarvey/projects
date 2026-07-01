/**
 * Weekly availability editor: recurring windows (weekday + HH:MM–HH:MM),
 * local to the pet's timezone. "Save schedule" replaces the whole weekly
 * schedule server-side.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listAvailabilityWindows, replaceAvailabilityWindows } from '../api/queries';
import type { AvailabilityWindowInput, PetRow } from '../api/types';
import { WEEKDAY_LABELS, formatHHMM, parseWindowTimes } from './timeFormat';
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

export interface AvailabilityScreenProps {
  client: SupabaseClient;
  pet: PetRow;
  onBack?: () => void;
}

interface EditorRow {
  key: string;
  weekday: number;
  start: string;
  end: string;
}

const styles = StyleSheet.create({
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  day: {
    borderWidth: 1,
    borderColor: colors.teal,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    marginTop: 4,
  },
  dayOn: { backgroundColor: colors.teal },
  dayText: { color: colors.teal, fontSize: 12, fontWeight: '600' },
  dayTextOn: { color: '#FFFFFF' },
  timesRow: { flexDirection: 'row', alignItems: 'center' },
  timeInput: { ...inputStyle, width: 76, textAlign: 'center' },
  dash: { marginHorizontal: 8, color: colors.ink },
  remove: { marginLeft: 'auto' },
  removeText: { color: colors.danger, fontWeight: '600' },
  hint: { fontSize: 12, color: colors.faint, marginTop: 8 },
});

let rowCounter = 0;
function nextKey(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

export function AvailabilityScreen({
  client,
  pet,
  onBack,
}: AvailabilityScreenProps): React.ReactElement {
  const [rows, setRows] = useState<EditorRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAvailabilityWindows(client, pet.id)
      .then((windows) => {
        if (cancelled) return;
        setRows(
          windows.map((w) => ({
            key: nextKey(),
            weekday: w.weekday,
            start: formatHHMM(w.start_minute),
            end: formatHHMM(w.end_minute),
          })),
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(errorMessage(err));
          setRows([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, pet.id]);

  const updateRow = (key: string, patch: Partial<EditorRow>): void => {
    setRows((current) =>
      (current ?? []).map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
    setInfo(null);
  };

  const addRow = (): void => {
    setRows((current) => [
      ...(current ?? []),
      { key: nextKey(), weekday: 1, start: '09:00', end: '18:00' },
    ]);
    setInfo(null);
  };

  const removeRow = (key: string): void => {
    setRows((current) => (current ?? []).filter((row) => row.key !== key));
    setInfo(null);
  };

  const save = async (): Promise<void> => {
    const current = rows ?? [];
    const inputs: AvailabilityWindowInput[] = [];
    for (const row of current) {
      const times = parseWindowTimes(row.start, row.end);
      if (!times) {
        setError(
          `Invalid times "${row.start}–${row.end}" (${WEEKDAY_LABELS[row.weekday] ?? '?'}). ` +
            'Use HH:MM with start before end (end may be 24:00).',
        );
        return;
      }
      inputs.push({
        weekday: row.weekday,
        start_minute: times.startMinute,
        end_minute: times.endMinute,
      });
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await replaceAvailabilityWindows(client, pet.id, inputs);
      setInfo('Schedule saved.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={`${pet.name}'s availability`} onBack={onBack}>
      <Text style={styles.hint}>
        Times are local to {pet.timezone}. Sessions can only happen inside these windows.
      </Text>
      {rows === null ? (
        <Loading />
      ) : (
        <>
          {rows.map((row) => (
            <Card key={row.key}>
              <View style={styles.dayRow}>
                {WEEKDAY_LABELS.map((label, weekday) => (
                  <Pressable
                    key={label}
                    accessibilityRole="button"
                    onPress={() => updateRow(row.key, { weekday })}
                    style={[styles.day, row.weekday === weekday && styles.dayOn]}
                  >
                    <Text
                      style={row.weekday === weekday ? styles.dayTextOn : styles.dayText}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.timesRow}>
                <TextInput
                  style={styles.timeInput}
                  value={row.start}
                  onChangeText={(start) => updateRow(row.key, { start })}
                  placeholder="09:00"
                  autoCapitalize="none"
                />
                <Text style={styles.dash}>–</Text>
                <TextInput
                  style={styles.timeInput}
                  value={row.end}
                  onChangeText={(end) => updateRow(row.key, { end })}
                  placeholder="18:00"
                  autoCapitalize="none"
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => removeRow(row.key)}
                  style={styles.remove}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            </Card>
          ))}
          <Button label="Add window" kind="secondary" onPress={addRow} />
          <ErrorText message={error} />
          <InfoText message={info} />
          <Button
            label={busy ? 'Saving…' : 'Save schedule'}
            onPress={() => void save()}
            disabled={busy}
          />
        </>
      )}
    </Screen>
  );
}
