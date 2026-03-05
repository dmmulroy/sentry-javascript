import type { ErrorContext } from 'elysia';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Capture the handlers registered by withElysia
let onRequestHandler: (context: unknown) => void;
let onErrorHandler: (context: unknown) => void;
let onAfterResponseHandler: (context: unknown) => void;

const mockApp = {
  use: vi.fn().mockReturnThis(),
  onRequest: vi.fn((handler: (context: unknown) => void) => {
    onRequestHandler = handler;
    return mockApp;
  }),
  onError: vi.fn((_opts: unknown, handler: (context: unknown) => void) => {
    onErrorHandler = handler;
    return mockApp;
  }),
  onAfterResponse: vi.fn((_opts: unknown, handler: (context: unknown) => void) => {
    onAfterResponseHandler = handler;
    return mockApp;
  }),
};

const mockCaptureException = vi.fn();
const mockGetIsolationScope = vi.fn(() => ({
  setSDKProcessingMetadata: vi.fn(),
  setTransactionName: vi.fn(),
}));
const mockGetClient = vi.fn(() => ({
  on: vi.fn(),
}));

vi.mock('@elysiajs/opentelemetry', () => ({
  opentelemetry: vi.fn(() => 'otel-plugin'),
}));

vi.mock('@sentry/core', async importActual => {
  const actual = await importActual<typeof import('@sentry/core')>();
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
    getIsolationScope: () => mockGetIsolationScope(),
    getClient: () => mockGetClient(),
  };
});

// @ts-expect-error - dynamic import after mocks
const { withElysia } = await import('../src/withElysia');

describe('withElysia', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('registers opentelemetry plugin', () => {
    // @ts-expect-error - mock app
    withElysia(mockApp);
    expect(mockApp.use).toHaveBeenCalledWith('otel-plugin');
  });

  it('registers onRequest, onError, and onAfterResponse hooks', () => {
    // @ts-expect-error - mock app
    withElysia(mockApp);
    expect(mockApp.onRequest).toHaveBeenCalled();
    expect(mockApp.onError).toHaveBeenCalledWith({ as: 'global' }, expect.any(Function));
  });

  it('returns the app instance for chaining', () => {
    // @ts-expect-error - mock app
    const result = withElysia(mockApp);
    expect(result).toBe(mockApp);
  });

  describe('defaultShouldHandleError', () => {
    function triggerError(status: number | string | undefined): void {
      // @ts-expect-error - mock app
      withElysia(mockApp);
      onErrorHandler({
        route: '/test',
        request: { method: 'GET' },
        error: new Error('test'),
        set: { status },
      } as unknown as ErrorContext);
    }

    it('captures errors with status >= 500', () => {
      triggerError(500);
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('captures errors with status 503', () => {
      triggerError(503);
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('captures errors with undefined status', () => {
      triggerError(undefined);
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('captures errors with status <= 299 (unusual in error handler)', () => {
      triggerError(200);
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('does not capture 4xx errors', () => {
      triggerError(400);
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('does not capture 404 errors', () => {
      triggerError(404);
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('does not capture 3xx responses', () => {
      triggerError(302);
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('handles string status codes', () => {
      triggerError('500');
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('does not capture string 4xx status codes', () => {
      triggerError('400');
      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });

  describe('custom shouldHandleError', () => {
    it('uses custom shouldHandleError when provided', () => {
      const customShouldHandle = vi.fn(() => false);
      // @ts-expect-error - mock app
      withElysia(mockApp, { shouldHandleError: customShouldHandle });

      onErrorHandler({
        route: '/test',
        request: { method: 'GET' },
        error: new Error('test'),
        set: { status: 500 },
      } as unknown as ErrorContext);

      expect(customShouldHandle).toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });
});
