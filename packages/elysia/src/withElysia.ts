import { opentelemetry } from '@elysiajs/opentelemetry';
import {
  captureException,
  getClient,
  getIsolationScope,
  getTraceData,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
  winterCGHeadersToDict,
} from '@sentry/core';
import type { Elysia, ErrorContext } from 'elysia';

interface ElysiaHandlerOptions {
  shouldHandleError: (context: ErrorContext) => boolean;
}

const ELYSIA_ORIGIN = 'auto.http.otel.elysia';

const ELYSIA_LIFECYCLE_OP_MAP: Record<string, string> = {
  Request: 'middleware.elysia',
  Parse: 'middleware.elysia',
  Transform: 'middleware.elysia',
  BeforeHandle: 'middleware.elysia',
  Handle: 'request_handler.elysia',
  AfterHandle: 'middleware.elysia',
  MapResponse: 'middleware.elysia',
  AfterResponse: 'middleware.elysia',
  Error: 'middleware.elysia',
};

function defaultShouldHandleError(context: ErrorContext): boolean {
  const status = context.set.status;
  if (status === undefined) {
    return true;
  }
  const statusCode = typeof status === 'string' ? parseInt(status, 10) : status;
  // Capture server errors (5xx) and unusual status codes (<= 299 in an error handler).
  // 3xx and 4xx are not captured by default (client errors / redirects).
  return statusCode >= 500 || statusCode <= 299;
}

/**
 * Integrate Sentry with an Elysia app for error handling, request context,
 * and tracing. Returns the app instance for chaining.
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
  // Register the opentelemetry plugin
  // https://elysiajs.com/plugins/opentelemetry
  app.use(opentelemetry());

  const client = getClient();
  const emptySpanIds = new Set<string>();

  // Enrich Elysia lifecycle spans with semantic op and origin,
  // and mark empty spans that Elysia produces as children of lifecycle spans.
  client?.on('spanEnd', span => {
    const spanData = spanToJSON(span);

    // Elysia produces empty spans for each function handler
    // users usually use arrow functions for handlers so they will show up as <unknown>
    // here we drop them so they don't clutter the transaction, if they get named by the user
    // they will still show up as the name of the function
    if (!spanData.description && (!spanData.data || Object.keys(spanData.data).length === 0)) {
      emptySpanIds.add(spanData.span_id);
      return;
    }

    // Enrich Elysia lifecycle spans with semantic op and origin.
    // We mutate the attributes directly because the span has already ended
    // and `setAttribute()` is a no-op on ended OTel spans.
    const op = ELYSIA_LIFECYCLE_OP_MAP[spanData.description || ''];
    if (op && spanData.data) {
      const attrs = spanData.data;
      attrs[SEMANTIC_ATTRIBUTE_SENTRY_OP] = op;
      attrs[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = ELYSIA_ORIGIN;
    }
  });

  // Filter out the empty spans we marked above before sending the transaction,
  // then clear the set to avoid unbounded memory growth.
  client?.on('beforeSendEvent', event => {
    if (event.type === 'transaction' && event.spans) {
      event.spans = event.spans.filter(span => !emptySpanIds.has(span.span_id));
      emptySpanIds.clear();
    }
  });

  // Set SDK processing metadata for all requests
  app.onRequest(context => {
    getIsolationScope().setSDKProcessingMetadata({
      normalizedRequest: {
        method: context.request.method,
        url: context.request.url,
        headers: winterCGHeadersToDict(context.request.headers),
      },
    });
  });

  // Propagate trace data to all response headers
  app.onAfterHandle({ as: 'global' }, context => {
    const traceData = getTraceData();
    if (traceData['sentry-trace']) {
      context.set.headers['sentry-trace'] = traceData['sentry-trace'];
    }
    if (traceData.baggage) {
      context.set.headers['baggage'] = traceData.baggage;
    }
  });

  // Register the error handler for all routes
  app.onError({ as: 'global' }, context => {
    if (context.route) {
      getIsolationScope().setTransactionName(`${context.request.method} ${context.route}`);
    }

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
