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
    } else if (typeof options.cloud === 'string' || typeof options.cloud === 'function') {
      adapters.push(new LegacyAdapter(options.cloud));
    } else {
      throw "argument 'cloud' must either be a string or a function";
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
