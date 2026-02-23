// Vendored from: https://github.com/elysiajs/elysia/blob/main/src/types.ts

// Elysia route handler - receives context and returns a response value
// Vendored from: https://github.com/elysiajs/elysia/blob/main/src/types.ts#L36
export type ElysiaHandler = (context: ElysiaContext) => unknown;

// Vendored from: https://github.com/elysiajs/elysia/blob/main/src/types.ts
export interface ElysiaContext {
  request: Request;
  path: string;
  route: string;
  set: {
    headers: Record<string, string>;
    status?: number | string;
    redirect?: string;
  };
  store: Record<string, unknown>;
}

export interface ElysiaErrorContext extends ElysiaContext {
  error: Error;
  code: string;
}

// Lifecycle handler types
export type ElysiaErrorHandler = (context: ElysiaErrorContext) => unknown;
export type ElysiaBeforeHandleHandler = (context: ElysiaContext) => unknown;
export type ElysiaRequestHandler = (context: { request: Request; set: ElysiaContext['set'] }) => unknown;

// Trace lifecycle event - receives a callback with { onStop, onEvent }
export interface ElysiaTraceProcess {
  onStop: (cb: (info: { error?: Error }) => void) => void;
  onEvent: (cb: (info: { name: string; onStop: (cb: (info: { error?: Error }) => void) => void }) => void) => void;
  total: number;
}

export interface ElysiaTraceCallbackArgs {
  context: ElysiaContext;
  onRequest: (cb: (process: ElysiaTraceProcess) => void) => void;
  onBeforeHandle: (cb: (process: ElysiaTraceProcess) => void) => void;
  onHandle: (cb: (process: { onStop: (cb: (info: { error?: Error }) => void) => void }) => void) => void;
  onAfterHandle: (cb: (process: ElysiaTraceProcess) => void) => void;
  onError: (cb: (process: ElysiaTraceProcess & { onStop: (cb: (info: { error?: Error }) => void) => void }) => void) => void;
  onAfterResponse: (cb: (process: ElysiaTraceProcess & { onStop: (cb: () => void) => void }) => void) => void;
}

export type ElysiaTraceHandler = (args: ElysiaTraceCallbackArgs) => void;

// Handler interface for route methods (.get, .post, etc.)
// Vendored from: https://github.com/elysiajs/elysia/blob/main/src/index.ts
export type ElysiaRouteHandlerInterface = {
  (path: string, handler: ElysiaHandler, ...rest: unknown[]): ElysiaInstance;
};

// Interface for .use()
export type ElysiaUseInterface = {
  (plugin: unknown): ElysiaInstance;
};

// Minimal Elysia instance interface
// Vendored from: https://github.com/elysiajs/elysia/blob/main/src/index.ts
export interface ElysiaInstance {
  get: ElysiaRouteHandlerInterface;
  post: ElysiaRouteHandlerInterface;
  put: ElysiaRouteHandlerInterface;
  delete: ElysiaRouteHandlerInterface;
  options: ElysiaRouteHandlerInterface;
  patch: ElysiaRouteHandlerInterface;
  head: ElysiaRouteHandlerInterface;
  all: ElysiaRouteHandlerInterface;
  use: ElysiaUseInterface;
  onError: {
    (options: { as: 'global' | 'scoped' | 'local' }, handler: ElysiaErrorHandler): ElysiaInstance;
    (handler: ElysiaErrorHandler): ElysiaInstance;
  };
  onRequest: (handler: ElysiaRequestHandler) => ElysiaInstance;
  onBeforeHandle: {
    (options: { as: 'global' | 'scoped' | 'local' }, handler: ElysiaBeforeHandleHandler): ElysiaInstance;
    (handler: ElysiaBeforeHandleHandler): ElysiaInstance;
  };
  onAfterResponse: (handler: (context: ElysiaContext) => unknown) => ElysiaInstance;
  trace: {
    (options: { as: 'global' | 'scoped' | 'local' }, handler: ElysiaTraceHandler): ElysiaInstance;
    (handler: ElysiaTraceHandler): ElysiaInstance;
  };
}

export type Elysia = new (...args: unknown[]) => ElysiaInstance;
