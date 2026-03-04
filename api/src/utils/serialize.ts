/** Convert BigInt values to strings for JSON serialization */
export function serializeBigInts<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}
