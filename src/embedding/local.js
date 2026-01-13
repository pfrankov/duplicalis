import fs from 'fs';
import path from 'path';
import { env, pipeline } from '@xenova/transformers';
import { ensureModel } from '../model-fetch.js';
import { getI18n, resolveLanguage } from '../i18n.js';

export class LocalEmbeddingBackend {
  constructor(options) {
    const { modelPath, autoDownloadModel = false, modelRepo, language } = options;
    this.language = resolveLanguage(language);
    if (!modelPath) {
      const i18n = getI18n(this.language);
      throw new Error(i18n.errLocalRequiresPath);
    }
    this.modelPath = path.resolve(modelPath);
    this.modelIdentifier = path.basename(this.modelPath);
    this.autoDownloadModel = autoDownloadModel;
    this.modelRepo = modelRepo;
    env.allowLocalModels = true;
    env.localModelPath = path.dirname(this.modelPath);
    env.cacheDir = env.localModelPath;
    this.pipelinePromise = null;
    this.modelReadyPromise = null;
  }

  async embed(text) {
    await this.ensureModelReady();
    const pipe = await this.loadPipeline();
    const result = await pipe(text, { pooling: 'mean', normalize: true });
    const data = Array.from(result.data);
    return normalize(data);
  }

  async loadPipeline() {
    if (this.pipelinePromise) return this.pipelinePromise;
    this.pipelinePromise = pipeline('feature-extraction', this.modelIdentifier, {
      quantized: true,
      device: 'cpu',
    });
    return this.pipelinePromise;
  }

  async ensureModelReady() {
    if (this.modelReadyPromise) return this.modelReadyPromise;
    if (this.autoDownloadModel) {
      this.modelReadyPromise = ensureModel(this.modelPath, this.modelRepo, true, this.language);
      return this.modelReadyPromise;
    }
    this.modelReadyPromise = Promise.resolve(this.assertLocalModelExists());
    return this.modelReadyPromise;
  }

  assertLocalModelExists() {
    const i18n = getI18n(this.language);
    if (!fs.existsSync(this.modelPath)) {
      throw new Error(`${i18n.errLocalModelMissingPrefix} ${this.modelPath}`);
    }
    const onnxDir = path.join(this.modelPath, 'onnx');
    if (!fs.existsSync(onnxDir)) {
      throw new Error(`${i18n.errLocalOnnxDirMissingPrefix} ${onnxDir}`);
    }
    const hasOnnxFile = fs.readdirSync(onnxDir).some((file) => file.endsWith('.onnx'));
    if (!hasOnnxFile) {
      throw new Error(
        `${i18n.errLocalOnnxFilesMissingPrefix} ${onnxDir}. ${i18n.errLocalOnnxFilesHint}`
      );
    }
  }
}

function normalize(vector) {
  const norm = Math.sqrt(vector.reduce((acc, val) => acc + val * val, 0)) || 1;
  return vector.map((v) => v / norm);
}
