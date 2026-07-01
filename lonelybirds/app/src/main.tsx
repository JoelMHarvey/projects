/**
 * LonelyBirds app entry point — the COMPOSITION ROOT.
 *
 * App.tsx is deliberately ignorant of the terminal and rtc packages (they are
 * injected via props so the owner-app and terminal-app halves integrate
 * without editing each other's files); this module is the one place that
 * actually wires them together:
 *
 * - `renderTerminal` → TerminalApp (app/src/terminal): EnterCode → Waiting →
 *   TerminalSessionScreen. Without this injection, Companion Terminal mode
 *   renders a placeholder and no bird ever gets a call.
 * - `observerFactory` → rtc SessionController in recv-only observer mode
 *   (app/src/rtc/observer), backing SessionScreen's "Join as observer"
 *   (P0 owner live-view). Without it the button shows a placeholder message.
 *
 * Dependencies are created lazily inside the factory so simply importing this
 * module never constructs the Supabase client (whose URL placeholder is only
 * substituted in real builds).
 */

import React from 'react';
import { AppRegistry } from 'react-native';
import App from './App';
import type { ObserverControllerFactory } from './api/sessionController';
import { NativeRTCProvider } from './rtc/NativeRTCProvider';
import { createObserverControllerFactory } from './rtc/observer';
import { TerminalApp } from './terminal/TerminalApp';
import { getRealtimeClient } from './terminal/terminalApi';

/**
 * Observer legs are short-lived: build a fresh recv-only controller per join
 * (a dedicated NativeRTCProvider — observers never capture media — over the
 * shared realtime client).
 */
const observerFactory: ObserverControllerFactory = (opts) =>
  createObserverControllerFactory({
    provider: new NativeRTCProvider(),
    realtimeClient: getRealtimeClient(),
  })(opts);

export function Root(): React.ReactElement {
  return <App renderTerminal={() => <TerminalApp />} observerFactory={observerFactory} />;
}

AppRegistry.registerComponent('LonelyBirds', () => Root);

export default Root;
