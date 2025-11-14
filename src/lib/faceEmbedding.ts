import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as mobilenet from '@tensorflow-models/mobilenet';

let model: mobilenet.MobileNet | null = null;

/**
 * Initialize the face feature extraction model (MobileNet TFJS)
 */
export async function initFaceModel() {
  if (!model) {
    await tf.ready();
    const backend = tf.getBackend();
    if (backend !== 'webgl') {
      await tf.setBackend('webgl');
      await tf.ready();
    }
    model = await mobilenet.load({ version: 2, alpha: 1.0 });
    // Warmup
    const dummy = tf.zeros([224, 224, 3]);
    tf.tidy(() => model!.infer(dummy as tf.Tensor3D, true));
    dummy.dispose();
  }
  return model;
}

/**
 * Generate face embedding from an image
 * @param imageData - Base64 image data or HTMLImageElement
 * @returns Face embedding as array of numbers
 */
export async function generateFaceEmbedding(imageData: string | HTMLImageElement): Promise<number[]> {
  const m = await initFaceModel();

  // Prepare 224x224 image tensor
  let tensor: tf.Tensor3D | null = null;
  if (typeof imageData === 'string') {
    const img = new Image();
    img.src = imageData;
    await new Promise((res, rej) => { img.onload = () => res(null); img.onerror = rej; });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 224; canvas.height = 224;
    if (ctx) ctx.drawImage(img, 0, 0, 224, 224);
    tensor = tf.browser.fromPixels(canvas);
  } else {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 224; canvas.height = 224;
    if (ctx) ctx.drawImage(imageData, 0, 0, 224, 224);
    tensor = tf.browser.fromPixels(canvas);
  }

  const embedding = tf.tidy(() => {
    const float = tf.cast(tensor!, 'float32');
    const normalized = tf.div(float, 255);
    const act = m.infer(normalized as tf.Tensor3D, true) as tf.Tensor;
    const arr = act.dataSync() as Float32Array;
    // L2 normalize
    const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0)) || 1;
    return Array.from(arr).map(v => v / norm);
  });
  tensor.dispose();
  return embedding as unknown as number[];
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same length');
  }
  let dotProduct = 0, norm1 = 0, norm2 = 0;
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Find the best matching student from a list of embeddings
 */
export function findBestMatch(
  faceEmbedding: number[],
  studentEmbeddings: Array<{ studentId: string; studentName: string; embedding: number[] }>,
  threshold: number = 0.6
): { studentId: string; studentName: string; confidence: number } | null {
  let bestMatch: { studentId: string; studentName: string; confidence: number } | null = null;
  let highestSimilarity = threshold;
  for (const student of studentEmbeddings) {
    const similarity = cosineSimilarity(faceEmbedding, student.embedding);
    if (similarity > highestSimilarity) {
      highestSimilarity = similarity;
      bestMatch = { studentId: student.studentId, studentName: student.studentName, confidence: similarity };
    }
  }
  return bestMatch;
}

