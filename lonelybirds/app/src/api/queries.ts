/**
 * Typed data-access helpers for the owner app. All reads/writes run with the
 * signed-in owner's JWT and rely on the RLS policies in
 * supabase/migrations/0003_rls.sql; session state changes go through the edge
 * functions (service role) via `supabase.functions.invoke`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Window } from '../core/availability';
import { filterMatches, windowFromRow, type MatchCandidate } from './matching';
import type {
  AvailabilityWindowInput,
  AvailabilityWindowRow,
  ClientEndReason,
  ConnectionRow,
  CreatePairingCodeResponse,
  EndSessionResponse,
  OwnerRow,
  OwnerUpsert,
  PetInsert,
  PetRow,
  PetUpdate,
  ReportRow,
  RequestSessionResponse,
  RespondSessionResponse,
  SessionRow,
} from './types';
import { LIVE_SESSION_STATUSES } from './types';

interface PostgrestErrorLike {
  message: string;
}

function raise(context: string, error: PostgrestErrorLike): never {
  throw new Error(`${context}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

/** Idempotently create/refresh the caller's `owners` profile row. */
export async function ensureOwnerRow(
  client: SupabaseClient,
  owner: OwnerUpsert,
): Promise<OwnerRow> {
  const { data, error } = await client
    .from('owners')
    .upsert(owner, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) raise('ensureOwnerRow', error);
  return data as OwnerRow;
}

export async function getOwner(
  client: SupabaseClient,
  ownerId: string,
): Promise<OwnerRow | null> {
  const { data, error } = await client
    .from('owners')
    .select('*')
    .eq('id', ownerId)
    .maybeSingle();
  if (error) raise('getOwner', error);
  return (data as OwnerRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// Pets (CRUD)
// ---------------------------------------------------------------------------

export async function createPet(
  client: SupabaseClient,
  input: PetInsert,
): Promise<PetRow> {
  const { data, error } = await client
    .from('pets')
    .insert(input)
    .select('*')
    .single();
  if (error) raise('createPet', error);
  return data as PetRow;
}

export async function updatePet(
  client: SupabaseClient,
  petId: string,
  patch: PetUpdate,
): Promise<PetRow> {
  const { data, error } = await client
    .from('pets')
    .update(patch)
    .eq('id', petId)
    .select('*')
    .single();
  if (error) raise('updatePet', error);
  return data as PetRow;
}

export async function deletePet(client: SupabaseClient, petId: string): Promise<void> {
  const { error } = await client.from('pets').delete().eq('id', petId);
  if (error) raise('deletePet', error);
}

export async function getPet(
  client: SupabaseClient,
  petId: string,
): Promise<PetRow | null> {
  const { data, error } = await client
    .from('pets')
    .select('*')
    .eq('id', petId)
    .maybeSingle();
  if (error) raise('getPet', error);
  return (data as PetRow | null) ?? null;
}

export async function listPetsByOwner(
  client: SupabaseClient,
  ownerId: string,
): Promise<PetRow[]> {
  const { data, error } = await client
    .from('pets')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true });
  if (error) raise('listPetsByOwner', error);
  return (data ?? []) as PetRow[];
}

// ---------------------------------------------------------------------------
// Availability windows (CRUD)
// ---------------------------------------------------------------------------

export async function listAvailabilityWindows(
  client: SupabaseClient,
  petId: string,
): Promise<AvailabilityWindowRow[]> {
  const { data, error } = await client
    .from('availability_windows')
    .select('*')
    .eq('pet_id', petId)
    .order('weekday', { ascending: true })
    .order('start_minute', { ascending: true });
  if (error) raise('listAvailabilityWindows', error);
  return (data ?? []) as AvailabilityWindowRow[];
}

export async function addAvailabilityWindow(
  client: SupabaseClient,
  petId: string,
  window: AvailabilityWindowInput,
): Promise<AvailabilityWindowRow> {
  const { data, error } = await client
    .from('availability_windows')
    .insert({ pet_id: petId, ...window })
    .select('*')
    .single();
  if (error) raise('addAvailabilityWindow', error);
  return data as AvailabilityWindowRow;
}

export async function deleteAvailabilityWindow(
  client: SupabaseClient,
  windowId: string,
): Promise<void> {
  const { error } = await client
    .from('availability_windows')
    .delete()
    .eq('id', windowId);
  if (error) raise('deleteAvailabilityWindow', error);
}

/** Replace a pet's whole weekly schedule (editor "Save": delete + insert). */
export async function replaceAvailabilityWindows(
  client: SupabaseClient,
  petId: string,
  windows: AvailabilityWindowInput[],
): Promise<AvailabilityWindowRow[]> {
  const { error: deleteError } = await client
    .from('availability_windows')
    .delete()
    .eq('pet_id', petId);
  if (deleteError) raise('replaceAvailabilityWindows(delete)', deleteError);
  if (windows.length === 0) return [];
  const { data, error } = await client
    .from('availability_windows')
    .insert(windows.map((w) => ({ pet_id: petId, ...w })))
    .select('*');
  if (error) raise('replaceAvailabilityWindows(insert)', error);
  return (data ?? []) as AvailabilityWindowRow[];
}

