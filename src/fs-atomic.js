import fs from 'fs';
import path from 'path';

export function writeFileAtomicSync(filePath, data, options) {
  const target = createAtomicWriteTarget(filePath);
  try {
    fs.writeFileSync(target.tempPath, data, options);
    target.commitSync();
  } catch (error) {
    target.cleanupSync();
    throw error;
  }
}

export function createAtomicWriteTarget(filePath) {
  const resolvedPath = path.resolve(filePath);
  const tempPath = buildAtomicTempPath(resolvedPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  return {
    filePath: resolvedPath,
    tempPath,
    commit(callback) {
      fs.rename(tempPath, resolvedPath, (error) => {
        if (!error) {
          callback?.();
          return;
        }
        fs.unlink(tempPath, () => callback?.(error));
      });
    },
    commitSync() {
      fs.renameSync(tempPath, resolvedPath);
    },
    cleanup(callback) {
      fs.unlink(tempPath, () => callback?.());
    },
    cleanupSync() {
      removeFileIfExistsSync(tempPath);
    },
  };
}

export function buildAtomicTempPath(filePath) {
  return `${filePath}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
}

function removeFileIfExistsSync(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_error) {
    // Best-effort cleanup for interrupted or failed atomic writes.
  }
}
