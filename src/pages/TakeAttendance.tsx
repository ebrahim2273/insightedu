import { useEffect, useRef, useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Camera, Square, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { generateFaceEmbedding, cosineSimilarity, initFaceModel } from "@/lib/faceEmbedding";
import { FaceDetector as MPFaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

interface DetectedFace {
  boundingBox: { x: number; y: number; width: number; height: number };
  studentId?: string;
  studentName?: string;
  confidence?: number;
}

const SIMILARITY_THRESHOLD = 0.65;

const TakeAttendance = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const detectionRafRef = useRef<number | null>(null);
  const faceDetectorRef = useRef<any | null>(null);
  const mpFaceDetectorRef = useRef<any | null>(null);
  const visionRef = useRef<any | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const markedStudents = useRef<Set<string>>(new Set());
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([]);
  const [detectorSupported, setDetectorSupported] = useState<boolean>(false);
  const [detectorType, setDetectorType] = useState<'native' | 'mediapipe' | 'unavailable'>('unavailable');
  const [faceCount, setFaceCount] = useState<number>(0);
  const [profilesLoaded, setProfilesLoaded] = useState<number>(0);
  const [studentEmbeddings, setStudentEmbeddings] = useState<Array<{ 
    studentId: string; 
    studentName: string; 
    embedding: number[];
    embeddings: number[][];
  }>>([]);
  
  const { toast } = useToast();

  // Fetch classes and students on mount + preload MediaPipe
  useEffect(() => {
    fetchClasses();
    
    // Preload MediaPipe WASM
    const preloadMediaPipe = async () => {
      try {
        if (!visionRef.current) {
          console.log('Preloading MediaPipe WASM...');
          visionRef.current = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
          );
          console.log('MediaPipe WASM preloaded');
        }
      } catch (error) {
        console.warn('MediaPipe preload failed:', error);
      }
    };
    
    preloadMediaPipe();
    
    return () => {
      stopCamera();
    };
  }, []);

  // Fetch students when class changes
  useEffect(() => {
    if (selectedClass) {
      fetchStudents();
      markedStudents.current.clear();
    }
  }, [selectedClass]);

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
      toast({
        title: "Error",
        description: "Failed to load classes",
        variant: "destructive",
      });
    }
  };

  const fetchStudents = async () => {
    if (!selectedClass) return;
    
    try {
      setLoadingStudents(true);
      console.log(`Fetching students for class: ${selectedClass}`);
      
      // Fetch students for selected class
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', selectedClass);
      
      if (studentsError) throw studentsError;
      
      console.log(`Found ${studentsData?.length || 0} students`);
      setStudents(studentsData || []);
      
      // Fetch face embeddings for these students
      const studentIds = studentsData?.map(s => s.id) || [];
      if (studentIds.length === 0) {
        setStudentEmbeddings([]);
        setProfilesLoaded(0);
        return;
      }
      
      const { data: embeddingsData, error: embeddingsError } = await supabase
        .from('face_embeddings')
        .select('*')
        .in('student_id', studentIds);
      
      if (embeddingsError) throw embeddingsError;
      
      console.log(`Loaded ${embeddingsData?.length || 0} face embeddings`);
      
      // Group embeddings by student (store ALL embeddings per student)
      const embeddingsByStudent = (embeddingsData || []).reduce((acc, emb) => {
        if (!acc[emb.student_id]) {
          acc[emb.student_id] = [];
        }
        acc[emb.student_id].push(emb.embedding);
        return acc;
      }, {} as Record<string, number[][]>);
      
      // Create student embeddings array with ALL embeddings
      const studentEmbeddingsArray = studentsData?.map(student => ({
        studentId: student.id,
        studentName: student.name,
        embedding: embeddingsByStudent[student.id]?.[0] || [], // Keep for compatibility
        embeddings: embeddingsByStudent[student.id] || [], // All embeddings
      })) || [];
      
      setStudentEmbeddings(studentEmbeddingsArray);
      setProfilesLoaded(studentEmbeddingsArray.filter(s => s.embeddings.length > 0).length);
      
      if (studentEmbeddingsArray.filter(s => s.embeddings.length > 0).length > 0) {
        toast({
          title: "Profiles loaded",
          description: `${studentEmbeddingsArray.filter(s => s.embeddings.length > 0).length} face profiles ready`,
        });
      }
      
    } catch (error) {
      console.error('Error fetching students:', error);
      toast({
        title: "Error",
        description: "Failed to load students",
        variant: "destructive",
      });
    } finally {
      setLoadingStudents(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsStreaming(true);
        
        // Set canvas dimensions to match video
        if (overlayCanvasRef.current) {
          overlayCanvasRef.current.width = videoRef.current.videoWidth;
          overlayCanvasRef.current.height = videoRef.current.videoHeight;
        }
        
        toast({
          title: "Camera started",
          description: "Initializing face detection...",
        });
        
        // Start face detection
        await startFaceDetection();
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: "Camera error",
        description: "Failed to access camera",
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    if (detectionRafRef.current) {
      cancelAnimationFrame(detectionRafRef.current);
      detectionRafRef.current = null;
    }
    
    setIsStreaming(false);
    setDetectedFaces([]);
    setFaceCount(0);
  };

  const startFaceDetection = async () => {
    try {
      // Try native FaceDetector first
      if ('FaceDetector' in window) {
        console.log("Trying native FaceDetector API...");
        const detector = new (window as any).FaceDetector();
        faceDetectorRef.current = detector;
        setDetectorSupported(true);
        setDetectorType('native');
        console.log("Native FaceDetector initialized successfully");
        toast({
          title: "Face detection ready",
          description: "Using native browser face detection",
        });
      } else {
        // Fallback to MediaPipe
        console.log("Native FaceDetector not available, using MediaPipe...");
        
        if (!visionRef.current) {
          console.log("Loading MediaPipe WASM files...");
          visionRef.current = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
          );
          console.log("MediaPipe WASM loaded successfully");
        }
        
        console.log("Creating MediaPipe face detector...");
        try {
          // Try Google CDN first
          mpFaceDetectorRef.current = await MPFaceDetector.createFromOptions(visionRef.current, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            minDetectionConfidence: 0.5,
          });
          console.log("MediaPipe face detector created with Google CDN");
        } catch (cdnError) {
          console.warn("Google CDN failed, trying local model...", cdnError);
          try {
            // Fallback to local model
            mpFaceDetectorRef.current = await MPFaceDetector.createFromOptions(visionRef.current, {
              baseOptions: {
                modelAssetPath: "/models/blaze_face_short_range.tflite",
              },
              runningMode: "VIDEO",
              minDetectionConfidence: 0.5,
            });
            console.log("MediaPipe face detector created with local model");
          } catch (localError) {
            console.error("Both CDN and local model failed:", localError);
            throw localError;
          }
        }
        
        setDetectorSupported(true);
        setDetectorType('mediapipe');
        toast({
          title: "Face detection active",
          description: "Using MediaPipe face detection",
        });
      }
    } catch (error) {
      console.error("Face detection initialization failed:", error);
      setDetectorSupported(false);
      setDetectorType('unavailable');
      toast({
        title: "Detection unavailable",
        description: "Model load failed. Check network and reload.",
        variant: "destructive",
      });
      return;
    }

    // Preload face embedding model
    try {
      console.log("Preloading face embedding model...");
      await initFaceModel();
      console.log("Face embedding model ready");
    } catch (embError) {
      console.warn("Face embedding model preload failed:", embError);
    }

    // Start detection loop
    const detectLoop = async () => {
      const video = videoRef.current;
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        detectionRafRef.current = requestAnimationFrame(detectLoop);
        return;
      }

      try {
        // Use MediaPipe
        if (mpFaceDetectorRef.current) {
          const detections = mpFaceDetectorRef.current.detectForVideo(video, performance.now());
          
          if (detections && detections.detections) {
            const newFaces: DetectedFace[] = detections.detections.map((detection: any) => {
              const bbox = detection.boundingBox;
              return {
                boundingBox: {
                  x: bbox.originX,
                  y: bbox.originY,
                  width: bbox.width,
                  height: bbox.height,
                },
                confidence: detection.categories?.[0]?.score || 0,
              };
            });
            
            setDetectedFaces(newFaces);
            setFaceCount(newFaces.length);
            drawDetections(newFaces);
            
            // Process faces for recognition
            for (const face of newFaces) {
              await processFaceForRecognition(face, video);
            }
          } else {
            setFaceCount(0);
          }
        }
        // Use native FaceDetector
        else if (faceDetectorRef.current) {
          const detections = await faceDetectorRef.current.detect(video);
          
          if (detections && detections.length > 0) {
            const newFaces: DetectedFace[] = detections.map((detection: any) => ({
              boundingBox: detection.boundingBox,
              confidence: detection.confidence || 0,
            }));
            
            setDetectedFaces(newFaces);
            setFaceCount(newFaces.length);
            drawDetections(newFaces);
            
            // Process faces for recognition
            for (const face of newFaces) {
              await processFaceForRecognition(face, video);
            }
          } else {
            setFaceCount(0);
          }
        }
      } catch (error) {
        console.error('Detection error:', error);
      }

      detectionRafRef.current = requestAnimationFrame(detectLoop);
    };

    detectLoop();
  };

  const processFaceForRecognition = async (face: DetectedFace, video: HTMLVideoElement) => {
    try {
      if (studentEmbeddings.length === 0) return;
      
      // Create a canvas to crop face to 224x224
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const bbox = face.boundingBox;
      
      // Set canvas to 224x224 for model input
      canvas.width = 224;
      canvas.height = 224;
      
      // Calculate source dimensions with padding
      const padding = 0.2; // 20% padding around face
      const paddedWidth = bbox.width * (1 + padding * 2);
      const paddedHeight = bbox.height * (1 + padding * 2);
      const paddedX = bbox.x - bbox.width * padding;
      const paddedY = bbox.y - bbox.height * padding;
      
      // Draw the face region scaled to 224x224
      ctx.drawImage(
        video,
        paddedX, paddedY, paddedWidth, paddedHeight,
        0, 0, 224, 224
      );
      
      // Convert canvas to data URL for embedding generation
      const imageData = canvas.toDataURL('image/jpeg');
      
      // Generate embedding for detected face
      const faceEmbedding = await generateFaceEmbedding(imageData);
      
      // Find best match across ALL student embeddings
      let bestMatch: { studentId: string; studentName: string; confidence: number } | null = null;
      let highestSimilarity = SIMILARITY_THRESHOLD;
      
      for (const student of studentEmbeddings) {
        const embeddings = student.embeddings || [student.embedding];
        
        for (const embedding of embeddings) {
          if (embedding.length === 0) continue;
          
          const similarity = cosineSimilarity(faceEmbedding, embedding);
          
          if (similarity > highestSimilarity) {
            highestSimilarity = similarity;
            bestMatch = {
              studentId: student.studentId,
              studentName: student.studentName,
              confidence: similarity,
            };
          }
        }
      }
      
      if (bestMatch && !markedStudents.current.has(bestMatch.studentId)) {
        console.log(`✓ Match found: ${bestMatch.studentName} (${(bestMatch.confidence * 100).toFixed(1)}%)`);
        
        // Update detected face with student info
        setDetectedFaces(prev => prev.map(f => 
          f.boundingBox === face.boundingBox 
            ? { ...f, studentId: bestMatch!.studentId, studentName: bestMatch!.studentName }
            : f
        ));
        
        // Mark attendance
        await markAttendance(bestMatch.studentId, bestMatch.studentName, bestMatch.confidence);
      }
    } catch (error) {
      console.error('Error processing face:', error);
    }
  };

  const drawDetections = (faces: DetectedFace[]) => {
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    
    if (!canvas || !video) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw rectangles around detected faces
    faces.forEach((face) => {
      const bbox = face.boundingBox;
      
      // Convert relative coordinates to canvas coordinates if needed
      let x = bbox.x;
      let y = bbox.y;
      let width = bbox.width;
      let height = bbox.height;
      
      // If coordinates are relative (0-1 range), convert to absolute
      if (x <= 1 && y <= 1 && width <= 1 && height <= 1) {
        x = bbox.x * canvas.width;
        y = bbox.y * canvas.height;
        width = bbox.width * canvas.width;
        height = bbox.height * canvas.height;
      }
      
      // Draw box
      ctx.strokeStyle = face.studentName ? '#00ff00' : '#ff6b00';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);
      
      // Draw label background
      if (face.studentName) {
        const label = face.studentName;
        ctx.font = 'bold 16px Arial';
        const textWidth = ctx.measureText(label).width;
        
        ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
        ctx.fillRect(x, y - 25, textWidth + 10, 25);
        
        ctx.fillStyle = '#000';
        ctx.fillText(label, x + 5, y - 7);
      }
      
      // Draw confidence
      if (face.confidence) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y + height, 80, 20);
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.fillText(`${(face.confidence * 100).toFixed(0)}%`, x + 5, y + height + 15);
      }
    });
  };

  const markAttendance = async (studentId: string, studentName: string, confidence: number) => {
    if (markedStudents.current.has(studentId)) return;
    
    try {
      markedStudents.current.add(studentId);
      
      const { error } = await supabase
        .from('attendance')
        .insert({
          student_id: studentId,
          class_id: selectedClass,
          status: 'present',
          marked_at: new Date().toISOString(),
        });
      
      if (error) throw error;
      
      // Update UI
      setStudents(prev => prev.map(s => 
        s.id === studentId ? { ...s, attendance: 'present' } : s
      ));
      
      toast({
        title: "✓ Attendance marked",
        description: `${studentName} - ${(confidence * 100).toFixed(1)}% match`,
      });
    } catch (error) {
      console.error('Error marking attendance:', error);
      markedStudents.current.delete(studentId);
      toast({
        title: "Error",
        description: "Failed to mark attendance",
        variant: "destructive",
      });
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Status Header */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-muted-foreground">Detector: </span>
                  <span className={`font-semibold ${
                    detectorType === 'native' ? 'text-green-600' :
                    detectorType === 'mediapipe' ? 'text-blue-600' :
                    'text-red-600'
                  }`}>
                    {detectorType === 'native' ? 'Native' :
                     detectorType === 'mediapipe' ? 'MediaPipe' :
                     'Unavailable'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Faces: </span>
                  <span className="font-semibold">{faceCount}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Profiles Loaded: </span>
                  <span className="font-semibold">{profilesLoaded}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Take Attendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Class Selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">Select Class</label>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Camera Controls */}
            <div className="flex gap-2">
              <Button
                onClick={startCamera}
                disabled={isStreaming || !selectedClass || loadingStudents}
                className="flex items-center gap-2"
              >
                {loadingStudents ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading profiles...
                  </>
                ) : (
                  <>
                    <Camera className="h-4 w-4" />
                    Start Camera
                  </>
                )}
              </Button>
              <Button
                onClick={stopCamera}
                disabled={!isStreaming}
                variant="destructive"
                className="flex items-center gap-2"
              >
                <Square className="h-4 w-4" />
                Stop Camera
              </Button>
            </div>

            {/* Camera Feed */}
            {selectedClass && (
              <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                />
                <canvas
                  ref={overlayCanvasRef}
                  className="absolute top-0 left-0 w-full h-full"
                />
                {!isStreaming && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-muted-foreground">Camera not started</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Student List */}
        {selectedClass && students.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Students ({students.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {students.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium">{student.name}</p>
                        <p className="text-sm text-muted-foreground">{student.student_id}</p>
                      </div>
                    </div>
                    <div>
                      {markedStudents.current.has(student.id) ? (
                        <Badge className="bg-green-500">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Present
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <XCircle className="h-3 w-3 mr-1" />
                          Absent
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default TakeAttendance;
