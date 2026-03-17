// src/cloud-code/adapters/LegacyAdapter.ts

import type { CloudCodeAdapter, CloudCodeRegistry, ParseServerConfig } from '../types';

export class LegacyAdapter implements CloudCodeAdapter {
  readonly name = 'legacy';
  private cloud: string | ((parse: any) => void);

  constructor(cloud: string | ((parse: any) => void)) {
    this.cloud = cloud;
  }

  async initialize(_registry: CloudCodeRegistry, _config: ParseServerConfig): Promise<void> {
    // The registry is not used directly by LegacyAdapter.
    // Instead, the cloud code file calls Parse.Cloud.define() etc.,
    // which calls triggers.addFunction() etc.,
    // which the facade delegates to CloudCodeManager.
    const Parse = require('parse/node').Parse;

    if (typeof this.cloud === 'function') {
      await Promise.resolve(this.cloud(Parse));
    } else if (typeof this.cloud === 'string') {
      const path = require('path');
      const url = require('url');
      const resolved = path.resolve(process.cwd(), this.cloud);
      try {
        require(resolved);
      } catch (err: any) {
        if (err?.code === 'ERR_REQUIRE_ESM') {
          await import(url.pathToFileURL(resolved).href);
        } else {
          throw err;
        }
      }
    }
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async shutdown(): Promise<void> {}
}
