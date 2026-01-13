import { getI18n, resolveLanguage } from '../i18n.js';

export class RemoteEmbeddingBackend {
  constructor(config) {
    this.url = config.url;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeoutMs = config.timeoutMs || 15000;
    this.language = resolveLanguage(config.language);
    this.i18n = getI18n(this.language);
    if (!this.url || !this.apiKey) {
      throw new Error(this.i18n.errRemoteRequires);
    }
  }

  async embed(text) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const payload = { model: this.model, input: text, prompt: text };
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(`${this.i18n.errRemoteFailedPrefix} ${response.status} ${message}`);
      }
      const data = await response.json();
      const embedding = data?.data?.[0]?.embedding || data?.embedding;
      if (!embedding) throw new Error(this.i18n.errRemoteMissingEmbedding);
      return normalize(embedding);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalize(vector) {
  const norm = Math.sqrt(vector.reduce((acc, val) => acc + val * val, 0)) || 1;
  return vector.map((v) => v / norm);
}
