import * as faceapi from 'face-api.js';

let modelsLoaded = false;

/**
 * Load face-api.js models from CDN
 */
export async function loadFaceApiModels() {
  if (modelsLoaded) return;
  
  const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
  
  try {
    // Load detection model (SSD MobileNet v1)
    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
    
    // Load face recognition model (FaceNet)
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    
    modelsLoaded = true;
    console.log('✓ face-api.js models loaded');
  } catch (error) {
    console.error('Failed to load face-api.js models:', error);
    throw error;
  }
}

/**
 * Detect faces and generate descriptors from video element
 */
export async function detectFacesWithDescriptors(video: HTMLVideoElement) {
  if (!modelsLoaded) {
    await loadFaceApiModels();
  }
  
  const detections = await faceapi
    .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  
  return detections;
}

/**
 * Generate face descriptor from an image
 */
export async function generateFaceDescriptor(imageElement: HTMLImageElement | HTMLCanvasElement): Promise<Float32Array | null> {
  if (!modelsLoaded) {
    await loadFaceApiModels();
  }
  
  const detection = await faceapi
    .detectSingleFace(imageElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  
  return detection?.descriptor || null;
}

/**
 * Calculate Euclidean distance between two descriptors (lower = more similar)
 */
export function euclideanDistance(desc1: Float32Array | number[], desc2: Float32Array | number[]): number {
  if (desc1.length !== desc2.length) {
    throw new Error('Descriptors must have the same length');
  }
  
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Find best matching student from face descriptor
 * Returns similarity as percentage (0-100)
 */
export function findBestMatchFromDescriptor(
  faceDescriptor: Float32Array,
  studentDescriptors: Array<{ studentId: string; studentName: string; descriptors: Float32Array[] }>,
  threshold: number = 0.6
): { studentId: string; studentName: string; confidence: number } | null {
  let bestMatch: { studentId: string; studentName: string; confidence: number } | null = null;
  let lowestDistance = Infinity;
  
  for (const student of studentDescriptors) {
    for (const descriptor of student.descriptors) {
      const distance = euclideanDistance(faceDescriptor, descriptor);
      
      // Convert distance to similarity percentage (0.6 distance ~= 0% match, 0 distance = 100% match)
      const similarity = Math.max(0, Math.min(100, ((threshold - distance) / threshold) * 100));
      
      if (distance < lowestDistance && distance < threshold) {
        lowestDistance = distance;
        bestMatch = {
          studentId: student.studentId,
          studentName: student.studentName,
          confidence: similarity,
        };
      }
    }
  }
  
  return bestMatch;
}
