import { getI18n, resolveLanguage } from '../i18n.js';

const DEFAULT_REMOTE_URL = 'https://api.openai.com/v1/embeddings';

export class RemoteEmbeddingBackend {
  constructor(config) {
    this.endpoint = createEndpointProfile(config.url);
    this.url = this.endpoint.url;
    this.apiKey = config.apiKey || '';
    this.model = config.model;
    this.timeoutMs = config.timeoutMs || 15000;
    this.language = resolveLanguage(config.language);
    this.i18n = getI18n(this.language);
    if (this.endpoint.requiresApiKey && !this.apiKey) {
      throw new Error(this.i18n.errRemoteRequires);
    }
  }

  async embed(text) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: buildHeaders(this.apiKey),
        body: JSON.stringify(this.endpoint.buildPayload(this.model, text)),
        signal: controller.signal,
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(`${this.i18n.errRemoteFailedPrefix} ${response.status} ${message}`);
      }
      const data = await response.json();
      const embedding = this.endpoint.extractEmbedding(data);
      if (!embedding) throw new Error(this.i18n.errRemoteMissingEmbedding);
      return normalize(embedding);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function createEndpointProfile(input) {
  const url = normalizeRemoteUrl(input);
  const pathname = new URL(url).pathname;
  return {
    url,
    requiresApiKey: isOpenAiHostedUrl(url),
    buildPayload(model, text) {
      return pathname === '/api/embeddings' ? { model, prompt: text } : { model, input: text };
    },
    extractEmbedding(data) {
      return data?.data?.[0]?.embedding || data?.embedding || data?.embeddings?.[0];
    },
  };
}

function normalizeRemoteUrl(input) {
  const url = new URL(input || DEFAULT_REMOTE_URL);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  if (pathname === '/') {
    url.pathname = '/v1/embeddings';
  } else if (pathname === '/v1') {
    url.pathname = '/v1/embeddings';
  } else {
    url.pathname = pathname;
  }
  return url.toString();
}

function isOpenAiHostedUrl(url) {
  return new URL(url).hostname === 'api.openai.com';
}

function buildHeaders(apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function normalize(vector) {
  const norm = Math.sqrt(vector.reduce((acc, val) => acc + val * val, 0)) || 1;
  return vector.map((v) => v / norm);
}
