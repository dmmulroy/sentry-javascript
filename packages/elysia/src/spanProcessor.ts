import type { ReadableSpan, Span } from '@opentelemetry/sdk-trace-base';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { SentrySpanProcessor } from '@sentry/opentelemetry';

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

const SENTRY_ORIGIN = 'auto.http.otel.elysia';

/**
 * A custom span processor that filters out empty spans and enriches the span attributes with Sentry attributes.
 */
export class ElysiaSentrySpanProcessor extends SentrySpanProcessor {
  /** @inheritDoc */
  public override onEnd(span: Span & ReadableSpan): void {
    // Elysia produces empty spans as children of lifecycle spans, we want to filter those out.
    if (!span.name && Object.keys(span.attributes).length === 0) {
      return;
    }

    // Enrich the span attributes with Sentry attributes.
    const op = ELYSIA_LIFECYCLE_OP_MAP[span.name];
    if (op) {
      span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] = op;
      span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = SENTRY_ORIGIN;
    }

    super.onEnd(span);
  }
}
