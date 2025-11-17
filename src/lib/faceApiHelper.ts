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
    console.log('✓ face-api.js models loaded');
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
  
  console.log('Face-api detections:', detections.length);
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
 * Find best matching student from a detected face descriptor
 * 
 * This is the core matching algorithm used during attendance.
 * Compares a detected face against all enrolled students' face descriptors.
 * 
 * Algorithm:
 * 1. Compare detected face to ALL photos of each student
 * 2. Keep the best (lowest distance) match per student
 * 3. Apply threshold filter (reject if too different)
 * 4. Use "ratio test" - best match must be significantly better than 2nd best
 * 5. Convert distance to confidence percentage
 * 
 * @param faceDescriptor - Descriptor from detected face in camera
 * @param studentDescriptors - Array of all students with their enrolled face descriptors
 * @param threshold - Maximum distance to accept as a match (default 0.5)
 * @returns Best matching student with confidence, or null if no good match
 */
export function findBestMatchFromDescriptor(
  faceDescriptor: Float32Array,
  studentDescriptors: Array<{ studentId: string; studentName: string; descriptors: Float32Array[] }>,
  threshold: number = 0.5
): { studentId: string; studentName: string; confidence: number } | null {
  // Store best match for each student
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
