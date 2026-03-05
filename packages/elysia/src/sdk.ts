import * as os from 'node:os';
import type { NodeClient } from '@sentry/bun';
import { getDefaultIntegrations as getBunDefaultIntegrations, makeFetchTransport } from '@sentry/bun';
import type { Integration, Options } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import { init as initNode } from '@sentry/node';
import type { ElysiaOptions } from './types';

/** Get the default integrations for the Elysia SDK. */
export function getDefaultIntegrations(_options: Options): Integration[] {
  return getBunDefaultIntegrations(_options);
}

/**
 * Get the runtime name and version.
 */
function getRuntime(): { name: string; version: string } {
  if (typeof Bun !== 'undefined') {
    return { name: 'bun', version: Bun.version };
  }

  return { name: 'node', version: process.version };
}

/**
 * Initializes the Sentry Elysia SDK.
 *
 * @example
 * ```javascript
 * import * as Sentry from '@sentry/elysia';
 *
 * Sentry.init({
 *   dsn: '__DSN__',
 *   tracesSampleRate: 1.0,
 * });
 * ```
 */
export function init(userOptions: ElysiaOptions = {}): NodeClient | undefined {
  applySdkMetadata(userOptions, 'elysia');

  const options = {
    ...userOptions,
    platform: 'javascript',
    runtime: getRuntime(),
    serverName: userOptions.serverName || global.process.env.SENTRY_NAME || os.hostname(),
  };

  options.transport = options.transport || makeFetchTransport;

  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrations(options);
  }

  return initNode(options);
}
