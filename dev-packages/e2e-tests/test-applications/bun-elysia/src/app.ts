import * as Sentry from '@sentry/elysia';
import { Elysia } from 'elysia';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
});

const app = Sentry.withElysia(new Elysia());

// Simple success route
app.get('/test-success', () => ({ version: 'v1' }));

// Parameterized route
app.get('/test-param/:param', ({ params }) => ({ paramWas: params.param }));

// Multiple params
app.get('/test-multi-param/:param1/:param2', ({ params }) => ({
  param1: params.param1,
  param2: params.param2,
}));

// Route that throws an error (will be caught by onError)
app.get('/test-exception/:id', ({ params }) => {
  throw new Error(`This is an exception with id ${params.id}`);
});

// Route with a custom span
app.get('/test-transaction', () => {
  Sentry.startSpan({ name: 'test-span' }, () => undefined);
  return { status: 'ok' };
});

// Route with specific middleware via .guard or .use
app.group('/with-middleware', app =>
  app
    .onBeforeHandle(() => {
      // This is a route-specific middleware
    })
    .get('/test', () => ({ middleware: true })),
);

// Error with specific status code
app.post('/test-post-error', () => {
  throw new Error('Post error');
});

// Route that returns a non-500 error
app.get('/test-4xx', ({ set }) => {
  set.status = 400;
  return { error: 'Bad Request' };
});

app.listen(3030, () => {
  console.log('Elysia app listening on port 3030');
});
