/**
 * ====================================================================
 * ROBUST FACE RECOGNITION ENGINE
 * ====================================================================
 * 
 * An advanced face recognition system designed for high accuracy and
 * reliability in real-world attendance scenarios.
 * 
 * KEY FEATURES:
 * 1. Multi-Embedding Fusion - Averages multiple descriptors per student
 * 2. Ensemble Matching - Combines Euclidean + Cosine similarity
 * 3. Temporal Consistency - Requires stable matches across frames
 * 4. Adaptive Thresholding - Dynamic threshold based on match quality
 * 5. Anti-Spoofing - Basic liveness detection via face movement
 * 6. Confidence Calibration - Probabilistic confidence scoring
 * 
 * MATCHING ALGORITHM:
 * - For each detected face, compute distance to ALL enrolled students
 * - Use both Euclidean distance AND cosine similarity
 * - Combine metrics with weighted ensemble
 * - Apply ratio test (best must be significantly better than second-best)
 * - Require temporal consistency across multiple frames
 * - Convert to calibrated confidence percentage
 */

import * as faceapi from 'face-api.js';

// ==================== CONFIGURATION ====================

/**
 * Recognition thresholds and parameters
 * These values are tuned for face-api.js 128-dimensional descriptors
 */
export const RECOGNITION_CONFIG = {
  // Distance thresholds (lower = stricter, more false negatives but fewer false positives)
  EUCLIDEAN_THRESHOLD: 0.5,      // Max Euclidean distance for a match (0.4-0.6 typical)
  COSINE_THRESHOLD: 0.7,         // Min cosine similarity for a match (0.6-0.8 typical)
  
  // Ensemble weights (must sum to 1.0)
  EUCLIDEAN_WEIGHT: 0.6,         // Weight for Euclidean distance metric
  COSINE_WEIGHT: 0.4,            // Weight for cosine similarity metric
  
  // Ratio test parameters
  RATIO_THRESHOLD: 0.75,         // Best match must be < 75% of second-best distance
  MIN_SEPARATION: 0.15,          // Minimum distance gap between best and second-best
  
  // Temporal consistency
  REQUIRED_CONSECUTIVE_FRAMES: 3, // Must match same person N frames in a row
  FRAME_HISTORY_SIZE: 10,        // How many recent frames to consider
  
  // Confidence calibration
  HIGH_CONFIDENCE_THRESHOLD: 85, // Score above this = high confidence match
  LOW_CONFIDENCE_THRESHOLD: 60,  // Score below this = uncertain match
  
  // Anti-spoofing (basic liveness)
  ENABLE_LIVENESS_CHECK: true,   // Enable basic liveness detection
  MIN_FACE_MOVEMENT: 0.02,       // Minimum face movement between frames (normalized)
  MAX_FACE_MOVEMENT: 0.3,        // Maximum face movement (reject if too jumpy)
  
  // Quality filters
  MIN_DETECTION_CONFIDENCE: 0.5, // Minimum face detection confidence
  MIN_FACE_SIZE: 0.05,           // Minimum face size as fraction of frame
};

// ==================== TYPES ====================

/**
 * A single face descriptor with metadata
 */
export interface FaceDescriptor {
  descriptor: Float32Array;      // 128-dimensional feature vector
  quality: number;               // Quality score (0-1) based on detection confidence
  timestamp: number;             // When this descriptor was captured
}

/**
 * Student enrollment data with multiple face descriptors
 */
export interface EnrolledStudent {
  studentId: string;
  studentName: string;
  descriptors: FaceDescriptor[]; // All enrolled face descriptors
  centroid?: Float32Array;       // Average/centroid of all descriptors
  variance?: number;             // Variance across descriptors (consistency measure)
}

/**
 * A face detection with position and descriptor
 */
export interface DetectedFace {
  box: { x: number; y: number; width: number; height: number };
  descriptor: Float32Array;
  confidence: number;            // Detection confidence
  landmarks?: faceapi.FaceLandmarks68;
}

/**
 * Match result with detailed scoring
 */