// ---------------------------------------------------------------------------
// Matching (species + schedule overlap; pure filter in ./matching)
// ---------------------------------------------------------------------------

export async function getMatches(
  client: SupabaseClient,
  myPetId: string,
  now: Date = new Date(),
): Promise<MatchCandidate[]> {
  const myPet = await getPet(client, myPetId);
  if (!myPet) throw new Error(`getMatches: pet ${myPetId} not found`);
  const myWindows: Window[] = (await listAvailabilityWindows(client, myPetId)).map(
    windowFromRow,
  );

  const { data: petsData, error: petsError } = await client
    .from('pets')
    .select('*')
    .eq('species', myPet.species)
    .neq('owner_id', myPet.owner_id);
  if (petsError) raise('getMatches(pets)', petsError);
  const candidatePets = (petsData ?? []) as PetRow[];
  if (candidatePets.length === 0) return [];

  const { data: windowsData, error: windowsError } = await client
    .from('availability_windows')
    .select('*')
    .in(
      'pet_id',
      candidatePets.map((p) => p.id),
    );
  if (windowsError) raise('getMatches(windows)', windowsError);

  const windowsByPet = new Map<string, Window[]>();
  for (const row of (windowsData ?? []) as AvailabilityWindowRow[]) {
    const list = windowsByPet.get(row.pet_id) ?? [];
    list.push(windowFromRow(row));
    windowsByPet.set(row.pet_id, list);
  }

  return filterMatches({
    myPet,
    myWindows,
    candidates: candidatePets.map((pet) => ({
      pet,
      windows: windowsByPet.get(pet.id) ?? [],
    })),
    now,
  });
}

// ---------------------------------------------------------------------------
// Connections (mutual consent)
// ---------------------------------------------------------------------------

/** Order two pet ids to satisfy the `pet_a_id < pet_b_id` invariant. */
export function orderPetPair(
  petIdX: string,
  petIdY: string,
): { pet_a_id: string; pet_b_id: string } {
  if (petIdX === petIdY) throw new Error('orderPetPair: ids must differ');
  return petIdX < petIdY
    ? { pet_a_id: petIdX, pet_b_id: petIdY }
    : { pet_a_id: petIdY, pet_b_id: petIdX };
}

/** The other pet in a connection, from `myPetId`'s point of view. */
export function partnerPetId(
  connection: Pick<ConnectionRow, 'pet_a_id' | 'pet_b_id'>,
  myPetId: string,
): string {
  if (connection.pet_a_id === myPetId) return connection.pet_b_id;
  if (connection.pet_b_id === myPetId) return connection.pet_a_id;
  throw new Error('partnerPetId: pet is not part of this connection');
}

/**
 * True when `myPetId`'s owner is the one who still needs to accept: the
 * connection is pending and was requested by the OTHER pet.
 */
export function canAcceptConnection(
  connection: Pick<ConnectionRow, 'pet_a_id' | 'pet_b_id' | 'requested_by_pet_id' | 'status'>,
  myPetId: string,
): boolean {
  return (
    connection.status === 'pending' &&
    (connection.pet_a_id === myPetId || connection.pet_b_id === myPetId) &&
    connection.requested_by_pet_id !== myPetId
  );
}

export async function requestConnection(
  client: SupabaseClient,
  myPetId: string,
  otherPetId: string,
): Promise<ConnectionRow> {
  const { data, error } = await client
    .from('connections')
    .insert({
      ...orderPetPair(myPetId, otherPetId),
      requested_by_pet_id: myPetId,
      status: 'pending',
    })
    .select('*')
    .single();
  if (error) raise('requestConnection', error);
  return data as ConnectionRow;
}

async function setConnectionStatus(
  client: SupabaseClient,
  connectionId: string,
  status: ConnectionRow['status'],
  context: string,
): Promise<ConnectionRow> {
  const { data, error } = await client
    .from('connections')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', connectionId)
    .select('*')
    .single();
  if (error) raise(context, error);
  return data as ConnectionRow;
}

/** Partner owner accepts a pending request → connection becomes active. */
export function acceptConnection(
  client: SupabaseClient,
  connectionId: string,
): Promise<ConnectionRow> {
  return setConnectionStatus(client, connectionId, 'active', 'acceptConnection');
}

export function pauseConnection(
  client: SupabaseClient,
  connectionId: string,
): Promise<ConnectionRow> {
  return setConnectionStatus(client, connectionId, 'paused', 'pauseConnection');
}

export function resumeConnection(
  client: SupabaseClient,
  connectionId: string,
): Promise<ConnectionRow> {
  return setConnectionStatus(client, connectionId, 'active', 'resumeConnection');
}

export function blockConnection(
  client: SupabaseClient,
  connectionId: string,
): Promise<ConnectionRow> {
  return setConnectionStatus(client, connectionId, 'blocked', 'blockConnection');
}

