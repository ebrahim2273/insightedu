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
import { createBestDetector, IDetector } from "@/lib/detectors";

interface DetectedFace {
  boundingBox: { x: number; y: number; width: number; height: number };
  studentId?: string;
  studentName?: string;
  confidence?: number;
  faceId?: string; // For tracking across frames
}

interface SmoothedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SIMILARITY_THRESHOLD = 0.60; // Lowered for better matching
const BOX_SMOOTHING_FACTOR = 0.3; // Lower = smoother, higher = more responsive

const TakeAttendance = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const detectionRafRef = useRef<number | null>(null);
  const detectorRef = useRef<IDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const markedStudents = useRef<Set<string>>(new Set());
  const smoothedBoxes = useRef<Map<string, SmoothedBox>>(new Map());
  const lastProcessTime = useRef<Map<string, number>>(new Map());
  const faceIdCounter = useRef(0);
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([]);
  const [detectorSupported, setDetectorSupported] = useState<boolean>(false);
  const [detectorType, setDetectorType] = useState<'native' | 'tfjs' | 'unavailable'>('unavailable');
  const [faceCount, setFaceCount] = useState<number>(0);
  const [profilesLoaded, setProfilesLoaded] = useState<number>(0);
  const [studentEmbeddings, setStudentEmbeddings] = useState<Array<{ 
    studentId: string; 
    studentName: string; 
    embedding: number[];
    embeddings: number[][];
  }>>([]);
  
  const { toast } = useToast();

  // Fetch classes on mount and cleanup
  useEffect(() => {
    fetchClasses();
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
      const detector = await createBestDetector({ prefer: 'auto', disableMediaPipe: true });
      if (!detector) throw new Error('No available detector');
      detectorRef.current = detector;
      setDetectorSupported(true);
      setDetectorType(detector.kind === 'native' ? 'native' : 'tfjs');
      toast({
        title: 'Face detection ready',
        description: `Using ${detector.kind === 'native' ? 'Native FaceDetector' : 'TFJS BlazeFace'}`,
      });
    } catch (error) {
      console.error('Face detection initialization failed:', error);
      setDetectorSupported(false);
      setDetectorType('unavailable');
      toast({
        title: 'Detection unavailable',
        description: 'Detector init failed. Please reload.',
        variant: 'destructive',
      });
      return;
    }

    // Preload face embedding model
    try {
      await initFaceModel();
    } catch {}

    // Start detection loop
    const detectLoop = async () => {
      const video = videoRef.current;
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        detectionRafRef.current = requestAnimationFrame(detectLoop);
        return;
      }
      try {
        const now = performance.now();
        const dets = await detectorRef.current!.detect(video, now);
        
        // Assign face IDs based on proximity to previous detections
        const newFaces: DetectedFace[] = dets.map(d => {
          const box = { x: d.box.x, y: d.box.y, width: d.box.width, height: d.box.height };
          
          // Find closest previous face within reasonable distance
          let closestId: string | undefined;
          let minDist = Infinity;
          
          detectedFaces.forEach(prevFace => {
            if (prevFace.faceId) {
              const dist = Math.hypot(
                box.x - prevFace.boundingBox.x,
                box.y - prevFace.boundingBox.y
              );
              if (dist < minDist && dist < 0.15) { // Within 15% distance
                minDist = dist;
                closestId = prevFace.faceId;
              }
            }
          });
          
          // Assign new ID if no close match found
          if (!closestId) {
            closestId = `face_${faceIdCounter.current++}`;
          }
          
          return {
            boundingBox: box,
            confidence: d.score,
            faceId: closestId,
          };
        });
        
        setDetectedFaces(newFaces);
        setFaceCount(newFaces.length);
        drawDetections(newFaces);
        
        // Process faces for recognition (throttled per face)
        for (const face of newFaces) {
          if (face.faceId) {
            const lastTime = lastProcessTime.current.get(face.faceId) || 0;
            if (now - lastTime > 500) { // Process each face max every 500ms
              lastProcessTime.current.set(face.faceId, now);
              processFaceForRecognition(face, video);
            }
          }
        }
      } catch (err) {
        console.error('Detection error:', err);
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
      const vidW = video.videoWidth;
      const vidH = video.videoHeight;

      // Convert to absolute pixels if normalized
      const isNormalized = bbox.width <= 1 && bbox.height <= 1;
      const sx = isNormalized ? bbox.x * vidW : bbox.x;
      const sy = isNormalized ? bbox.y * vidH : bbox.y;
      const sw = isNormalized ? bbox.width * vidW : bbox.width;
      const sh = isNormalized ? bbox.height * vidH : bbox.height;
      
      // Set canvas to 224x224 for model input
      canvas.width = 224;
      canvas.height = 224;
      
      // Calculate source dimensions with padding
      const padding = 0.2; // 20% padding around face
      const paddedWidth = sw * (1 + padding * 2);
      const paddedHeight = sh * (1 + padding * 2);
      const paddedX = sx - sw * padding;
      const paddedY = sy - sh * padding;
      
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
      
      // Find best match using AVERAGE similarity across all student embeddings
      let bestMatch: { studentId: string; studentName: string; confidence: number } | null = null;
      let highestAvgSimilarity = SIMILARITY_THRESHOLD;
      
      for (const student of studentEmbeddings) {
        const embeddings = student.embeddings || [student.embedding];
        const validEmbeddings = embeddings.filter(e => e.length > 0);
        
        if (validEmbeddings.length === 0) continue;
        
        // Calculate average similarity across all embeddings for this student
        let totalSimilarity = 0;
        let maxSimilarity = 0;
        
        for (const embedding of validEmbeddings) {
          const similarity = cosineSimilarity(faceEmbedding, embedding);
          totalSimilarity += similarity;
          maxSimilarity = Math.max(maxSimilarity, similarity);
        }
        
        // Use weighted average: 70% max similarity + 30% average
        const avgSimilarity = totalSimilarity / validEmbeddings.length;
        const weightedSimilarity = maxSimilarity * 0.7 + avgSimilarity * 0.3;
        
        if (weightedSimilarity > highestAvgSimilarity) {
          highestAvgSimilarity = weightedSimilarity;
          bestMatch = {
            studentId: student.studentId,
            studentName: student.studentName,
            confidence: weightedSimilarity,
          };
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
    
    // Draw rectangles around detected faces with smoothing
    faces.forEach((face) => {
      const bbox = face.boundingBox;
      
      // Convert relative coordinates to canvas coordinates if needed
      let rawX = bbox.x;
      let rawY = bbox.y;
      let rawWidth = bbox.width;
      let rawHeight = bbox.height;
      
      // If coordinates are relative (0-1 range), convert to absolute
      if (rawX <= 1 && rawY <= 1 && rawWidth <= 1 && rawHeight <= 1) {
        rawX = bbox.x * canvas.width;
        rawY = bbox.y * canvas.height;
        rawWidth = bbox.width * canvas.width;
        rawHeight = bbox.height * canvas.height;
      }
      
      // Apply smoothing if face has consistent ID
      let x = rawX, y = rawY, width = rawWidth, height = rawHeight;
      if (face.faceId) {
        const prevBox = smoothedBoxes.current.get(face.faceId);
        if (prevBox) {
          // Exponential moving average for smooth tracking
          x = prevBox.x + (rawX - prevBox.x) * BOX_SMOOTHING_FACTOR;
          y = prevBox.y + (rawY - prevBox.y) * BOX_SMOOTHING_FACTOR;
          width = prevBox.width + (rawWidth - prevBox.width) * BOX_SMOOTHING_FACTOR;
          height = prevBox.height + (rawHeight - prevBox.height) * BOX_SMOOTHING_FACTOR;
        }
        smoothedBoxes.current.set(face.faceId, { x, y, width, height });
      }
      
      // Color coding: Green for recognized, Red for unrecognized
      const isRecognized = !!face.studentName;
      const boxColor = isRecognized ? '#10b981' : '#ef4444'; // green-500 : red-500
      const labelBg = isRecognized ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)';
      
      // Draw main box with subtle shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);
      ctx.shadowBlur = 0;
      
      // Draw corner accents for a "sticky" feel
      const cornerLen = 20;
      ctx.lineWidth = 4;
      ctx.strokeStyle = boxColor;
      
      // Top-left corner
      ctx.beginPath();
      ctx.moveTo(x, y + cornerLen);
      ctx.lineTo(x, y);
      ctx.lineTo(x + cornerLen, y);
      ctx.stroke();
      
      // Top-right corner
      ctx.beginPath();
      ctx.moveTo(x + width - cornerLen, y);
      ctx.lineTo(x + width, y);
      ctx.lineTo(x + width, y + cornerLen);
      ctx.stroke();
      
      // Bottom-left corner
      ctx.beginPath();
      ctx.moveTo(x, y + height - cornerLen);
      ctx.lineTo(x, y + height);
      ctx.lineTo(x + cornerLen, y + height);
      ctx.stroke();
      
      // Bottom-right corner
      ctx.beginPath();
      ctx.moveTo(x + width - cornerLen, y + height);
      ctx.lineTo(x + width, y + height);
      ctx.lineTo(x + width, y + height - cornerLen);
      ctx.stroke();
      
      // Draw label
      if (face.studentName) {
        const label = face.studentName;
        ctx.font = 'bold 14px system-ui';
        const textWidth = ctx.measureText(label).width;
        
        ctx.fillStyle = labelBg;
        ctx.fillRect(x - 2, y - 28, textWidth + 14, 26);
        
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, x + 5, y - 9);
      } else {
        // Show "Unknown" label for unrecognized faces
        const label = 'Unknown';
        ctx.font = '600 13px system-ui';
        const textWidth = ctx.measureText(label).width;
        
        ctx.fillStyle = labelBg;
        ctx.fillRect(x - 2, y - 26, textWidth + 14, 24);
        
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, x + 5, y - 8);
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
                    detectorType === 'tfjs' ? 'text-blue-600' :
                    'text-red-600'
                  }`}>
                    {detectorType === 'native' ? 'Native' :
                     detectorType === 'tfjs' ? 'TFJS BlazeFace' :
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
