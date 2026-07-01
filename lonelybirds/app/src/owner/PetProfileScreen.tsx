/**
 * Create/edit a pet profile: name, species, photo URL, personality tags,
 * timezone (IANA name; availability windows are local to it).
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPet, updatePet } from '../api/queries';
import {
  PERSONALITY_TAGS,
  SPECIES,
  type PersonalityTag,
  type PetRow,
  type Species,
} from '../api/types';
import {
  Button,
  ErrorText,
  FieldLabel,
  Screen,
  colors,
  errorMessage,
  inputStyle,
} from './ui';

export interface PetProfileScreenProps {
  client: SupabaseClient;
  ownerId: string;
  /** Null → create a new pet. */
  pet: PetRow | null;
  onSaved: (pet: PetRow) => void;
  onBack?: () => void;
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    borderWidth: 1,
    borderColor: colors.teal,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginTop: 6,
  },
  chipOn: { backgroundColor: colors.teal },
  chipText: { color: colors.teal, fontWeight: '600' },
  chipTextOn: { color: '#FFFFFF' },
  hint: { fontSize: 12, color: colors.faint, marginTop: 4 },
});

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function Chip({ label, selected, onPress }: ChipProps): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
    >
      <Text style={selected ? styles.chipTextOn : styles.chipText}>{label}</Text>
    </Pressable>
  );
}

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

export function PetProfileScreen({
  client,
  ownerId,
  pet,
  onSaved,
  onBack,
}: PetProfileScreenProps): React.ReactElement {
  const [name, setName] = useState(pet?.name ?? '');
  const [species, setSpecies] = useState<Species>(pet?.species ?? 'bird');
  const [photoUrl, setPhotoUrl] = useState(pet?.photo_url ?? '');
  const [tags, setTags] = useState<PersonalityTag[]>(pet?.personality_tags ?? []);
  const [timezone, setTimezone] = useState(pet?.timezone ?? deviceTimezone());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleTag = (tag: PersonalityTag): void => {
    setTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    );
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const trimmedPhoto = photoUrl.trim();
      const fields = {
        name: name.trim(),
        species,
        photo_url: trimmedPhoto === '' ? null : trimmedPhoto,
        personality_tags: tags,
        timezone: timezone.trim(),
      };
      const saved = pet
        ? await updatePet(client, pet.id, fields)
        : await createPet(client, { owner_id: ownerId, ...fields });
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const ready = name.trim().length > 0 && timezone.trim().length > 0 && !busy;

  return (
    <Screen title={pet ? `Edit ${pet.name}` : 'New pet'} onBack={onBack}>
      <FieldLabel text="Name" />
      <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="Kiwi" />

      <FieldLabel text="Species" />
      <View style={styles.chipRow}>
        {SPECIES.map((s) => (
          <Chip key={s} label={s} selected={species === s} onPress={() => setSpecies(s)} />
        ))}
      </View>
      <Text style={styles.hint}>Birds first — other species are on the roadmap.</Text>

      <FieldLabel text="Photo URL (optional)" />
      <TextInput
        style={inputStyle}
        value={photoUrl}
        onChangeText={setPhotoUrl}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://…"
      />

      <FieldLabel text="Personality tags" />
      <View style={styles.chipRow}>
        {PERSONALITY_TAGS.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            selected={tags.includes(tag)}
            onPress={() => toggleTag(tag)}
          />
        ))}
      </View>

      <FieldLabel text="Timezone (IANA)" />
      <TextInput
        style={inputStyle}
        value={timezone}
        onChangeText={setTimezone}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Europe/London"
      />
      <Text style={styles.hint}>
        Availability windows are interpreted in this timezone.
      </Text>

      <ErrorText message={error} />
      <Button label={busy ? 'Saving…' : 'Save pet'} onPress={() => void save()} disabled={!ready} />
    </Screen>
  );
}
