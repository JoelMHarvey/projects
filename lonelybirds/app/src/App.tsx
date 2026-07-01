/**
 * LonelyBirds app root. One app, two modes (ModeGate): Owner Remote (built
 * here) and Companion Terminal (owned by app/src/terminal — injected via the
 * `renderTerminal` prop so the two halves integrate without editing this
 * file). Navigation is a hand-rolled stack held in component state — no
 * react-navigation, per CONTRACTS.md.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getClient } from './api/client';
import type { ConnectionWithPartner } from './api/queries';
import { listPetsByOwner } from './api/queries';
import type { ObserverControllerFactory } from './api/sessionController';
import type { PetRow } from './api/types';
import { ModeGate, type ModeStorage } from './ModeGate';
import { AvailabilityScreen } from './owner/AvailabilityScreen';
import { ConnectionsScreen } from './owner/ConnectionsScreen';
import { MatchesScreen } from './owner/MatchesScreen';
import { PairTerminalScreen } from './owner/PairTerminalScreen';
import { PetProfileScreen } from './owner/PetProfileScreen';
import { SessionScreen } from './owner/SessionScreen';
import { SignInScreen, type SignedInOwner } from './owner/SignInScreen';
import {
  Button,
  Card,
  ErrorText,
  Loading,
  Screen,
  colors,
  errorMessage,
} from './owner/ui';

// ---------------------------------------------------------------------------
// Owner-mode stack navigation (hand-rolled: an array of route objects)
// ---------------------------------------------------------------------------

type OwnerRoute =
  | { name: 'pets' }
  | { name: 'petMenu'; pet: PetRow }
  | { name: 'petProfile'; pet: PetRow | null }
  | { name: 'availability'; pet: PetRow }
  | { name: 'matches'; pet: PetRow }
  | { name: 'connections'; pet: PetRow }
  | { name: 'pairTerminal'; pet: PetRow }
  | { name: 'session'; pet: PetRow; item: ConnectionWithPartner };

const styles = StyleSheet.create({
  petName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  petMeta: { fontSize: 13, color: colors.faint, marginTop: 2 },
  empty: { color: colors.faint, marginTop: 12 },
  placeholder: {
    flex: 1,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  placeholderText: { color: '#F9FAFB', textAlign: 'center', lineHeight: 20 },
});

interface PetsHomeProps {
  client: SupabaseClient;
  owner: SignedInOwner;
  onOpenPet: (pet: PetRow) => void;
  onAddPet: () => void;
  onSignOut: () => void;
}

function PetsHome({
  client,
  owner,
  onOpenPet,
  onAddPet,
  onSignOut,
}: PetsHomeProps): React.ReactElement {
  const [pets, setPets] = useState<PetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPetsByOwner(client, owner.id)
      .then((rows) => {
        if (!cancelled) setPets(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(errorMessage(err));
          setPets([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, owner.id]);

  return (
    <Screen title="Your pets">
      <ErrorText message={error} />
      {pets === null ? (
        <Loading />
      ) : pets.length === 0 ? (
        <Text style={styles.empty}>No pets yet — add your bird to get started.</Text>
      ) : (
        pets.map((pet) => (
          <Card key={pet.id}>
            <Text style={styles.petName}>{pet.name}</Text>
            <Text style={styles.petMeta}>
              {pet.species} · {pet.timezone}
            </Text>
            <Button label="Open" onPress={() => onOpenPet(pet)} />
          </Card>
        ))
      )}
      <Button label="Add pet" kind="secondary" onPress={onAddPet} />
      <Button label="Sign out" kind="secondary" onPress={onSignOut} />
    </Screen>
  );
}

interface PetMenuProps {
  pet: PetRow;
  onNavigate: (route: OwnerRoute) => void;
  onBack: () => void;
}

function PetMenu({ pet, onNavigate, onBack }: PetMenuProps): React.ReactElement {
  return (
    <Screen title={pet.name} onBack={onBack}>
      <Button label="Profile" onPress={() => onNavigate({ name: 'petProfile', pet })} />
      <Button label="Availability" onPress={() => onNavigate({ name: 'availability', pet })} />
      <Button label="Matches" onPress={() => onNavigate({ name: 'matches', pet })} />
      <Button label="Connections & sessions" onPress={() => onNavigate({ name: 'connections', pet })} />
      <Button label="Pair terminal" onPress={() => onNavigate({ name: 'pairTerminal', pet })} />
    </Screen>
  );
}

interface OwnerAppProps {
  client: SupabaseClient;
  observerFactory?: ObserverControllerFactory | undefined;
}

function OwnerApp({ client, observerFactory }: OwnerAppProps): React.ReactElement {
  const [owner, setOwner] = useState<SignedInOwner | null>(null);
  const [stack, setStack] = useState<OwnerRoute[]>([{ name: 'pets' }]);

  const push = useCallback((route: OwnerRoute): void => {
    setStack((prev) => [...prev, route]);
  }, []);

  const pop = useCallback((): void => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const signOut = useCallback((): void => {
    void client.auth.signOut().catch(() => undefined);
    setOwner(null);
    setStack([{ name: 'pets' }]);
  }, [client]);

  /** After saving a pet, land on (or refresh) its menu. */
  const handlePetSaved = useCallback((saved: PetRow): void => {
    setStack((prev) => {
      const withoutTop = prev.slice(0, -1);
      const beneath = withoutTop[withoutTop.length - 1];
      if (beneath && beneath.name === 'petMenu') {
        return [...withoutTop.slice(0, -1), { name: 'petMenu', pet: saved }];
      }
      return [...withoutTop, { name: 'petMenu', pet: saved }];
    });
  }, []);

  if (!owner) {
    return <SignInScreen client={client} onSignedIn={setOwner} />;
  }

  const route = stack[stack.length - 1] ?? { name: 'pets' as const };

  switch (route.name) {
    case 'pets':
      return (
        <PetsHome
          client={client}
          owner={owner}
          onOpenPet={(pet) => push({ name: 'petMenu', pet })}
          onAddPet={() => push({ name: 'petProfile', pet: null })}
          onSignOut={signOut}
        />
      );
    case 'petMenu':
      return <PetMenu pet={route.pet} onNavigate={push} onBack={pop} />;
    case 'petProfile':
      return (
        <PetProfileScreen
          client={client}
          ownerId={owner.id}
          pet={route.pet}
          onSaved={handlePetSaved}
          onBack={pop}
        />
      );
    case 'availability':
      return <AvailabilityScreen client={client} pet={route.pet} onBack={pop} />;
    case 'matches':
      return <MatchesScreen client={client} pet={route.pet} onBack={pop} />;
    case 'connections':
      return (
        <ConnectionsScreen
          client={client}
          ownerId={owner.id}
          pet={route.pet}
          onOpenSession={(item) => push({ name: 'session', pet: route.pet, item })}
          onBack={pop}
        />
      );
    case 'pairTerminal':
      return <PairTerminalScreen client={client} pet={route.pet} onBack={pop} />;
    case 'session':
      return (
        <SessionScreen
          client={client}
          ownerId={owner.id}
          pet={route.pet}
          item={route.item}
          observerFactory={observerFactory}
          onBack={pop}
        />
      );
  }
}

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------

function TerminalPlaceholder(): React.ReactElement {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>
        Companion Terminal mode.{'\n'}
        The terminal UI lives in app/src/terminal and is injected at the app
        root via the renderTerminal prop.
      </Text>
    </View>
  );
}

export interface AppProps {
  /** Defaults to the shared client from api/client (env placeholders). */
  client?: SupabaseClient;
  /** Defaults to in-memory mode persistence (chosen once per process). */
  modeStorage?: ModeStorage;
  /** Terminal-mode root (app/src/terminal) — placeholder until integrated. */
  renderTerminal?: () => React.ReactElement;
  /** rtc SessionController factory for the owner observer view. */
  observerFactory?: ObserverControllerFactory;
}

export default function App(props: AppProps): React.ReactElement {
  const client = useMemo(() => props.client ?? getClient(), [props.client]);
  const renderTerminal = props.renderTerminal ?? (() => <TerminalPlaceholder />);
  const gateProps = props.modeStorage ? { storage: props.modeStorage } : {};
  return (
    <ModeGate
      {...gateProps}
      renderOwner={() => (
        <OwnerApp client={client} observerFactory={props.observerFactory} />
      )}
      renderTerminal={renderTerminal}
    />
  );
}
