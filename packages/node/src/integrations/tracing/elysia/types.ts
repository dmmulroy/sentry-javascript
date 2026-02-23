export interface ElysiaErrorContext {
  request: Request;
  path: string;
  route: string;
  set: {
    headers: Record<string, string>;
    status?: number | string;
    redirect?: string;
  };
  error: Error;
  code: string;
}

/**
 * Loose Elysia instance interface containing only the methods Sentry calls.
 * Intentionally minimal so it's compatible with any Elysia version/generics.
 */
export interface ElysiaInstance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  use: (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRequest: (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onError: (...args: any[]) => any;
}
