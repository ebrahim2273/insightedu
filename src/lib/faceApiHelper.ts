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
    .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  
  console.log('Face-api detections:', detections.length);
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
 * Uses per-student best distance + ratio test versus second best to reduce false positives
 */
export function findBestMatchFromDescriptor(
  faceDescriptor: Float32Array,
  studentDescriptors: Array<{ studentId: string; studentName: string; descriptors: Float32Array[] }>,
  threshold: number = 0.5
): { studentId: string; studentName: string; confidence: number } | null {
  const candidates: Array<{ studentId: string; studentName: string; distance: number; avgDistance: number } > = [];

  for (const student of studentDescriptors) {
    if (!student.descriptors || student.descriptors.length === 0) continue;
    
    // Calculate both best and average distance for more robust matching
    let bestDist = Infinity;
    let totalDist = 0;
    for (const d of student.descriptors) {
      const dist = euclideanDistance(faceDescriptor, d);
      if (dist < bestDist) bestDist = dist;
      totalDist += dist;
    }
    const avgDist = totalDist / student.descriptors.length;
    
    if (isFinite(bestDist)) {
      candidates.push({ 
        studentId: student.studentId, 
        studentName: student.studentName, 
        distance: bestDist,
        avgDistance: avgDist
      });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.distance - b.distance);
  const best = candidates[0];
  const second = candidates[1];

  // Stricter threshold check
  if (best.distance >= threshold) return null;

  // Enhanced ratio test: best should be significantly better than second best
  if (second) {
    const ratio = best.distance / second.distance;
    // Require at least 15% improvement over second best
    if (ratio > 0.85) return null;
    
    // Additional check: average distance should also be good
    if (best.avgDistance >= threshold * 1.2) return null;
  }

  // Require minimum separation from other candidates
  const thirdBest = candidates[2];
  if (thirdBest && best.distance / thirdBest.distance > 0.7) {
    return null;
  }

  // Map distance to confidence with stricter scaling
  const clamped = Math.min(Math.max(best.distance, 0), threshold);
  const confidence = Math.max(0, (1 - clamped / threshold) * 100);
  
  // Penalize confidence if average distance is not good
  const avgConfidence = Math.max(0, (1 - best.avgDistance / (threshold * 1.5)) * 100);
  const finalConfidence = (confidence * 0.7) + (avgConfidence * 0.3);

  return {
    studentId: best.studentId,
    studentName: best.studentName,
    confidence: Math.round(finalConfidence),
  };
}
