export interface Store {
  incr: (key: string, callback: (error: Error | null, hits: number, resetTime: Date) => void) => void
  decrement: (key: string) => void
  resetAll: () => void
  resetKey: (key: string) => void
}

export class MemoryStore implements Store {
  hits = {}
  resetTime: Date

  constructor(private windowMs: number) {
    this.resetTime = this.calculateNextResetTime(windowMs)

    const interval = setInterval(this.resetAll, windowMs)
    interval.unref()
  }

  incr = async (key: string, callback: (error: Error | null, hits: number, resetTime: Date) => void): Promise<void> => {
    const hits = this.hits as Record<string, number>
    if (hits[key]) hits[key]++
    else hits[key] = 1

    callback(null, hits[key], this.resetTime)
  }

  decrement(key: string): void {
    const hits = this.hits as Record<string, number>
    if (hits[key]) hits[key]--
  }

  resetAll = (): void => {
    this.hits = {}
    this.resetTime = this.calculateNextResetTime(this.windowMs)
  }

  resetKey(key: string): void {
    delete (this.hits as Record<string, number>)[key]
  }

  calculateNextResetTime(windowMs: number): Date {
    const nextResetDate = new Date()
    nextResetDate.setMilliseconds(nextResetDate.getMilliseconds() + windowMs)
    return nextResetDate
  }
}
