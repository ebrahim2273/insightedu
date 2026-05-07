/**
 * Face Recognition Helper - face-api.js Wrapper
 * 
 * This module provides utilities for face detection and recognition using face-api.js library.
 * It uses deep learning models to detect faces and generate 128-dimensional face descriptors
 * that can be compared to identify individuals.
 * 
 * Key Models Used:
 * - SSD MobileNet v1: Fast face detection model
 * - FaceNet: Generates 128-d face embeddings for recognition
 * - 68-point Face Landmarks: Detects facial features for better alignment
 */

import * as faceapi from 'face-api.js';

// Global flag to track if models are loaded (prevents reloading)
let modelsLoaded = false;

/**
 * Load face-api.js AI models from CDN
 * 
 * Downloads three neural network models required for face recognition:
 * 1. Face detection model (finds faces in images)
 * 2. Landmark detection model (finds eyes, nose, mouth positions)
 * 3. Face recognition model (generates unique face "fingerprint")
 * 
 * Models are ~7MB total and loaded once per session
 */
export async function loadFaceApiModels() {
  if (modelsLoaded) return; // Skip if already loaded
  
  const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
  
  try {
    // Load detection model (SSD MobileNet v1) - finds faces in images
    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
    
    // Load face recognition models (FaceNet) - generates 128-d descriptors
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    
    modelsLoaded = true;
    import.meta.env.DEV && console.log('✓ face-api.js models loaded');
  } catch (error) {
    console.error('Failed to load face-api.js models:', error);
    throw error;
  }
}

/**
 * Detect faces and generate descriptors from video stream
 * 
 * This is the main function used during attendance taking.
 * It processes a video frame and returns:
 * - Bounding box for each detected face
 * - 68 facial landmarks (eye corners, nose tip, mouth, etc.)
 * - 128-dimensional face descriptor (unique "fingerprint")
 * 
 * @param video - HTML video element showing camera feed
 * @returns Array of detected faces with their descriptors
 */
export async function detectFacesWithDescriptors(video: HTMLVideoElement) {
  if (!modelsLoaded) {
    await loadFaceApiModels();
  }
  
  // Run face detection pipeline
  const detections = await faceapi
    .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 })) // Detect faces
    .withFaceLandmarks() // Find facial features
    .withFaceDescriptors(); // Generate 128-d descriptor
  
  import.meta.env.DEV && console.log('Face-api detections:', detections.length);
  return detections;
}

/**
 * Generate face descriptor from a static image
 * 
 * Used when enrolling students - extracts face "fingerprint" from captured photos.
 * These descriptors are stored in the database and compared during attendance.
 * 
 * @param imageElement - Image or canvas containing a face
 * @returns 128-dimensional Float32Array descriptor, or null if no face found
 */
