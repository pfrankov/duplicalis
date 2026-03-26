export function normalize(vector) {
  const norm = Math.sqrt(vector.reduce((acc, val) => acc + val * val, 0)) || 1;
  return vector.map((v) => v / norm);
}

export function dot(a, b) {
  const size = Math.min(a.length, b.length);
  let value = 0;
  for (let i = 0; i < size; i += 1) {
    value += a[i] * b[i];
  }
  return value;
}

export function cosine(a, b) {
  const size = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < size; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot / denom;
}
