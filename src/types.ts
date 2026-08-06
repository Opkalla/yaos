/**
 * Shared type definitions for the vault CRDT sync plugin.
 */

import { isExcluded, isIncluded } from "./sync/exclude";

// -------------------------------------------------------------------
// Room access tiers
// -------------------------------------------------------------------

/**
 * What a spoke is allowed to do in a room. Set by the hub, per room.
 *
 * Enforced by the plugin, NOT by the server — the same client-side-only
 * limitation that applies to the structural write-gate generally (see
 * lodestone.md). Treat this as coordination between cooperating vaults, never
 * as a security boundary against a modified client.
 */
export type RoomAccessTier =
	/** Spoke sees live updates but cannot write anything back. */
	| "read-only"
	/** Spoke may edit the hub's existing notes, but not create/rename/delete. */
	| "hub-notes"
	/** Spoke may also create, rename, and delete notes in the room. */
	| "full";

/** The tier a room falls back to when neither the hub nor the invite specified one. */
export const DEFAULT_ROOM_ACCESS_TIER: RoomAccessTier = "hub-notes";

export const ROOM_ACCESS_TIER_LABELS: Record<RoomAccessTier, string> = {
	"read-only": "Read-only",
	"hub-notes": "Edit shared notes",
	full: "Full access",
};

export const ROOM_ACCESS_TIER_DESCRIPTIONS: Record<RoomAccessTier, string> = {
	"read-only": "Spokes see changes live but cannot write anything back.",
	"hub-notes": "Spokes can edit notes you shared, but only you can add, rename, or delete them.",
	full: "Spokes can also create, rename, and delete notes in this room.",
};

/**
 * Narrow an untrusted string (invite param, Y.Doc value) to a known tier.
 * Returns null for anything unrecognized so callers fall back to the default
 * rather than treating a garbled value as permissive.
 */
export function normalizeRoomAccessTier(value: unknown): RoomAccessTier | null {
	return value === "read-only" || value === "hub-notes" || value === "full" ? value : null;
}

/** Whether this tier lets a spoke write note content at all. */
export function tierAllowsContentWrite(tier: RoomAccessTier): boolean {
	return tier !== "read-only";
}

/** Whether this tier lets a spoke create, rename, or delete notes in the room. */
export function tierAllowsStructuralChange(tier: RoomAccessTier): boolean {
	return tier === "full";
}

// -------------------------------------------------------------------
// Markdown CRDT types
// -------------------------------------------------------------------

/** Metadata stored per file ID in the CRDT meta map. */
export interface FileMeta {
	/** Vault-relative path (normalized). */
	path: string;
	/** v2 tombstone timestamp (ms since epoch). */
	deletedAt?: number;
	/** Legacy v1 soft-delete flag (kept for migration compatibility). */
	deleted?: boolean;
	/** Last-modified timestamp (ms since epoch). Informational only. */
	mtime?: number;
	/** Device that last modified this entry. */
	device?: string;
}

// -------------------------------------------------------------------
// Blob / attachment types
// -------------------------------------------------------------------

/**
 * Reference stored in pathToBlob map: vault-relative path -> blob info.
 * This is what gets synced via CRDT so other devices know which blob
 * belongs to which path.
 */
export interface BlobRef {
	/** SHA-256 hex hash of the file content. */
	hash: string;
	/** File size in bytes (denormalized for quick checks without HEAD). */
	size: number;
}

/**
 * Metadata for a content-addressed blob in R2.
 * Stored in blobMeta map: sha256 hex -> metadata.
 */
export interface BlobMeta {
	/** File size in bytes. */
	size: number;
	/** MIME type (e.g. "image/png"). */
	mime: string;
	/** Timestamp when first uploaded (ms since epoch). */
	createdAt: number;
	/** Device that first uploaded this blob. */
	device?: string;
}

/**
 * Tombstone for a deleted blob path. Prevents resurrection when a
 * device comes online with a stale disk state.
 * Stored in blobTombstones map: vault-relative path -> tombstone.
 */
export interface BlobTombstone {
	/** Timestamp when deleted (ms since epoch). */
	deletedAt: number;
	/** Device that performed the delete. */
	device?: string;
}

// -------------------------------------------------------------------
// Origins
// -------------------------------------------------------------------

/** Origin string used for Yjs transactions initiated by this plugin. */
export const ORIGIN_LOCAL = "vault-crdt-local";
export const ORIGIN_SEED = "vault-crdt-seed";

// -------------------------------------------------------------------
// File classification
// -------------------------------------------------------------------

/**
 * Check if a vault-relative path is a markdown file eligible for CRDT sync.
 * Single choke point for all ".md" checks in the codebase.
 */
export function isMarkdownSyncable(path: string, excludePatterns: string[], includePaths: string[], configDir: string): boolean {
	if (!path.endsWith(".md")) return false;
	if (!isIncluded(path, includePaths)) return false;
	return !isExcluded(path, excludePatterns, configDir);
}

/**
 * Check if a vault-relative path is a non-markdown file eligible for
 * blob/attachment sync. Excludes the config directory, .trash/, user patterns,
 * and markdown files (handled by the CRDT text pipeline).
 */
export function isBlobSyncable(path: string, excludePatterns: string[], includePaths: string[], configDir: string): boolean {
	if (path.endsWith(".md")) return false;
	if (!isIncluded(path, includePaths)) return false;
	return !isExcluded(path, excludePatterns, configDir);
}
