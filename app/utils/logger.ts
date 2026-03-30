type LogMeta = Record<string, unknown>;

function formatPrefix(scope: string) {
  return `[AutoIntel][${scope}]`;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const anyError = error as any;
    const context = anyError.context as any;

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      context:
        typeof context === "string"
          ? context
          : context && typeof context === "object"
            ? {
                status: context.status,
                statusText: context.statusText,
                url: context.url
              }
            : undefined
    };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (error && typeof error === "object") {
    const anyError = error as any;
    return {
      value: anyError,
      name: anyError.name,
      message: anyError.message,
      stack: anyError.stack,
      context:
        typeof anyError.context === "string"
          ? anyError.context
          : anyError.context && typeof anyError.context === "object"
            ? {
                status: anyError.context.status,
                statusText: anyError.context.statusText,
                url: anyError.context.url
              }
            : undefined
    };
  }

  return { value: String(error) };
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function logInfo(scope: string, message: string, meta?: LogMeta) {
  if (meta) {
    console.log(`${formatPrefix(scope)} ${message} | ${safeStringify(meta)}`);
    return;
  }
  console.log(`${formatPrefix(scope)} ${message}`);
}

export function logWarn(scope: string, message: string, meta?: LogMeta) {
  if (meta) {
    console.warn(`${formatPrefix(scope)} ${message} | ${safeStringify(meta)}`);
    return;
  }
  console.warn(`${formatPrefix(scope)} ${message}`);
}

export function logError(scope: string, error: unknown, meta?: LogMeta) {
  const payload = {
    ...(meta ?? {}),
    error: serializeError(error)
  };
  console.error(`${formatPrefix(scope)} Error | ${safeStringify(payload)}`);
}

export function installGlobalErrorLogging() {
  const globalAny = globalThis as any;
  if (globalAny.__AUTO_INTEL_ERROR_LOGGING_INSTALLED) {
    return;
  }
  globalAny.__AUTO_INTEL_ERROR_LOGGING_INSTALLED = true;

  const errorUtils = globalAny.ErrorUtils;
  if (errorUtils?.getGlobalHandler && errorUtils?.setGlobalHandler) {
    const defaultHandler = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      logError("GlobalError", error, { fatal: Boolean(isFatal) });
      if (typeof defaultHandler === "function") {
        defaultHandler(error, isFatal);
      }
    });
  }

  if (typeof globalAny.addEventListener === "function") {
    try {
      globalAny.addEventListener("unhandledrejection", (event: any) => {
        logError("UnhandledRejection", event?.reason ?? event);
      });
    } catch {
      // Not all React Native runtimes support this API.
    }
  }
}
