import { LegacyAdapter } from './adapters/LegacyAdapter';
import { InProcessAdapter } from './adapters/InProcessAdapter';
import { ExternalProcessAdapter } from './adapters/ExternalProcessAdapter';
import type { CloudCodeAdapter } from './types';

export function resolveAdapters(options: any): CloudCodeAdapter[] {
  const adapters: CloudCodeAdapter[] = [];

  if (options.cloudCodeAdapters) {
    adapters.push(...options.cloudCodeAdapters);
  }

  if (options.cloud) {
    if (typeof options.cloud === 'object' && typeof options.cloud.getRouter === 'function') {
      adapters.push(new InProcessAdapter(options.cloud));
    } else {
      adapters.push(new LegacyAdapter(options.cloud));
    }
  }

  if (options.cloudCodeCommand) {
    if (!options.webhookKey) {
      throw new Error('webhookKey is required when using cloudCodeCommand');
    }
    adapters.push(new ExternalProcessAdapter(
      options.cloudCodeCommand,
      options.webhookKey,
      options.cloudCodeOptions
    ));
  }

  return adapters;
}
