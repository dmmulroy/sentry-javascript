import type { IntegrationFn } from '@sentry/core';
import {
  captureException,
  debug,
  defineIntegration,
  getDefaultIsolationScope,
  getIsolationScope,
} from '@sentry/core';
import { SentrySpanProcessor } from '@sentry/opentelemetry';
import { createRequire } from 'module';
import { DEBUG_BUILD } from '../../../debug-build';
import type { ElysiaErrorContext, ElysiaInstance } from './types';

const INTEGRATION_NAME = 'Elysia';

const _elysiaIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // No-op: tracing is applied per-instance via withElysia
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry instrumentation for [Elysia](https://elysiajs.com/).
 *
 * Tracing is powered by Elysia's first-party `@elysiajs/opentelemetry` plugin,
 * which is automatically applied when you call `withElysia(app)`.
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *   integrations: [Sentry.elysiaIntegration()],
 * })
 * ```
 */
export const elysiaIntegration = defineIntegration(_elysiaIntegration);

interface ElysiaHandlerOptions {
  shouldHandleError: (context: ElysiaErrorContext) => boolean;
}

function defaultShouldHandleError(context: ElysiaErrorContext): boolean {
  const status = context.set.status;
  if (status === undefined) {
    return true;
  }
  const statusCode = typeof status === 'string' ? parseInt(status, 10) : status;
  return statusCode >= 500;
}

let _cachedOtelPlugin: ((options?: Record<string, unknown>) => unknown) | null | undefined;

function loadElysiaOtelPlugin(): ((options?: Record<string, unknown>) => unknown) | null {
  if (_cachedOtelPlugin !== undefined) {
    return _cachedOtelPlugin;
  }

  try {
    const _require = createRequire(`${process.cwd()}/`);
    const mod = _require('@elysiajs/opentelemetry') as {
      opentelemetry?: (options?: Record<string, unknown>) => unknown;
    };
    _cachedOtelPlugin = mod.opentelemetry ?? null;
  } catch {
    DEBUG_BUILD &&
      debug.warn(
        'Could not load `@elysiajs/opentelemetry` package. Please install it to enable tracing for Elysia: `bun add @elysiajs/opentelemetry`',
      );
    _cachedOtelPlugin = null;
  }

  return _cachedOtelPlugin;
}

/**
 * Integrate Sentry with an Elysia app for error handling, request context,
 * and tracing. Returns the app instance for chaining.
 *
 * This function:
 * 1. Applies `@elysiajs/opentelemetry` for tracing (if installed)
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
 * const Sentry = require('@sentry/bun');
 * const { Elysia } = require('elysia');
 *
 * Sentry.withElysia(new Elysia())
 *   .get('/', () => 'Hello World')
 *   .listen(3000);
 * ```
 */
export function withElysia<T extends ElysiaInstance>(app: T, options?: Partial<ElysiaHandlerOptions>): T {
  const otelPlugin = loadElysiaOtelPlugin();
  if (otelPlugin) {
    app.use(otelPlugin({ spanProcessors: [new SentrySpanProcessor()] }));
  }

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

  app.onError({ as: 'global' }, (context: ElysiaErrorContext) => {
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
