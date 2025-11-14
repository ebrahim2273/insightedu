import { pipeline, env } from '@huggingface/transformers';

// Configure transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

let featureExtractor: any = null;

/**
 * Initialize the face feature extraction model
 */
export async function initFaceModel() {
  if (!featureExtractor) {
    console.log('Loading face feature extraction model...');
    
    // Try devices in order: webgpu -> wasm -> cpu
    const devices = ['webgpu', 'wasm', 'cpu'] as const;
    
    for (const device of devices) {
      try {
        console.log(`Attempting to load model with device: ${device}`);
        featureExtractor = await pipeline(
          'image-feature-extraction',
          'Xenova/mobilenet_v2_1.0_224',
          { device }
        );
        console.log(`Face model loaded successfully with device: ${device}`);
        break;
      } catch (error) {
        console.warn(`Failed to load with ${device}:`, error);
        if (device === 'cpu') {
          throw new Error('Failed to load face model with all devices');
        }
      }
    }
  }
  return featureExtractor;
}

/**
 * Generate face embedding from an image
 * @param imageData - Base64 image data or HTMLImageElement
 * @returns Face embedding as array of numbers
 */
export async function generateFaceEmbedding(imageData: string | HTMLImageElement): Promise<number[]> {
  const extractor = await initFaceModel();
  
  // Generate embedding
  const result = await extractor(imageData, { pooling: 'mean', normalize: true });
  
  // Convert tensor to array
  const embedding = Array.from(result.data) as number[];
  
  return embedding;
}

/**
 * Calculate cosine similarity between two embeddings
 * @param embedding1 - First embedding vector
 * @param embedding2 - Second embedding vector
 * @returns Similarity score (0-1, higher is more similar)
 */
export function cosineSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same length');
  }
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }
  
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Find the best matching student from a list of embeddings
 * @param faceEmbedding - Embedding to match
 * @param studentEmbeddings - Array of student embeddings with student info
 * @param threshold - Minimum similarity threshold (default 0.6)
 * @returns Matching student info or null
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
      bestMatch = {
        studentId: student.studentId,
        studentName: student.studentName,
        confidence: similarity,
      };
    }
  }
  
  return bestMatch;
}
