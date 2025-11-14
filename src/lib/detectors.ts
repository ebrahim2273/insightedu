import { FilesetResolver, FaceDetector as MPFaceDetector } from "@mediapipe/tasks-vision";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";

export type DetectorKind = "native" | "mediapipe" | "tfjs";

export type NormalizedBox = { x: number; y: number; width: number; height: number }; // 0..1 relative
export type Detection = { box: NormalizedBox; score: number };

export interface IDetector {
  kind: DetectorKind;
  detect(video: HTMLVideoElement, now: number): Promise<Detection[]>;
  dispose?(): void | Promise<void>;
}

// Native FaceDetector adapter
class NativeDetector implements IDetector {
  kind: DetectorKind = "native";
  private detector: any;
  constructor() {
    // fastMode true, up to 10 faces
    const FaceDetectorCtor = (window as any).FaceDetector;
    this.detector = FaceDetectorCtor ? new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 10 }) : null;
  }
  async detect(video: HTMLVideoElement): Promise<Detection[]> {
    if (!this.detector) return [];
    const faces = await this.detector.detect(video);
    const vw = video.videoWidth || 1;
    const vh = video.videoHeight || 1;
    return (faces || []).map((f: any) => {
      const { width, height, x, y } = f.boundingBox;
      return {
        score: 1,
        box: { x: x / vw, y: y / vh, width: width / vw, height: height / vh },
      } as Detection;
    });
  }
}

// MediaPipe FaceDetector adapter
class MediaPipeDetector implements IDetector {
  kind: DetectorKind = "mediapipe";
  private mp?: any;
  private detector?: any;
  private runningMode: "VIDEO" | "IMAGE" = "VIDEO";
  constructor(mp: any, detector: any) {
    this.mp = mp;
    this.detector = detector;
  }
  async detect(video: HTMLVideoElement, now: number): Promise<Detection[]> {
    if (!this.detector) return [];
    const res = await this.detector.detectForVideo(video, now);
    const detections = res?.detections || [];
    return detections.map((d: any) => {
      const bb = d.boundingBox; // relative 0..1
      const score = d.categories?.[0]?.score ?? 0.0;
      return {
        score,
        box: { x: bb.originX, y: bb.originY, width: bb.width, height: bb.height },
      } as Detection;
    });
  }
  dispose() {
    try { this.detector?.close?.(); } catch {}
  }
}

// TFJS BlazeFace adapter
class TFJSBlazeFaceDetector implements IDetector {
  kind: DetectorKind = "tfjs";
  private model?: any;
  private readyPromise: Promise<void>;
  constructor(model: any) {
    this.model = model;
    this.readyPromise = (async () => {
      if (tf.getBackend() !== "webgl") {
        await tf.setBackend("webgl");
      }
      await tf.ready();
    })();
  }
  async detect(video: HTMLVideoElement): Promise<Detection[]> {
    await this.readyPromise;
    if (!this.model) return [];
    const preds = await this.model.estimateFaces(video, false);
    const vw = video.videoWidth || 1;
    const vh = video.videoHeight || 1;
    return preds.map((p: any) => {
      const [x1, y1] = p.topLeft as [number, number];
      const [x2, y2] = p.bottomRight as [number, number];
      const w = x2 - x1;
      const h = y2 - y1;
      const score = Array.isArray(p.probability) ? p.probability[0] : p.probability ?? 0.0;
      return {
        score,
        box: { x: x1 / vw, y: y1 / vh, width: w / vw, height: h / vh },
      } as Detection;
    });
  }
}

export type DetectorInitOptions = {
  prefer?: DetectorKind | "auto";
  wasmBaseUrl?: string; // e.g. "/mediapipe/wasm"
  mpModelBytes?: Uint8Array; // blaze_face_short_range.tflite bytes
  disableMediaPipe?: boolean;
};

export async function createBestDetector(opts: DetectorInitOptions = {}): Promise<IDetector | null> {
  const prefer = opts.prefer ?? "auto";

  // Try Native
  if ((prefer === "auto" || prefer === "native") && "FaceDetector" in window) {
    try { return new NativeDetector(); } catch {}
  }

// Try MediaPipe
  if ((prefer === "auto" || prefer === "mediapipe") && !opts.disableMediaPipe) {
    try {
      const fileset = await FilesetResolver.forVisionTasks(opts.wasmBaseUrl || "/mediapipe/wasm");
      const detector = await MPFaceDetector.createFromOptions(fileset, {
        baseOptions: {
          ...(opts.mpModelBytes ? { modelAssetBuffer: opts.mpModelBytes } : {}),
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.5,
      });
      return new MediaPipeDetector(fileset, detector);
    } catch (e) {
      console.warn("MediaPipe init failed:", e);
    }
  }

  // Try TFJS BlazeFace last
  if (prefer === "auto" || prefer === "tfjs") {
    try {
      const blazeface = await import("@tensorflow-models/blazeface");
      const model = await blazeface.load();
      return new TFJSBlazeFaceDetector(model);
    } catch (e) {
      console.warn("TFJS BlazeFace init failed:", e);
    }
  }

  return null;
}