export async function deleteConnection(
  client: SupabaseClient,
  connectionId: string,
): Promise<void> {
  const { error } = await client.from('connections').delete().eq('id', connectionId);
  if (error) raise('deleteConnection', error);
}

export interface ConnectionWithPartner {
  connection: ConnectionRow;
  /** Null only if the partner pet row vanished between queries. */
  partnerPet: PetRow | null;
}

/** All connections involving `petId`, each joined with the partner pet row. */
export async function listConnectionsForPet(
  client: SupabaseClient,
  petId: string,
): Promise<ConnectionWithPartner[]> {
  const { data, error } = await client
    .from('connections')
    .select('*')
    .or(`pet_a_id.eq.${petId},pet_b_id.eq.${petId}`)
    .order('created_at', { ascending: false });
  if (error) raise('listConnectionsForPet', error);
  const connections = (data ?? []) as ConnectionRow[];
  if (connections.length === 0) return [];

  const partnerIds = connections.map((c) => partnerPetId(c, petId));
  const { data: petsData, error: petsError } = await client
    .from('pets')
    .select('*')
    .in('id', partnerIds);
  if (petsError) raise('listConnectionsForPet(pets)', petsError);
  const petsById = new Map(((petsData ?? []) as PetRow[]).map((p) => [p.id, p]));

  return connections.map((connection) => ({
    connection,
    partnerPet: petsById.get(partnerPetId(connection, petId)) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function reportConnection(
  client: SupabaseClient,
  connectionId: string,
  reporterOwnerId: string,
  reason: string,
): Promise<ReportRow> {
  const { data, error } = await client
    .from('reports')
    .insert({
      connection_id: connectionId,
      reporter_owner_id: reporterOwnerId,
      reason,
    })
    .select('*')
    .single();
  if (error) raise('reportConnection', error);
  return data as ReportRow;
}

// ---------------------------------------------------------------------------
// Sessions (reads via RLS; writes via edge functions)
// ---------------------------------------------------------------------------

export async function listSessionsForConnection(
  client: SupabaseClient,
  connectionId: string,
): Promise<SessionRow[]> {
  const { data, error } = await client
    .from('sessions')
    .select('*')
    .eq('connection_id', connectionId)
    .order('created_at', { ascending: false });
  if (error) raise('listSessionsForConnection', error);
  return (data ?? []) as SessionRow[];
}

export async function listLiveSessionsForConnection(
  client: SupabaseClient,
  connectionId: string,
): Promise<SessionRow[]> {
  const { data, error } = await client
    .from('sessions')
    .select('*')
    .eq('connection_id', connectionId)
    .in('status', [...LIVE_SESSION_STATUSES])
    .order('created_at', { ascending: false });
  if (error) raise('listLiveSessionsForConnection', error);
  return (data ?? []) as SessionRow[];
}

// ---------------------------------------------------------------------------
// Edge function invocations
// ---------------------------------------------------------------------------

interface FunctionsErrorLike {
  message: string;
  context?: unknown;
}

/** Invoke an edge function; surfaces the function's `{error}` body on failure. */
async function invokeEdge<T>(
  client: SupabaseClient,
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) {
    const err = error as FunctionsErrorLike;
    let detail = err.message;
    // FunctionsHttpError carries the Response; our functions return {error}.
    const ctx = err.context;
    if (ctx instanceof Response) {
      try {
        const parsed = (await ctx.clone().json()) as { error?: string };
        if (parsed && typeof parsed.error === 'string') detail = parsed.error;
      } catch {
        // keep the generic message
      }
    }
    throw new Error(`${name}: ${detail}`);
  }
  return data as T;
}

/** `create-pairing-code` — owner-auth; 6-digit code, 10-minute expiry. */
export function createPairingCode(
  client: SupabaseClient,
  petId: string,
): Promise<CreatePairingCodeResponse> {
  return invokeEdge<CreatePairingCodeResponse>(client, 'create-pairing-code', {
    pet_id: petId,
  });
}

/**
 * `request-session` — "Start session now". In-window → `connecting` (+ push to
 * both terminals); out-of-window → `pending_approval` (+ push partner owner).
 */
export function requestSession(
  client: SupabaseClient,
  connectionId: string,
): Promise<RequestSessionResponse> {
  return invokeEdge<RequestSessionResponse>(client, 'request-session', {
    connection_id: connectionId,
  });
}

/** `respond-session` — partner owner approves/declines a pending session. */
export function respondSession(
  client: SupabaseClient,
  sessionId: string,
  approve: boolean,
): Promise<RespondSessionResponse> {
  return invokeEdge<RespondSessionResponse>(client, 'respond-session', {
    session_id: sessionId,
    approve,
  });
}

/** `end-session` — either owner ends instantly; server broadcasts `bye`. */
export function endSession(
  client: SupabaseClient,
  sessionId: string,
  reason: ClientEndReason = 'owner_ended',
): Promise<EndSessionResponse> {
  return invokeEdge<EndSessionResponse>(client, 'end-session', {
    session_id: sessionId,
    reason,
  });
}
