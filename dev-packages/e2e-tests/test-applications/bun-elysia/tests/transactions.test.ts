import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a transaction for a successful route', async ({ baseURL, request }) => {
  const transactionEventPromise = waitForTransaction('bun-elysia', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'GET /test-success'
    );
  });

  await request.get(`${baseURL}/test-success`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      transaction: 'GET /test-success',
      type: 'transaction',
      transaction_info: {
        source: 'route',
      },
    }),
  );

  expect(transactionEvent.contexts?.trace).toEqual(
    expect.objectContaining({
      op: 'http.server',
      status: 'ok',
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
    }),
  );
});

test('Sends a transaction with parameterized route name', async ({ baseURL, request }) => {
  const transactionEventPromise = waitForTransaction('bun-elysia', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-param/:param'
    );
  });

  await request.get(`${baseURL}/test-param/123`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('GET /test-param/:param');
  expect(transactionEvent.transaction_info?.source).toBe('route');
});

test('Sends a transaction with multiple parameterized segments', async ({ baseURL, request }) => {
  const transactionEventPromise = waitForTransaction('bun-elysia', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-multi-param/:param1/:param2'
    );
  });

  await request.get(`${baseURL}/test-multi-param/foo/bar`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('GET /test-multi-param/:param1/:param2');
  expect(transactionEvent.transaction_info?.source).toBe('route');
});

test('Sends a transaction for an errored route', async ({ baseURL, request }) => {
  const transactionEventPromise = waitForTransaction('bun-elysia', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-exception/:id'
    );
  });

  await request.get(`${baseURL}/test-exception/777`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('GET /test-exception/:id');
  expect(transactionEvent.contexts?.trace?.status).toBe('internal_error');
});

test('Includes a manually started span', async ({ baseURL, request }) => {
  const transactionEventPromise = waitForTransaction('bun-elysia', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-transaction'
    );
  });

  await request.get(`${baseURL}/test-transaction`);

  const transactionEvent = await transactionEventPromise;
  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      description: 'test-span',
      origin: 'manual',
    }),
  );
});

test('Creates lifecycle spans for Elysia hooks', async ({ baseURL, request }) => {
  const transactionEventPromise = waitForTransaction('bun-elysia', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'GET /test-success'
    );
  });

  await request.get(`${baseURL}/test-success`);

  const transactionEvent = await transactionEventPromise;
  const spans = transactionEvent.spans || [];

  // Elysia should produce lifecycle spans enriched with sentry attributes
  const elysiaSpans = spans.filter(span => span.origin === 'auto.http.otel.elysia');
  expect(elysiaSpans.length).toBeGreaterThan(0);

  // The Handle span should be present as a request handler
  expect(spans).toContainEqual(
    expect.objectContaining({
      description: 'Handle',
      op: 'request_handler.elysia',
      origin: 'auto.http.otel.elysia',
    }),
  );
});

test('Creates lifecycle spans for route-specific middleware', async ({ baseURL, request }) => {
  const transactionEventPromise = waitForTransaction('bun-elysia', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /with-middleware/test'
    );
  });

  await request.get(`${baseURL}/with-middleware/test`);

  const transactionEvent = await transactionEventPromise;
  const spans = transactionEvent.spans || [];

  // BeforeHandle span should be present from the route-specific middleware
  expect(spans).toContainEqual(
    expect.objectContaining({
      description: 'BeforeHandle',
      op: 'middleware.elysia',
      origin: 'auto.http.otel.elysia',
    }),
  );
});
