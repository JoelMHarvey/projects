/**
 * DB row types mirroring `supabase/migrations/` (source of truth: 0001_init.sql
 * per CONTRACTS.md "Database schema"). Enums are plain string-literal unions
 * matching the CHECK constraints. Timestamps arrive from PostgREST as ISO
 * strings.
 */

export type Species = 'bird' | 'cat' | 'dog' | 'rabbit';
export const SPECIES: readonly Species[] = ['bird', 'cat', 'dog', 'rabbit'];

export type PersonalityTag = 'calm' | 'chatty' | 'shy' | 'noisy';
export const PERSONALITY_TAGS: readonly PersonalityTag[] = [
  'calm',
  'chatty',
  'shy',
  'noisy',
];

export type ConnectionStatus = 'pending' | 'active' | 'paused' | 'blocked';

export type SessionDbStatus =
  | 'pending_approval'
  | 'connecting'
  | 'active'
  | 'ended'
  | 'failed';

/** Statuses in which a session is live (mirrors _shared/sessionRules). */
export const LIVE_SESSION_STATUSES: readonly SessionDbStatus[] = [
  'pending_approval',
  'connecting',
  'active',
];

export type SessionInitiator = 'schedule' | 'owner_trigger';

export type SessionEndReason =
  | 'window_boundary'
  | 'max_duration'
  | 'owner_ended'
  | 'failed'
  | 'partner_declined';

/** End reasons a client may pass to the `end-session` edge function. */
export type ClientEndReason = 'owner_ended' | 'failed';

export type ReportStatus = 'open' | 'reviewed';

// ---------------------------------------------------------------------------
// Row types (SELECT shapes)
// ---------------------------------------------------------------------------

export interface OwnerRow {
  id: string; // = auth.users.id
  email: string | null;
  display_name: string | null;
  timezone: string;
  created_at: string;
}

export interface PetRow {
  id: string;
  owner_id: string;
  name: string;
  species: Species;
  photo_url: string | null;
  personality_tags: PersonalityTag[] | null;
  /** IANA name; availability_windows minutes are local to this timezone. */
  timezone: string;
  created_at: string;
}

export interface DeviceRow {
  id: string;
  pet_id: string;
  role: 'terminal';
  push_token: string | null;
  last_seen_at: string | null;
  is_online: boolean;
  created_at: string;
}

export interface PairingCodeRow {
  id: string;
  code: string; // 6 digits
  pet_id: string;
  expires_at: string;
  claimed_by_device: string | null;
  created_at: string;
}

export interface AvailabilityWindowRow {
  id: string;
  pet_id: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** Minutes from local midnight, 0..1439. */
  start_minute: number;
  /** Minutes from local midnight, 1..1440 (exclusive bound). */
  end_minute: number;
  created_at: string;
}

export interface ConnectionRow {
  id: string;
  /** Invariant: pet_a_id < pet_b_id. */
  pet_a_id: string;
  pet_b_id: string;
  requested_by_pet_id: string;
  status: ConnectionStatus;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  connection_id: string;
  initiated_by: SessionInitiator;
  status: SessionDbStatus;
  started_at: string | null;
  ended_at: string | null;
  scheduled_end_at: string | null;
  end_reason: SessionEndReason | null;
  created_at: string;
}

export interface ReportRow {
  id: string;
  connection_id: string;
  reporter_owner_id: string;
  reason: string | null;
  status: ReportStatus;
  created_at: string;
}

export interface WaitlistSignupRow {
  id: string;
  email: string;
  source: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Insert / update shapes used by the owner app
// ---------------------------------------------------------------------------

export interface OwnerUpsert {
  id: string;
  email?: string | null;
  display_name?: string | null;
  timezone?: string;
}

export interface PetInsert {
  owner_id: string;
  name: string;
  species?: Species;
  photo_url?: string | null;
  personality_tags?: PersonalityTag[] | null;
  timezone: string;
}

export interface PetUpdate {
  name?: string;
  species?: Species;
  photo_url?: string | null;
  personality_tags?: PersonalityTag[] | null;
  timezone?: string;
}

export interface AvailabilityWindowInput {
  weekday: number;
  start_minute: number;
  end_minute: number;
}

// ---------------------------------------------------------------------------
// Edge function payloads (mirror supabase/functions/* responses)
// ---------------------------------------------------------------------------

export interface CreatePairingCodeResponse {
  code: string;
  expires_at: string;
}

export interface RequestSessionResponse {
  session_id: string;
  /** `connecting` (in-window) or `pending_approval` (partner out-of-window). */
  status: SessionDbStatus;
}

export interface RespondSessionResponse {
  session_id: string;
  status: SessionDbStatus;
}

export interface EndSessionResponse {
  session_id: string;
  status: 'ended';
  end_reason: SessionEndReason;
}
