// Per docs/02 §5: every Context carries a structured logger. We don't pull
// in pino as a hard dep at this stage — we define an interface and provide
// a console-backed implementation. Production swap-in (Axiom transport) comes
// in the observability prompt.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogFields = Record<string, unknown>

export interface Logger {
  debug(msg: string, fields?: LogFields): void
  info(msg: string, fields?: LogFields): void
  warn(msg: string, fields?: LogFields): void
  error(msg: string, fields?: LogFields): void
  child(bindings: LogFields): Logger
}

/* eslint-disable no-console */
function emit(level: LogLevel, msg: string, fields?: LogFields): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  }
  const line = JSON.stringify(payload)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}
/* eslint-enable no-console */

function consoleLoggerWith(bindings: LogFields): Logger {
  return {
    debug: (msg, fields) => emit('debug', msg, { ...bindings, ...fields }),
    info: (msg, fields) => emit('info', msg, { ...bindings, ...fields }),
    warn: (msg, fields) => emit('warn', msg, { ...bindings, ...fields }),
    error: (msg, fields) => emit('error', msg, { ...bindings, ...fields }),
    child: (extra) => consoleLoggerWith({ ...bindings, ...extra }),
  }
}

export const consoleLogger: Logger = consoleLoggerWith({})

/** Silent logger — used in tests when we don't want console noise. */
export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLogger,
}