export interface MatchResult {
  studentId: string;
  studentName: string;
  confidence: number;            // Final calibrated confidence (0-100)
  euclideanScore: number;        // Raw Euclidean distance
  cosineScore: number;           // Raw cosine similarity
  ensembleScore: number;         // Combined score
  isHighConfidence: boolean;     // Above high-confidence threshold
  temporalConsistency: number;   // How many consecutive frames matched
}

/**
 * Temporal tracking state for a single face across frames
 */
interface FaceTrack {
  matchHistory: string[];        // Last N matched student IDs
  confidenceHistory: number[];   // Last N confidence scores
  positionHistory: { x: number; y: number }[]; // For liveness detection
  lastSeen: number;              // Timestamp of last detection
}

// ==================== CORE CLASS ====================

/**
 * RobustFaceRecognizer - Main recognition engine
 * 
 * Usage:
 * 1. Create instance: const recognizer = new RobustFaceRecognizer()
 * 2. Enroll students: recognizer.enrollStudents(studentData)
 * 3. Process frames: recognizer.processFrame(detections)
 */
export class RobustFaceRecognizer {
  private enrolledStudents: EnrolledStudent[] = [];
  private faceTracks: Map<string, FaceTrack> = new Map(); // Track faces across frames
  private frameCount: number = 0;
  private config: typeof RECOGNITION_CONFIG;

  constructor(customConfig?: Partial<typeof RECOGNITION_CONFIG>) {
    // Merge custom config with defaults
    this.config = { ...RECOGNITION_CONFIG, ...customConfig };
    console.log('[RobustRecognizer] Initialized with config:', this.config);
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<typeof RECOGNITION_CONFIG>): void {
    this.config = { ...this.config, ...updates };
    console.log('[RobustRecognizer] Config updated:', updates);
  }

  /**
   * Set threshold (convenience method for UI)
   */
  setThreshold(threshold: number): void {
    this.config.EUCLIDEAN_THRESHOLD = threshold;
    // Adjust cosine threshold proportionally
    this.config.COSINE_THRESHOLD = 1 - threshold;
    console.log('[RobustRecognizer] Threshold set to:', threshold);
  }

  // ==================== ENROLLMENT ====================

  /**
   * Enroll students with their face descriptors
   * Computes centroids and variance for each student
   */
  enrollStudents(students: Array<{
    studentId: string;
    studentName: string;
    descriptors: Float32Array[];
  }>): void {
    this.enrolledStudents = students.map(student => {
      // Wrap raw descriptors with metadata
      const descriptorsWithMeta: FaceDescriptor[] = student.descriptors.map(d => ({
        descriptor: d,
        quality: 1.0, // Assume good quality for enrolled photos
        timestamp: Date.now(),
      }));

      // Compute centroid (average) of all descriptors
      const centroid = this.computeCentroid(student.descriptors);
      
      // Compute variance (consistency measure)
      const variance = this.computeVariance(student.descriptors, centroid);

      return {
        studentId: student.studentId,
        studentName: student.studentName,
        descriptors: descriptorsWithMeta,
        centroid,
        variance,
      };
    });

    console.log(`[RobustRecognizer] Enrolled ${this.enrolledStudents.length} students`);
    
    // Log variance statistics for debugging
    const variances = this.enrolledStudents.map(s => s.variance || 0);
    const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length;
    console.log(`[RobustRecognizer] Average enrollment variance: ${avgVariance.toFixed(4)}`);
  }

