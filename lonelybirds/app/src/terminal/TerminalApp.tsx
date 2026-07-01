/**
 * TerminalApp — root of Companion Terminal mode, injected at the app root
 * via App's `renderTerminal` prop. Hand-rolled stack (no react-navigation,
 * per CONTRACTS.md):
 *
 *   EnterCodeScreen (unpaired) → WaitingScreen (paired, idle)
 *     → TerminalSessionScreen (session running) → back to WaitingScreen
 *
 * Pairing is persisted through a tiny storage seam (in-memory default,
 * mirroring ModeGate's pattern) so the app root can inject durable storage
 * later without touching this file.
 */

import { useCallback, useEffect, useState } from 'react';
import type { PairDeviceResult, SessionStartPush } from './terminalApi';
import { EnterCodeScreen } from './EnterCodeScreen';
import { TerminalSessionScreen } from './TerminalSessionScreen';
import { WaitingScreen } from './WaitingScreen';

export interface TerminalPairing {
  deviceId: string;
  petId: string;
}

/** Persistence seam for the terminal's pairing. */
export interface PairingStorage {
  get(): Promise<TerminalPairing | null>;
  set(pairing: TerminalPairing): Promise<void>;
}

export function createMemoryPairingStorage(
  initial: TerminalPairing | null = null,
): PairingStorage {
  let stored: TerminalPairing | null = initial;
  return {
    get: async () => stored,
    set: async (pairing) => {
      stored = pairing;
    },
  };
}

/** Default shared storage: pairing survives remounts within the process. */
export const defaultPairingStorage: PairingStorage = createMemoryPairingStorage();

export interface TerminalAppProps {
  storage?: PairingStorage;
  petName?: string;
}

type TerminalRoute =
  | { name: 'loading' }
  | { name: 'enterCode' }
  | { name: 'waiting'; pairing: TerminalPairing }
  | { name: 'session'; pairing: TerminalPairing; push: SessionStartPush };

export function TerminalApp({
  storage = defaultPairingStorage,
  petName,
}: TerminalAppProps): JSX.Element | null {
  const [route, setRoute] = useState<TerminalRoute>({ name: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void storage.get().then((pairing) => {
      if (cancelled) return;
      setRoute(pairing ? { name: 'waiting', pairing } : { name: 'enterCode' });
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const handlePaired = useCallback(
    (result: PairDeviceResult) => {
      const pairing: TerminalPairing = { deviceId: result.device_id, petId: result.pet_id };
      void storage.set(pairing);
      setRoute({ name: 'waiting', pairing });
    },
    [storage],
  );

  const handleSessionStart = useCallback((pairing: TerminalPairing, push: SessionStartPush) => {
    setRoute({ name: 'session', pairing, push });
  }, []);

  const handleSessionEnded = useCallback((pairing: TerminalPairing) => {
    setRoute({ name: 'waiting', pairing });
  }, []);

  switch (route.name) {
    case 'loading':
      return null;
    case 'enterCode':
      return <EnterCodeScreen onPaired={handlePaired} />;
    case 'waiting': {
      const { pairing } = route;
      return (
        <WaitingScreen
          deviceId={pairing.deviceId}
          petId={pairing.petId}
          petName={petName}
          onSessionStart={(push) => handleSessionStart(pairing, push)}
        />
      );
    }
    case 'session': {
      const { pairing, push } = route;
      return (
        <TerminalSessionScreen
          sessionId={push.session_id}
          petId={pairing.petId}
          partnerPetId={push.partner_pet_id}
          onSessionEnded={() => handleSessionEnded(pairing)}
        />
      );
    }
  }
}
