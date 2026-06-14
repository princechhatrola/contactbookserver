import { ConsoleLogger, Injectable, OnApplicationShutdown } from '@nestjs/common';

interface DatadogLogEntry {
  message: string;
  status: string;
  service: string;
  ddsource: string;
  ddtags: string;
  timestamp: string;
  trace?: string;
  context?: string;
}

@Injectable()
export class DatadogLogger extends ConsoleLogger implements OnApplicationShutdown {
  private readonly apiKey: string;
  private readonly site: string;
  private readonly service: string;
  private readonly env: string;
  private readonly version: string;
  private readonly enabled: boolean;
  private readonly url: string;

  private logQueue: DatadogLogEntry[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;
  private readonly maxQueueSize = 50;
  private readonly flushIntervalMs = 3000;

  constructor() {
    super();
    this.apiKey = process.env.DD_API_KEY || '';
    this.site = process.env.DD_SITE || 'datadoghq.com';
    this.service = process.env.DD_SERVICE || 'smart-llm-backend';
    this.env = process.env.DD_ENV || 'development';
    this.version = process.env.DD_VERSION || '1.0.0';
    this.enabled = process.env.DD_LOGS_ENABLED === 'true' && !!this.apiKey;

    // Use Datadog's V2 http intake URL
    this.url = `https://http-intake.logs.${this.site}/api/v2/logs`;
  }

  override log(message: unknown, context?: string): void {
    super.log(message, context);
    this.sendToDatadog('info', message, context);
  }

  override error(message: unknown, stack?: string, context?: string): void {
    super.error(message, stack, context);
    this.sendToDatadog('error', message, context, stack);
  }

  override warn(message: unknown, context?: string): void {
    super.warn(message, context);
    this.sendToDatadog('warn', message, context);
  }

  override debug(message: unknown, context?: string): void {
    super.debug(message, context);
    this.sendToDatadog('debug', message, context);
  }

  override verbose(message: unknown, context?: string): void {
    super.verbose(message, context);
    this.sendToDatadog('trace', message, context);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.flushLogs();
  }

  private sendToDatadog(
    level: string,
    message: unknown,
    context?: string,
    trace?: string,
  ): void {
    if (!this.enabled) {
      return;
    }

    let msgStr = '';
    if (typeof message === 'object' && message !== null) {
      try {
        msgStr = JSON.stringify(message);
      } catch {
        msgStr = String(message);
      }
    } else {
      msgStr = String(message);
    }

    const logEntry: DatadogLogEntry = {
      message: msgStr,
      status: level,
      service: this.service,
      ddsource: 'nestjs',
      ddtags: `env:${this.env},version:${this.version}${context ? `,context:${context}` : ''}`,
      timestamp: new Date().toISOString(),
      trace: trace || undefined,
      context: context || undefined,
    };

    this.logQueue.push(logEntry);

    if (this.logQueue.length >= this.maxQueueSize) {
      // Flush synchronously/immediately since queue is full
      void this.flushLogs();
    } else if (!this.flushTimeout) {
      this.flushTimeout = setTimeout(() => {
        void this.flushLogs();
      }, this.flushIntervalMs);
    }
  }

  private async flushLogs(): Promise<void> {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.logQueue.length === 0) {
      return;
    }

    const payload = [...this.logQueue];
    this.logQueue = [];

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': this.apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        // Use console.error directly to bypass the custom logger and avoid infinite loops
        console.error(
          `[DatadogLogger] Failed to forward logs to Datadog. Status: ${response.status} ${response.statusText}`,
        );
      }
    } catch (err) {
      console.error('[DatadogLogger] Connection error while forwarding logs to Datadog:', err);
    }
  }
}
