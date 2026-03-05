import { opentelemetry } from '@elysiajs/opentelemetry';
import { captureException, getDefaultIsolationScope, getIsolationScope } from '@sentry/core';
import type { Elysia } from 'elysia';
import { ElysiaSentrySpanProcessor } from './spanProcessor';

interface ElysiaHandlerOptions {
  shouldHandleError: (context: { set: { status?: number | string } }) => boolean;
}

function defaultShouldHandleError(context: { set: { status?: number | string } }): boolean {
  const status = context.set.status;
  if (status === undefined) {
    return true;
  }
  const statusCode = typeof status === 'string' ? parseInt(status, 10) : status;
  return statusCode >= 500;
}

/**
 * Integrate Sentry with an Elysia app for error handling, request context,
 * and tracing. Returns the app instance for chaining.
 *
 * This function:
 * 1. Applies `@elysiajs/opentelemetry` for tracing
 * 2. Registers `onRequest` for request context
 * 3. Registers `onError` for error capturing (with `{ as: 'global' }`)
 *
 * Should be called at the **start** of the chain before defining routes.
 *
 * @param app The Elysia instance
 * @param options Configuration options
 * @returns The same Elysia instance for chaining
 *
 * @example
 * ```javascript
 * import * as Sentry from '@sentry/elysia';
 * import { Elysia } from 'elysia';
 *
 * Sentry.withElysia(new Elysia())
 *   .get('/', () => 'Hello World')
 *   .listen(3000);
 * ```
 */
export function withElysia<T extends Elysia>(app: T, options?: Partial<ElysiaHandlerOptions>): T {
  app.use(opentelemetry({ spanProcessors: [new ElysiaSentrySpanProcessor()] }));

  app.onRequest((context: { request: Request }) => {
    const isolationScope = getIsolationScope();
    if (isolationScope !== getDefaultIsolationScope()) {
      isolationScope.setSDKProcessingMetadata({
        normalizedRequest: {
          method: context.request.method,
          url: context.request.url,
          headers: Object.fromEntries(context.request.headers.entries()),
        },
      });
    }
  });

  app.onError({ as: 'global' }, context => {
    const shouldHandleError = options?.shouldHandleError || defaultShouldHandleError;
    if (shouldHandleError(context)) {
      captureException(context.error, {
        mechanism: {
          type: 'elysia',
          handled: false,
        },
      });
    }
  });

  return app;
}
