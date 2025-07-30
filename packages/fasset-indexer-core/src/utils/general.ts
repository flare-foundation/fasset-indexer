export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function join<T>(arr1: T[], arr2: T[]): T[] {
  const s = new Set(arr1)
  for (const e of arr2) {
    s.add(e)
  }
  return Array.from(s.values())
}