// src/cloud-code/adapters/ExternalProcessAdapter.ts
import { spawn, ChildProcess } from 'child_process';
import http from 'http';
import type {
  CloudCodeAdapter,
  CloudCodeRegistry,
  ParseServerConfig,
  CloudManifest,
  CloudCodeOptions,
  WebhookResponse,
} from '../types';
import { requestToWebhookBody, webhookResponseToResult, applyBeforeSaveResponse } from './webhook-bridge';

const DEFAULT_OPTIONS: Required<CloudCodeOptions> = {
  startupTimeout: 30000,
  healthCheckInterval: 30000,
  shutdownTimeout: 5000,
  maxRestartDelay: 30000,
};

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function httpPost(url: string, body: Record<string, unknown>, webhookKey: string): Promise<WebhookResponse> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const urlObj = new URL(url);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-Parse-Webhook-Key': webhookKey,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON from cloud code process: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

export class ExternalProcessAdapter implements CloudCodeAdapter {
  readonly name = 'external-process';
  private command: string;
  private webhookKey: string;
  private options: Required<CloudCodeOptions>;
  private process: ChildProcess | null = null;
  private port: number = 0;
  private healthInterval: ReturnType<typeof setInterval> | null = null;

  constructor(command: string, webhookKey: string, options?: CloudCodeOptions) {
    if (!webhookKey) {
      throw new Error('webhookKey is required for ExternalProcessAdapter');
    }
    this.command = command;
    this.webhookKey = webhookKey;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async initialize(registry: CloudCodeRegistry, config: ParseServerConfig): Promise<void> {
    this.port = await this.spawnAndWaitForReady(config);
    const manifest = await this.fetchManifest();
    this.registerFromManifest(registry, manifest);

    if (this.options.healthCheckInterval > 0) {
      this.healthInterval = setInterval(() => this.checkHealth(), this.options.healthCheckInterval);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await httpGet(`http://localhost:${this.port}/health`);
      return response === 'OK' || response.includes('ok');
    } catch {
      return false;
    }
  }

  async shutdown(): Promise<void> {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      await Promise.race([
        new Promise<void>((resolve) => this.process!.once('exit', () => resolve())),
        new Promise<void>((resolve) => setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL');
          }
          resolve();
        }, this.options.shutdownTimeout)),
      ]);
    }
    this.process = null;
  }

  private spawnAndWaitForReady(config: ParseServerConfig): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, {
        shell: true,
        env: {
          ...process.env,
          PARSE_SERVER_URL: config.serverURL,
          PARSE_APPLICATION_ID: config.appId,
          PARSE_MASTER_KEY: config.masterKey,
          PARSE_WEBHOOK_KEY: this.webhookKey,
          PARSE_CLOUD_PORT: '0',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.process = child;

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Cloud code process did not emit PARSE_CLOUD_READY within ${this.options.startupTimeout}ms`));
      }, this.options.startupTimeout);

      let stdout = '';
      child.stdout!.on('data', (data) => {
        stdout += data.toString();
        const match = stdout.match(/PARSE_CLOUD_READY:(\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(parseInt(match[1], 10));
        }
      });

      child.stderr!.on('data', (data) => {
        process.stderr.write(`[cloud-code] ${data}`);
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn cloud code process: ${err.message}`));
      });

      child.on('exit', (code) => {
        clearTimeout(timeout);
        if (!this.port) {
          reject(new Error(`Cloud code process exited with code ${code} before becoming ready`));
        }
      });
    });
  }

  private async fetchManifest(): Promise<CloudManifest> {
    const data = await httpGet(`http://localhost:${this.port}/`);
    return JSON.parse(data);
  }

  private registerFromManifest(registry: CloudCodeRegistry, manifest: CloudManifest): void {
    for (const fn of manifest.hooks.functions) {
      registry.defineFunction(fn.name, async (request) => {
        const body = requestToWebhookBody(request);
        const response = await httpPost(`http://localhost:${this.port}/functions/${fn.name}`, body, this.webhookKey);
        return webhookResponseToResult(response);
      });
    }

    for (const trigger of manifest.hooks.triggers) {
      const { className, triggerName } = trigger;
      registry.defineTrigger(className, triggerName as any, async (request) => {
        const body = requestToWebhookBody(request);
        const response = await httpPost(
          `http://localhost:${this.port}/triggers/${className}/${triggerName}`,
          body,
          this.webhookKey
        );
        if (triggerName === 'beforeSave') {
          applyBeforeSaveResponse(request, response);
          return;
        }
        return webhookResponseToResult(response);
      });
    }

    for (const job of manifest.hooks.jobs) {
      registry.defineJob(job.name, async (request) => {
        const body = requestToWebhookBody(request);
        const response = await httpPost(`http://localhost:${this.port}/jobs/${job.name}`, body, this.webhookKey);
        return webhookResponseToResult(response);
      });
    }
  }

  private async checkHealth(): Promise<void> {
    const healthy = await this.isHealthy();
    if (!healthy) {
      console.warn('[cloud-code] External process health check failed');
    }
  }
}
