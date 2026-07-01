// Ambient declarations so the repo typechecks under plain tsc.
// Supabase edge function entrypoints run on Deno; their _shared logic is pure
// TS tested under Node. The `Deno` global is only referenced in index.ts
// entrypoints (excluded from tsconfig include, but declared here defensively).

declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
  env: { get(name: string): string | undefined };
};

// react-native-webrtc is a native module we don't install in this environment.
// The NativeRTCProvider adapter types against this ambient module; the real
// dependency is added when the app is built in Xcode/Expo.
declare module 'react-native-webrtc' {
  export const RTCPeerConnection: unknown;
  export const RTCSessionDescription: unknown;
  export const RTCIceCandidate: unknown;
  export const mediaDevices: { getUserMedia(constraints: unknown): Promise<unknown> };
  export const RTCView: unknown;
}
