import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Page } from '@playwright/test';

export interface FailedRequest {
  url: string;
  /** HTTP status for an error response, or null for a network failure. */
  status: number | null;
  /** Playwright failure text for a network failure, or null for an HTTP error response. */
  failure: string | null;
}

export interface ConsoleReport {
  errors: string[];
  warnings: string[];
  failedRequests: FailedRequest[];
  tilesLoaded: Record<string, boolean>;
}

const SECRET_PARAM = /([?&](?:key|token|access_token|apiKey)=)[^&\s"']+/gi;
const GOOGLE_KEY = /AIza[0-9A-Za-z_-]{35}/g;

/** Redact key-like query params and Google API keys from any text. */
export function redact(text: string): string {
  return text.replace(SECRET_PARAM, '$1[REDACTED]').replace(GOOGLE_KEY, '[REDACTED]');
}

/** Drop the query string entirely so no key can leak through a failed request URL. */
export function stripQuery(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return redact(url);
  }
}

export interface Diagnostics {
  attach(page: Page): void;
  recordTiles(name: string, loaded: boolean): void;
  write(file?: string): void;
}

export function createDiagnostics(): Diagnostics {
  const report: ConsoleReport = { errors: [], warnings: [], failedRequests: [], tilesLoaded: {} };

  return {
    attach(page: Page): void {
      page.on('console', (message) => {
        const text = redact(message.text());
        if (message.type() === 'error') {
          report.errors.push(text);
        } else if (message.type() === 'warning') {
          report.warnings.push(text);
        }
      });
      page.on('pageerror', (error) => {
        report.errors.push(redact(error.stack ?? error.message));
      });
      page.on('requestfailed', (request) => {
        report.failedRequests.push({
          url: stripQuery(request.url()),
          status: null,
          failure: redact(request.failure()?.errorText ?? ''),
        });
      });
      page.on('response', (response) => {
        if (response.status() >= 400) {
          report.failedRequests.push({
            url: stripQuery(response.url()),
            status: response.status(),
            failure: null,
          });
        }
      });
    },
    recordTiles(name: string, loaded: boolean): void {
      report.tilesLoaded[name] = loaded;
    },
    write(file = 'console.json'): void {
      mkdirSync('e2e-output', { recursive: true });
      writeFileSync(join('e2e-output', file), JSON.stringify(report, null, 2));
    },
  };
}
