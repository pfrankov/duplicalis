export async function createEmbeddingBackend(config) {
  const selected = config.model || 'local';
  if (selected === 'remote') {
    const { RemoteEmbeddingBackend } = await import('./remote.js');
    return new RemoteEmbeddingBackend({ ...config.remote, language: config.language });
  }
  if (selected === 'mock') {
    const { MockEmbeddingBackend } = await import('./mock.js');
    return new MockEmbeddingBackend();
  }
  const { LocalEmbeddingBackend } = await import('./local.js');
  return new LocalEmbeddingBackend({
    modelPath: config.modelPath,
    autoDownloadModel: config.autoDownloadModel,
    modelRepo: config.modelRepo,
    language: config.language,
  });
}
