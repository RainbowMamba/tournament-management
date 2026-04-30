type LogLevel = "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

function emit(level: LogLevel, message: string, context?: LogContext) {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...context,
  };

  if (process.env.NODE_ENV === "production") {
    const line = JSON.stringify(entry, replacer);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
    return;
  }

  // Dev: keep readable output.
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(`[${level}] ${message}`, context ?? "");
}

function replacer(_key: string, value: unknown) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

export const logger = {
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
};