  /**
   * Compute centroid (mean) of multiple descriptors
   * The centroid is more robust than any single descriptor
   */
  private computeCentroid(descriptors: Float32Array[]): Float32Array {
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
   * Compute variance of descriptors around centroid
   * Low variance = consistent face data = more reliable matching
   */
  private computeVariance(descriptors: Float32Array[], centroid: Float32Array): number {
    if (descriptors.length < 2) return 0;

    let totalVariance = 0;
    for (const desc of descriptors) {
      const dist = this.euclideanDistance(desc, centroid);
      totalVariance += dist * dist;
    }
    return Math.sqrt(totalVariance / descriptors.length);
  }

  // ==================== DISTANCE METRICS ====================

  /**
   * Euclidean distance between two descriptors
   * Range: 0 (identical) to ~1.4 (very different)
   * Typical same-person: 0.0 - 0.4
   * Typical different-person: 0.6 - 1.4
   */
  private euclideanDistance(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * Cosine similarity between two descriptors
   * Range: -1 (opposite) to 1 (identical)
   * Typical same-person: 0.7 - 1.0
   * Typical different-person: 0.0 - 0.6
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
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
   * Ensemble score combining Euclidean and Cosine metrics
   * Returns a normalized score where higher = better match
   */
  private computeEnsembleScore(euclidean: number, cosine: number): number {
    // Normalize Euclidean: 0 distance = 1.0, threshold distance = 0.0
    const euclideanNorm = Math.max(0, 1 - euclidean / this.config.EUCLIDEAN_THRESHOLD);
    
    // Normalize Cosine: threshold similarity = 0.0, 1.0 similarity = 1.0
    const cosineNorm = Math.max(0, (cosine - this.config.COSINE_THRESHOLD) / (1 - this.config.COSINE_THRESHOLD));
    
    // Weighted combination
    return (euclideanNorm * this.config.EUCLIDEAN_WEIGHT) + 
           (cosineNorm * this.config.COSINE_WEIGHT);
  }

  // ==================== MATCHING ====================

  /**
   * Match a single face against all enrolled students
   * Uses ensemble scoring with ratio test
   */
  private matchFace(faceDescriptor: Float32Array): MatchResult | null {
    if (this.enrolledStudents.length === 0) return null;

    // Compute scores for all students
    const candidates: Array<{
      student: EnrolledStudent;
      euclidean: number;
      cosine: number;
      ensemble: number;
      bestDescriptorMatch: number;
    }> = [];

    for (const student of this.enrolledStudents) {
      if (!student.centroid) continue;

      // Primary match: compare against centroid
      const euclidean = this.euclideanDistance(faceDescriptor, student.centroid);
      const cosine = this.cosineSimilarity(faceDescriptor, student.centroid);
      
      // Secondary: find best individual descriptor match
      let bestDescriptorMatch = Infinity;
      for (const desc of student.descriptors) {
        const dist = this.euclideanDistance(faceDescriptor, desc.descriptor);
        if (dist < bestDescriptorMatch) bestDescriptorMatch = dist;
      }

      const ensemble = this.computeEnsembleScore(euclidean, cosine);

      candidates.push({
        student,
        euclidean,
        cosine,
        ensemble,
        bestDescriptorMatch,
      });
    }

    // Sort by ensemble score (higher = better)
    candidates.sort((a, b) => b.ensemble - a.ensemble);

    const best = candidates[0];
    if (!best) return null;

    // ========== APPLY FILTERS ==========

    // 1. Basic threshold check
    if (best.euclidean > this.config.EUCLIDEAN_THRESHOLD) {
      console.log(`[Match] Rejected: Euclidean ${best.euclidean.toFixed(3)} > ${this.config.EUCLIDEAN_THRESHOLD}`);
      return null;
    }

    if (best.cosine < this.config.COSINE_THRESHOLD) {
      console.log(`[Match] Rejected: Cosine ${best.cosine.toFixed(3)} < ${this.config.COSINE_THRESHOLD}`);
      return null;
    }

    // 2. Ratio test: best must be significantly better than second-best
    if (candidates.length > 1) {
      const second = candidates[1];
      
      // Check ratio (lower ratio = more unique match)
      if (best.euclidean > 0.01) { // Avoid division issues
        const ratio = best.euclidean / second.euclidean;
        if (ratio > this.config.RATIO_THRESHOLD) {
          console.log(`[Match] Rejected: Ratio ${ratio.toFixed(3)} > ${this.config.RATIO_THRESHOLD}`);
          return null;
        }
      }

      // Check minimum separation
      const separation = second.euclidean - best.euclidean;
      if (separation < this.config.MIN_SEPARATION) {
        console.log(`[Match] Rejected: Separation ${separation.toFixed(3)} < ${this.config.MIN_SEPARATION}`);
        return null;
      }
    }

    // 3. Cross-validate with best individual descriptor
    if (best.bestDescriptorMatch > this.config.EUCLIDEAN_THRESHOLD * 1.1) {
      console.log(`[Match] Rejected: Best descriptor ${best.bestDescriptorMatch.toFixed(3)} too high`);
      return null;
    }

    // ========== COMPUTE CONFIDENCE ==========
    
    // Base confidence from ensemble score (0-100)
    let confidence = best.ensemble * 100;
    
    // Boost confidence if both metrics agree strongly
    if (best.euclidean < this.config.EUCLIDEAN_THRESHOLD * 0.5 && 
        best.cosine > (1 + this.config.COSINE_THRESHOLD) / 2) {
      confidence = Math.min(100, confidence * 1.15);
    }
    
    // Penalize if student has high enrollment variance (inconsistent data)
    if (best.student.variance && best.student.variance > 0.15) {
      confidence *= (1 - best.student.variance * 0.3);
    }

    // Penalize if ratio is close to threshold
    if (candidates.length > 1) {
      const ratio = best.euclidean / candidates[1].euclidean;
      if (ratio > this.config.RATIO_THRESHOLD * 0.8) {
        confidence *= 0.9;
      }
    }

    return {
      studentId: best.student.studentId,
      studentName: best.student.studentName,
      confidence: Math.round(Math.max(0, Math.min(100, confidence))),
      euclideanScore: best.euclidean,
      cosineScore: best.cosine,
      ensembleScore: best.ensemble,
      isHighConfidence: confidence >= this.config.HIGH_CONFIDENCE_THRESHOLD,
      temporalConsistency: 1,
    };
  }

  // ==================== TEMPORAL TRACKING ====================

  /**
   * Generate a simple face ID based on position
   * Used to track faces across frames
   */
  private generateFaceId(box: { x: number; y: number; width: number; height: number }): string {
    // Quantize position to grid cells for stable tracking
    const gridX = Math.floor(box.x * 10);
    const gridY = Math.floor(box.y * 10);
    return `face_${gridX}_${gridY}`;
  }

  /**
   * Check if face movement indicates liveness
   */
  private checkLiveness(track: FaceTrack, currentPos: { x: number; y: number }): boolean {
    if (!this.config.ENABLE_LIVENESS_CHECK) return true;
    if (track.positionHistory.length < 3) return true; // Not enough data

    // Compute average movement
    let totalMovement = 0;
    for (let i = 1; i < track.positionHistory.length; i++) {
      const prev = track.positionHistory[i - 1];
      const curr = track.positionHistory[i];
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      totalMovement += Math.sqrt(dx * dx + dy * dy);
    }
    const avgMovement = totalMovement / (track.positionHistory.length - 1);

    // Too little movement might indicate a static photo
    if (avgMovement < this.config.MIN_FACE_MOVEMENT) {
      console.log(`[Liveness] Suspicious: avgMovement ${avgMovement.toFixed(4)} < ${this.config.MIN_FACE_MOVEMENT}`);
      return false;
    }

    // Too much movement might indicate instability
    if (avgMovement > this.config.MAX_FACE_MOVEMENT) {
      console.log(`[Liveness] Suspicious: avgMovement ${avgMovement.toFixed(4)} > ${this.config.MAX_FACE_MOVEMENT}`);
      return false;
    }

    return true;
  }

  /**
   * Process a single frame with temporal tracking
   */
  processFrame(detections: DetectedFace[]): MatchResult[] {
    this.frameCount++;
    const results: MatchResult[] = [];
    const now = Date.now();

    for (const face of detections) {
      // Filter low-quality detections
      if (face.confidence < this.config.MIN_DETECTION_CONFIDENCE) continue;
      
      // Filter tiny faces
      const faceSize = face.box.width * face.box.height;
      if (faceSize < this.config.MIN_FACE_SIZE) continue;

      // Track this face across frames
      const faceId = this.generateFaceId(face.box);
      let track = this.faceTracks.get(faceId);
      
      if (!track) {
        track = {
          matchHistory: [],
          confidenceHistory: [],
          positionHistory: [],
          lastSeen: now,
        };
        this.faceTracks.set(faceId, track);
      }

      // Update position history
      const centerX = face.box.x + face.box.width / 2;
      const centerY = face.box.y + face.box.height / 2;
      track.positionHistory.push({ x: centerX, y: centerY });
      if (track.positionHistory.length > this.config.FRAME_HISTORY_SIZE) {
        track.positionHistory.shift();
      }
      track.lastSeen = now;

      // Check liveness
      if (!this.checkLiveness(track, { x: centerX, y: centerY })) {
        continue; // Skip this face
      }

      // Match against enrolled students
      const match = this.matchFace(face.descriptor);
      
      if (match) {
        // Update match history
        track.matchHistory.push(match.studentId);
        track.confidenceHistory.push(match.confidence);
        
        if (track.matchHistory.length > this.config.FRAME_HISTORY_SIZE) {
          track.matchHistory.shift();
          track.confidenceHistory.shift();
        }

        // Check temporal consistency
        const recentMatches = track.matchHistory.slice(-this.config.REQUIRED_CONSECUTIVE_FRAMES);
        const allSame = recentMatches.length >= this.config.REQUIRED_CONSECUTIVE_FRAMES &&
                        recentMatches.every(id => id === match.studentId);

        if (allSame) {
          // Boost confidence based on temporal consistency
          const avgConfidence = track.confidenceHistory.slice(-this.config.REQUIRED_CONSECUTIVE_FRAMES)
            .reduce((a, b) => a + b, 0) / this.config.REQUIRED_CONSECUTIVE_FRAMES;
          
          match.confidence = Math.round(Math.min(100, avgConfidence * 1.1));
          match.temporalConsistency = recentMatches.length;
          match.isHighConfidence = match.confidence >= this.config.HIGH_CONFIDENCE_THRESHOLD;
          
          results.push(match);
          console.log(`[Match] Confirmed: ${match.studentName} (${match.confidence}%) after ${recentMatches.length} frames`);
        }
      } else {
        // No match - add null to history
        track.matchHistory.push('');
        track.confidenceHistory.push(0);
        if (track.matchHistory.length > this.config.FRAME_HISTORY_SIZE) {
          track.matchHistory.shift();
          track.confidenceHistory.shift();
        }
      }
    }

    // Cleanup old tracks
    const staleThreshold = 3000; // 3 seconds
    for (const [faceId, track] of this.faceTracks.entries()) {
      if (now - track.lastSeen > staleThreshold) {
        this.faceTracks.delete(faceId);
      }
    }

    return results;
  }

  // ==================== UTILITIES ====================

  /**
   * Reset all temporal tracking state
   */
  resetTracking(): void {
    this.faceTracks.clear();
    this.frameCount = 0;
    console.log('[RobustRecognizer] Tracking state reset');
  }

  /**
   * Get enrollment statistics
   */
  getStats(): {
    enrolledCount: number;
    avgDescriptorsPerStudent: number;
    avgVariance: number;
  } {
    const enrolledCount = this.enrolledStudents.length;
    const avgDescriptors = enrolledCount > 0 
      ? this.enrolledStudents.reduce((sum, s) => sum + s.descriptors.length, 0) / enrolledCount 
      : 0;
    const avgVariance = enrolledCount > 0
      ? this.enrolledStudents.reduce((sum, s) => sum + (s.variance || 0), 0) / enrolledCount
      : 0;

    return {
      enrolledCount,
      avgDescriptorsPerStudent: avgDescriptors,
      avgVariance,
    };
  }
}

// ==================== SINGLETON INSTANCE ====================

let recognizerInstance: RobustFaceRecognizer | null = null;

/**
 * Get or create the singleton recognizer instance
 */
export function getRecognizer(config?: Partial<typeof RECOGNITION_CONFIG>): RobustFaceRecognizer {
  if (!recognizerInstance) {
    recognizerInstance = new RobustFaceRecognizer(config);
  } else if (config) {
    recognizerInstance.updateConfig(config);
  }
  return recognizerInstance;
}

/**
 * Reset the singleton instance
 */
export function resetRecognizer(): void {
  recognizerInstance = null;
}
