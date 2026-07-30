export type RandomSource = () => number

/** Deterministic 32-bit PRNG. Each call returns a value in [0, 1). */
export function mulberry32(seed: number): RandomSource {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** Returns an integer in the inclusive range [min, max]. */
export function randInt(rng: RandomSource, min: number, max: number): number {
  const low = Math.ceil(Math.min(min, max))
  const high = Math.floor(Math.max(min, max))
  return low + Math.floor(rng() * (high - low + 1))
}

export function pick<T>(rng: RandomSource, values: readonly T[]): T {
  if (values.length === 0) throw new Error('Cannot pick from an empty array')
  return values[randInt(rng, 0, values.length - 1)]!
}

/** Returns a shuffled copy and leaves the input array unchanged. */
export function shuffle<T>(rng: RandomSource, values: readonly T[]): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randInt(rng, 0, index)
    ;[result[index], result[other]] = [result[other]!, result[index]!]
  }
  return result
}

export function chance(rng: RandomSource, probability: number): boolean {
  if (probability <= 0) return false
  if (probability >= 1) return true
  return rng() < probability
}
