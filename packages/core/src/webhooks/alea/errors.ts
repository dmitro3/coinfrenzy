export class TombstonedRoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TombstonedRoundError'
  }
}

export class InsufficientBalanceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InsufficientBalanceError'
  }
}