export async function generateFaceDescriptor(imageElement: HTMLImageElement | HTMLCanvasElement): Promise<Float32Array | null> {
  if (!modelsLoaded) {
    await loadFaceApiModels();
  }
  
  // Detect single face and generate descriptor
  const detection = await faceapi
    .detectSingleFace(imageElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  
  return detection?.descriptor || null;
}

/**
 * Calculate Euclidean distance between two face descriptors
 * 
 * This is the mathematical "similarity score" between two faces.
 * - Distance of 0.0 = identical faces (impossible in practice)
 * - Distance < 0.4 = likely same person
 * - Distance 0.4-0.6 = uncertain match
 * - Distance > 0.6 = different people
 * 
 * Formula: sqrt(sum of squared differences)
 * 
 * @param desc1 - First face descriptor (128 numbers)
 * @param desc2 - Second face descriptor (128 numbers)
 * @returns Distance value (lower = more similar)
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
 * ====================================================================
 * ENHANCED MATCHING ALGORITHM
 * ====================================================================
 * 
 * Uses a multi-stage matching pipeline with ensemble scoring:
 * 1. Compute centroid (average) for each student's descriptors
 * 2. Calculate both Euclidean distance AND cosine similarity
 * 3. Combine metrics with weighted ensemble scoring
 * 4. Apply strict ratio test (best must be 25%+ better than second-best)
 * 5. Require minimum separation between candidates
 * 6. Cross-validate against individual descriptors
 * 7. Convert to calibrated confidence percentage
 * 
 * @param faceDescriptor - 128-dimensional descriptor from detected face
 * @param studentDescriptors - All enrolled students with their face descriptors
 * @param threshold - Maximum Euclidean distance to accept (default 0.5)
 * @returns Best match with confidence score, or null if no reliable match
 */
export function findBestMatchFromDescriptor(
  faceDescriptor: Float32Array,
  studentDescriptors: Array<{ studentId: string; studentName: string; descriptors: Float32Array[] }>,
  threshold: number = 0.5
): { studentId: string; studentName: string; confidence: number } | null {
  if (studentDescriptors.length === 0) return null;

  // Balanced + adaptive configuration. With only one enrolled student,
  // ratio/separation tests are skipped; with many students they tighten automatically.
  const RATIO_THRESHOLD = 0.82;     // Best must be < 82% of second-best (relaxed slightly)
  const MIN_SEPARATION = 0.08;      // Minimum gap between best and second-best
  const COSINE_THRESHOLD = 0.55;    // Minimum cosine similarity (relaxed for varied lighting)
  const EUCLIDEAN_WEIGHT = 0.55;    // Weight for Euclidean metric
  const COSINE_WEIGHT = 0.45;       // Weight for cosine metric

  // Helper: median of an array (more robust than mean against outlier shots)
  const median = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  /**
   * Compute centroid (mean) of multiple descriptors
   * The centroid is more stable than any single descriptor
   */
  function computeCentroid(descriptors: Float32Array[]): Float32Array {
    if (descriptors.length === 0) return new Float32Array(128);
    if (descriptors.length === 1) return descriptors[0];
    
    const centroid = new Float32Array(128);
    for (const desc of descriptors) {
      for (let i = 0; i < 128; i++) {
        centroid[i] += desc[i];
      }
    }
    for (let i = 0; i < 128; i++) {
      centroid[i] /= descriptors.length;
    }
    return centroid;
  }

  /**
   * Cosine similarity between two descriptors
   * Range: -1 (opposite) to 1 (identical)
   */
  function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
  }

  /**
   * Compute ensemble score combining both metrics
   */
  function computeEnsembleScore(euclidean: number, cosine: number): number {
    // Normalize Euclidean: 0 distance = 1.0, threshold = 0.0
    const euclideanNorm = Math.max(0, 1 - euclidean / threshold);
    // Normalize Cosine: COSINE_THRESHOLD = 0.0, 1.0 = 1.0
    const cosineNorm = Math.max(0, (cosine - COSINE_THRESHOLD) / (1 - COSINE_THRESHOLD));
    // Weighted combination
    return (euclideanNorm * EUCLIDEAN_WEIGHT) + (cosineNorm * COSINE_WEIGHT);
  }

  // ========== STAGE 1: Compute scores for all students ==========
  
  const candidates: Array<{
    studentId: string;
    studentName: string;
    centroidDist: number;      // Euclidean distance to centroid
    cosineSim: number;         // Cosine similarity to centroid
    bestIndividual: number;    // Best match to any single descriptor
    avgIndividual: number;     // Average match across descriptors
    ensemble: number;          // Combined ensemble score
    descriptorCount: number;   // How many descriptors (more = more reliable)
  }> = [];

  for (const student of studentDescriptors) {
    if (!student.descriptors || student.descriptors.length === 0) continue;

    // Compute centroid for this student
    const centroid = computeCentroid(student.descriptors);

    // Distance to centroid
    const centroidDist = euclideanDistance(faceDescriptor, centroid);
    const cosineSim = cosineSimilarity(faceDescriptor, centroid);

    // Find best, median, and average individual matches
    const dists: number[] = [];
    let bestIndividual = Infinity;
    let totalDist = 0;
    for (const desc of student.descriptors) {
      const dist = euclideanDistance(faceDescriptor, desc);
      if (dist < bestIndividual) bestIndividual = dist;
      totalDist += dist;
      dists.push(dist);
    }
    const avgIndividual = totalDist / student.descriptors.length;
    const medianIndividual = median(dists);

    // Compute ensemble score (favor centroid but blend in median for robustness)
    const blendedDist = (centroidDist * 0.6) + (medianIndividual * 0.4);
    const ensemble = computeEnsembleScore(blendedDist, cosineSim);

    candidates.push({
      studentId: student.studentId,
      studentName: student.studentName,
      centroidDist,
      cosineSim,
      bestIndividual,
      avgIndividual,
      ensemble,
      descriptorCount: student.descriptors.length,
    });
  }

  if (candidates.length === 0) return null;

  // Sort by ensemble score (higher = better match)
  candidates.sort((a, b) => b.ensemble - a.ensemble);

  const best = candidates[0];
  const second = candidates[1];

  // ========== STAGE 2: Apply strict filters ==========

  // Filter 1: Basic threshold check
  if (best.centroidDist >= threshold) {
    import.meta.env.DEV && console.log(`[Match] REJECTED: Distance ${best.centroidDist.toFixed(3)} >= ${threshold}`);
    return null;
  }

  // Filter 2: Cosine similarity check
  if (best.cosineSim < COSINE_THRESHOLD) {
    import.meta.env.DEV && console.log(`[Match] REJECTED: Cosine ${best.cosineSim.toFixed(3)} < ${COSINE_THRESHOLD}`);
    return null;
  }

  // Filter 3: Ratio test (if we have multiple candidates)
  if (second) {
    // Best distance should be significantly lower than second-best
    if (best.centroidDist > 0.01) {
      const ratio = best.centroidDist / second.centroidDist;
      if (ratio > RATIO_THRESHOLD) {
        import.meta.env.DEV && console.log(`[Match] REJECTED: Ratio ${ratio.toFixed(3)} > ${RATIO_THRESHOLD} (ambiguous)`);
        return null;
      }
    }

    // Require minimum separation
    const separation = second.centroidDist - best.centroidDist;
    if (separation < MIN_SEPARATION) {
      import.meta.env.DEV && console.log(`[Match] REJECTED: Separation ${separation.toFixed(3)} < ${MIN_SEPARATION} (too close)`);
      return null;
    }

    // Third-best check for extra certainty
    if (candidates.length > 2) {
      const third = candidates[2];
      const thirdSeparation = third.centroidDist - best.centroidDist;
      if (thirdSeparation < MIN_SEPARATION * 0.8) {
        import.meta.env.DEV && console.log(`[Match] REJECTED: Multiple close candidates (uncertainty)`);
        return null;
      }
    }
  }

  // Filter 4: Cross-validate with individual descriptors
  if (best.bestIndividual > threshold * 1.05) {
    import.meta.env.DEV && console.log(`[Match] REJECTED: Best individual ${best.bestIndividual.toFixed(3)} > ${(threshold * 1.05).toFixed(3)}`);
    return null;
  }

  // Filter 5: Average consistency check
  if (best.avgIndividual > threshold * 1.3) {
    import.meta.env.DEV && console.log(`[Match] REJECTED: Avg individual ${best.avgIndividual.toFixed(3)} > ${(threshold * 1.3).toFixed(3)}`);
    return null;
  }

  // ========== STAGE 3: Compute calibrated confidence ==========
  
  // Base confidence from ensemble score (0-100)
  let confidence = best.ensemble * 100;

  // Boost: Both metrics strongly agree
  if (best.centroidDist < threshold * 0.4 && best.cosineSim > 0.85) {
    confidence = Math.min(100, confidence * 1.2);
  }

  // Boost: Student has many descriptors (more reliable data)
  if (best.descriptorCount >= 10) {
    confidence = Math.min(100, confidence * 1.05);
  }

  // Penalty: Ratio is close to threshold (near-ambiguous)
  if (second) {
    const ratio = best.centroidDist / second.centroidDist;
    if (ratio > RATIO_THRESHOLD * 0.85) {
      confidence *= 0.9;
    }
  }

  // Penalty: Average is noticeably higher than best (inconsistent match)
  if (best.avgIndividual > best.bestIndividual * 1.4) {
    confidence *= 0.95;
  }

  // Clamp to valid range
  confidence = Math.max(0, Math.min(100, confidence));

  import.meta.env.DEV && console.log(`[Match] ACCEPTED: ${best.studentName} | ` +
    `Dist=${best.centroidDist.toFixed(3)} Cos=${best.cosineSim.toFixed(3)} ` +
    `Ensemble=${best.ensemble.toFixed(3)} Confidence=${confidence.toFixed(0)}%`);

  return {
    studentId: best.studentId,
    studentName: best.studentName,
    confidence: Math.round(confidence),
  };
}
