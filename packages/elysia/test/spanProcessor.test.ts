import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';

const superOnEnd = vi.fn();

vi.mock('@sentry/opentelemetry', () => ({
  SentrySpanProcessor: class {
    onEnd(span: unknown): void {
      superOnEnd(span);
    }
  },
}));

// Import after mock setup
// @ts-expect-error - dynamic import
const { ElysiaSentrySpanProcessor } = await import('../src/spanProcessor');

function createMockSpan(overrides: { name?: string; attributes?: Record<string, unknown> } = {}) {
  return {
    name: overrides.name ?? '',
    attributes: overrides.attributes ?? {},
  };
}

describe('ElysiaSentrySpanProcessor', () => {
  it('filters out empty spans and does not call super.onEnd', () => {
    const processor = new ElysiaSentrySpanProcessor();
    const span = createMockSpan();

    // @ts-expect-error - mock span
    processor.onEnd(span);

    expect(superOnEnd).not.toHaveBeenCalled();
    expect(span.attributes).toEqual({});
  });

  it('does not filter spans with a name', () => {
    superOnEnd.mockClear();
    const processor = new ElysiaSentrySpanProcessor();
    const span = createMockSpan({ name: 'Handle' });

    // @ts-expect-error - mock span
    processor.onEnd(span);

    expect(span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBe('request_handler.elysia');
    expect(superOnEnd).toHaveBeenCalledWith(span);
  });

  it('does not filter spans that have attributes but no name', () => {
    superOnEnd.mockClear();
    const processor = new ElysiaSentrySpanProcessor();
    const span = createMockSpan({ attributes: { 'some.attr': 'value' } });

    // @ts-expect-error - mock span
    processor.onEnd(span);

    expect(span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBeUndefined();
    expect(superOnEnd).toHaveBeenCalledWith(span);
  });

  describe('lifecycle span enrichment', () => {
    const lifecycleSpans: Array<{ name: string; expectedOp: string }> = [
      { name: 'Request', expectedOp: 'middleware.elysia' },
      { name: 'Parse', expectedOp: 'middleware.elysia' },
      { name: 'Transform', expectedOp: 'middleware.elysia' },
      { name: 'BeforeHandle', expectedOp: 'middleware.elysia' },
      { name: 'Handle', expectedOp: 'request_handler.elysia' },
      { name: 'AfterHandle', expectedOp: 'middleware.elysia' },
      { name: 'MapResponse', expectedOp: 'middleware.elysia' },
      { name: 'AfterResponse', expectedOp: 'middleware.elysia' },
      { name: 'Error', expectedOp: 'middleware.elysia' },
    ];

    it.each(lifecycleSpans)('sets op=$expectedOp and origin for $name span', ({ name, expectedOp }) => {
      const processor = new ElysiaSentrySpanProcessor();
      const span = createMockSpan({ name });

      // @ts-expect-error - mock span
      processor.onEnd(span);

      expect(span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBe(expectedOp);
      expect(span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toBe('auto.http.otel.elysia');
    });

    it('does not enrich non-lifecycle spans', () => {
      const processor = new ElysiaSentrySpanProcessor();
      const span = createMockSpan({ name: 'GET /users', attributes: { 'http.method': 'GET' } });

      // @ts-expect-error - mock span
      processor.onEnd(span);

      expect(span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBeUndefined();
      expect(span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toBeUndefined();
    });
  });
});
