import { describe, expect, it } from 'vitest';
import { MockRTCProvider } from './MockRTCProvider';
import type { MediaStreamHandle, PeerConnectionState } from './provider';

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('MockRTCProvider', () => {
  it('links an offer/answer pair and exchanges streams (sendrecv)', async () => {
    const provider = new MockRTCProvider();
    const a = provider.createPeer();
    const b = provider.createPeer();
    a.setLocalStream(await provider.getLocalStream());
    b.setLocalStream(await provider.getLocalStream());

    const aStates: PeerConnectionState[] = [];
    const bStates: PeerConnectionState[] = [];
    const aTracks: MediaStreamHandle[] = [];
    const bTracks: MediaStreamHandle[] = [];
    a.onConnectionStateChange((s) => aStates.push(s));
    b.onConnectionStateChange((s) => bStates.push(s));
    a.onTrack((t) => aTracks.push(t));
    b.onTrack((t) => bTracks.push(t));

    const offer = await a.createOffer();
    const answer = await b.acceptOffer(offer);
    await a.acceptAnswer(answer);

    expect(aStates).toEqual(['connecting', 'connected']);
    expect(bStates).toEqual(['connecting', 'connected']);
    expect(aTracks).toHaveLength(1);
    expect(bTracks).toHaveLength(1);
    expect(a.linkedTo).toBe(b);
  });

  it('sendonly offerer: only the answerer receives a track', async () => {
    const provider = new MockRTCProvider();
    const sender = provider.createPeer({ direction: 'sendonly' });
    const receiver = provider.createPeer({ direction: 'recvonly' });
    sender.setLocalStream(await provider.getLocalStream());

    const senderTracks: MediaStreamHandle[] = [];
    const receiverTracks: MediaStreamHandle[] = [];
    sender.onTrack((t) => senderTracks.push(t));
    receiver.onTrack((t) => receiverTracks.push(t));

    const answer = await receiver.acceptOffer(await sender.createOffer());
    await sender.acceptAnswer(answer);

    expect(receiverTracks).toHaveLength(1);
    expect(senderTracks).toHaveLength(0);
  });

  it('emits ICE candidates on offer/answer creation and records addIce', async () => {
    const provider = new MockRTCProvider();
    const a = provider.createPeer();
    const b = provider.createPeer();
    const seen: string[] = [];
    a.onIce((c) => seen.push(c.candidate));

    const offer = await a.createOffer();
    expect(seen).toHaveLength(1);

    await b.acceptOffer(offer);
    await b.addIce({ candidate: seen[0]!, sdpMid: '0', sdpMLineIndex: 0 });
    expect(b.remoteCandidates).toHaveLength(1);
  });

  it('severPair fires disconnected on both sides; close notifies the remote asynchronously', async () => {
    const provider = new MockRTCProvider();
    const a = provider.createPeer();
    const b = provider.createPeer();
    await a.acceptAnswer(await b.acceptOffer(await a.createOffer()));

    const aStates: PeerConnectionState[] = [];
    const bStates: PeerConnectionState[] = [];
    a.onConnectionStateChange((s) => aStates.push(s));
    b.onConnectionStateChange((s) => bStates.push(s));

    provider.severPair(a);
    expect(aStates).toEqual(['disconnected']);
    expect(bStates).toEqual(['disconnected']);

    // Re-link, then close one side: remote sees 'disconnected' on a microtask.
    await a.acceptAnswer(await b.acceptOffer(await a.createOffer()));
    a.close();
    await flush();
    expect(aStates[aStates.length - 1]).toBe('closed');
    expect(bStates[bStates.length - 1]).toBe('disconnected');
    await expect(a.createOffer()).rejects.toThrow(/after close/);
  });
});
