/**
 * AEGIS-EDGE: Sovereign Edge RAG Evaluation Engine
 * Pure Native Edge HTTP REST & SSE Streaming Server
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { AegisEdgeEvaluator } from '../edge/engine.ts';
import { EdgeTelemetry } from '../edge/telemetry.ts';
import { RagLCompiler } from '../dsl/index.ts';
import type { RagPayload } from '../core/types.ts';

export class EdgeHttpServer {
  private evaluator: AegisEdgeEvaluator;
  private port: number;
  private server: http.Server | null = null;
  private sseClients: Set<http.ServerResponse> = new Set();
  private dashboardHtml: string = '';

  constructor(evaluator: AegisEdgeEvaluator, port: number = 8420) {
    this.evaluator = evaluator;
    this.port = port;
    this.loadDashboard();

    // Hook evaluator events to SSE broadcast
    this.evaluator.onEvaluation(result => {
      this.broadcastEvent('evaluation', result);
    });
  }

  private loadDashboard(): void {
    const dashPath = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), 'dashboard.html');
    if (fs.existsSync(dashPath)) {
      this.dashboardHtml = fs.readFileSync(dashPath, 'utf-8');
    }
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        // Enable CORS for edge microservices
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;

        // Route: Web Dashboard UI
        if (req.method === 'GET' && pathname === '/') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(this.dashboardHtml);
          return;
        }

        // Route: Health & Resource Telemetry
        if (req.method === 'GET' && pathname === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'HEALTHY',
            engine: 'AEGIS-EDGE v1.0.0',
            telemetry: EdgeTelemetry.getResourceSnapshot(),
            activeSubscribers: this.sseClients.size
          }));
          return;
        }

        // Route: Summary Metrics & Percentiles
        if (req.method === 'GET' && pathname === '/api/metrics/summary') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.evaluator.getSummary()));
          return;
        }

        // Route: Recent History
        if (req.method === 'GET' && pathname === '/api/recent') {
          const limit = parseInt(url.searchParams.get('limit') || '20', 10);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.evaluator.getRecent(limit)));
          return;
        }

        // Route: Real-time SSE Live Stream
        if (req.method === 'GET' && pathname === '/api/events') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive'
          });

          res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Subscribed to Aegis-Edge live stream' })}\n\n`);
          this.sseClients.add(res);

          req.on('close', () => {
            this.sseClients.delete(res);
          });
          return;
        }

        // Route: POST /api/evaluate
        if (req.method === 'POST' && pathname === '/api/evaluate') {
          this.readJsonBody(req, (err, body) => {
            if (err || !body || !body.payload) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid payload: required { payload: RagPayload }' }));
              return;
            }

            try {
              const result = this.evaluator.evaluate(body.payload as RagPayload, body.policy);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (evalErr: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: evalErr.message }));
            }
          });
          return;
        }

        // Route: POST /api/batch
        if (req.method === 'POST' && pathname === '/api/batch') {
          this.readJsonBody(req, (err, body) => {
            if (err || !body || !Array.isArray(body.payloads)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid payload: required { payloads: RagPayload[] }' }));
              return;
            }

            try {
              const summary = this.evaluator.evaluateBatch(body.payloads, body.policy);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(summary));
            } catch (batchErr: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: batchErr.message }));
            }
          });
          return;
        }

        // Route: POST /api/dsl/validate
        if (req.method === 'POST' && pathname === '/api/dsl/validate') {
          this.readJsonBody(req, (err, body) => {
            if (err || !body || typeof body.source !== 'string') {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Required: { source: string }' }));
              return;
            }

            try {
              const ast = RagLCompiler.compile(body.source);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ valid: true, ast }));
            } catch (dslErr: any) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ valid: false, error: dslErr.message }));
            }
          });
          return;
        }

        // 404 Catch-All
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      });

      this.server.listen(this.port, () => {
        resolve(this.port);
      });

      this.server.on('error', reject);
    });
  }

  stop(): Promise<void> {
    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private broadcastEvent(event: string, data: any): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  private readJsonBody(req: http.IncomingMessage, cb: (err: any, body: any) => void): void {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(raw);
        cb(null, parsed);
      } catch (err) {
        cb(err, null);
      }
    });
  }
}
