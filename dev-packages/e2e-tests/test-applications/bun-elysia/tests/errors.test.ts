import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Captures an error thrown in a route handler', async ({ baseURL, request }) => {
  const errorEventPromise = waitForError('bun-elysia', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  await request.get(`${baseURL}/test-exception/123`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  const exception = errorEvent.exception?.values?.[0];
  expect(exception?.value).toBe('This is an exception with id 123');
  expect(exception?.mechanism).toEqual({
    type: 'elysia',
    handled: false,
  });

  expect(errorEvent.transaction).toEqual('GET /test-exception/:id');

  expect(errorEvent.contexts?.trace).toEqual(
    expect.objectContaining({
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
    }),
  );
});

test('Does not capture errors for 4xx responses', async ({ baseURL, request }) => {
  const transactionPromise = waitForTransaction('bun-elysia', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-4xx';
  });

  const response = await request.get(`${baseURL}/test-4xx`);
  // Wait for the transaction to ensure the request was processed
  await transactionPromise;

  expect(response.status()).toBe(400);
});

test('Captures POST route errors', async ({ baseURL, request }) => {
  const errorEventPromise = waitForError('bun-elysia', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Post error';
  });

  await request.post(`${baseURL}/test-post-error`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values?.[0]?.value).toBe('Post error');
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    type: 'elysia',
    handled: false,
  });
});
