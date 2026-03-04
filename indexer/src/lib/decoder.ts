/**
 * Number Guess Event Decoder Utilities
 *
 * Events:
 * - NewGameStarted: Keys: [selector, token_id], Data: [settings_id, range_min, range_max, max_attempts]
 * - GuessMade: Keys: [selector, token_id], Data: [guess_value, result, guess_count, range_min, range_max]
 */

import { hash } from "starknet";

export const EVENT_SELECTORS = {
  NewGameStarted: hash.getSelectorFromName("NewGameStarted"),
  GuessMade: hash.getSelectorFromName("GuessMade"),
} as const;

/**
 * Convert a hex string to bigint
 */
export function hexToBigInt(hex: string | undefined | null): bigint {
  if (!hex) return 0n;
  return BigInt(hex);
}

/**
 * Convert felt252 to string (for contract addresses, short strings)
 */
export function feltToHex(felt: string | undefined | null): string {
  if (!felt) return "0x0";
  return `0x${BigInt(felt).toString(16)}`;
}

/**
 * JSON stringify that handles BigInt values
 */
export function stringifyWithBigInt(obj: unknown): string {
  return JSON.stringify(obj, (_, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
}

// ============ Event Data Interfaces ============

export interface NewGameStartedEvent {
  tokenId: bigint;
  settingsId: number;
  rangeMin: number;
  rangeMax: number;
  maxAttempts: number;
}

export interface GuessMadeEvent {
  tokenId: bigint;
  guessValue: number;
  result: number; // 0=correct, 1=too_low, 2=too_high
  guessCount: number;
  rangeMin: number;
  rangeMax: number;
}

// ============ Event Decoders ============

/**
 * Decode NewGameStarted event
 * Keys: [selector, token_id]
 * Data: [settings_id, range_min, range_max, max_attempts]
 */
export function decodeNewGameStarted(keys: readonly string[], data: readonly string[]): NewGameStartedEvent {
  return {
    tokenId: hexToBigInt(keys[1]),
    settingsId: Number(hexToBigInt(data[0])),
    rangeMin: Number(hexToBigInt(data[1])),
    rangeMax: Number(hexToBigInt(data[2])),
    maxAttempts: Number(hexToBigInt(data[3])),
  };
}

/**
 * Decode GuessMade event
 * Keys: [selector, token_id]
 * Data: [guess_value, result, guess_count, range_min, range_max]
 */
export function decodeGuessMade(keys: readonly string[], data: readonly string[]): GuessMadeEvent {
  return {
    tokenId: hexToBigInt(keys[1]),
    guessValue: Number(hexToBigInt(data[0])),
    result: Number(hexToBigInt(data[1])),
    guessCount: Number(hexToBigInt(data[2])),
    rangeMin: Number(hexToBigInt(data[3])),
    rangeMax: Number(hexToBigInt(data[4])),
  };
}

/**
 * Map result code to human-readable string
 */
export function resultToString(result: number): string {
  switch (result) {
    case 0: return "correct";
    case 1: return "too_low";
    case 2: return "too_high";
    default: return "unknown";
  }
}
