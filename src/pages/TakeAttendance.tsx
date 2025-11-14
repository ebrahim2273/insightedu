import { useEffect, useRef, useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Camera, Square, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { generateFaceEmbedding, findBestMatch } from "@/lib/faceEmbedding";
import { FaceDetector as MPFaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

interface DetectedFace {
  box: { x: number; y: number; width: number; height: number };
  studentId?: string;
  studentName?: string;
  confidence?: number;
}

const TakeAttendance = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const detectionRafRef = useRef<number | null>(null);
  const faceDetectorRef = useRef<any | null>(null);
  const mpFaceDetectorRef = useRef<any | null>(null);
  const visionRef = useRef<any | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([]);
  const [markedAttendance, setMarkedAttendance] = useState<Set<string>>(new Set());
  const [detectorSupported, setDetectorSupported] = useState<boolean>(typeof (window as any).FaceDetector !== 'undefined');
  const [detectionCount, setDetectionCount] = useState(0);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [studentEmbeddings, setStudentEmbeddings] = useState<Array<{ studentId: string; studentName: string; embedding: number[] }>>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchClasses();
    fetchStudents();
    
    return () => {
      stopCamera();
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedClass) {
      fetchClassStudents();
      loadStudentEmbeddings();
      setMarkedAttendance(new Set());
    }
  }, [selectedClass]);

  const loadStudentEmbeddings = async () => {
    if (!selectedClass) return;
    
    setIsLoadingModel(true);
    try {
      // Fetch students with their face embeddings
      const { data: studentsData } = await supabase
        .from('students')
        .select('id, name, face_embeddings(embedding_data)')
        .eq('class_id', selectedClass)
        .eq('status', 'active');

      if (!studentsData) return;

      // Extract embeddings
      const embeddings: Array<{ studentId: string; studentName: string; embedding: number[] }> = [];
      
      for (const student of studentsData) {
        const faceEmbeddings = student.face_embeddings as any[];
        if (faceEmbeddings && faceEmbeddings.length > 0) {
          // Use the first embedding for each student
          const embeddingData = faceEmbeddings[0].embedding_data;
          if (embeddingData && embeddingData.embedding) {
            embeddings.push({
              studentId: student.id,
              studentName: student.name,
              embedding: embeddingData.embedding,
            });
          }
        }
      }

      setStudentEmbeddings(embeddings);
      
      if (embeddings.length > 0) {
        toast({
          title: "Face recognition ready",
          description: `Loaded ${embeddings.length} student face profiles`,
        });
      }
    } catch (error) {
      console.error('Error loading embeddings:', error);
      toast({
        title: "Warning",
        description: "Could not load face recognition data",
        variant: "destructive",
      });
    } finally {
      setIsLoadingModel(false);
    }
  };

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('*')
      .order('name');
    setClasses(data || []);
  };

  const fetchStudents = async () => {
    const { data } = await supabase
      .from('students')
      .select('*, face_embeddings(*)')
      .eq('status', 'active');
    setStudents(data || []);
  };

  const fetchClassStudents = async () => {
    if (!selectedClass) return;
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('class_id', selectedClass)
      .eq('status', 'active')
      .order('name');
    setClassStudents(data || []);
  };

  const startCamera = async () => {
    if (!selectedClass) {
      toast({
        title: "Error",
        description: "Please select a class first",
        variant: "destructive",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
        };
        setIsStreaming(true);
        startFaceDetection();
        toast({
          title: "Camera Started",
          description: "Face detection is now active",
        });
      }
    } catch (error) {
      console.error("Camera error:", error);
      toast({
        title: "Error",
        description: "Failed to access camera. Please allow camera permissions.",
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    if (detectionRafRef.current) {
      cancelAnimationFrame(detectionRafRef.current);
      detectionRafRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    setDetectedFaces([]);
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const startFaceDetection = async () => {
    // Clear existing timers
    if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
    if (detectionRafRef.current) cancelAnimationFrame(detectionRafRef.current);

    if (!videoRef.current) return;

    // Helper to keep the guide frame visible when detection is unavailable
    const drawGuideFrame = () => {
      if (!canvasRef.current || !videoRef.current) return;
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const rect = video.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width * 0.35;
      const h = canvas.height * 0.45;
      const x = (canvas.width - w) / 2;
      const y = (canvas.height - h) / 2;
      
      // Get accent color from CSS
      const accentColor = getCanvasColor('--accent');
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 14px system-ui';
      const msg = 'Align your face within the frame';
      const textW = ctx.measureText(msg).width;
      ctx.fillText(msg, (canvas.width - textW) / 2, Math.max(24, y - 12));
    };

    // Prefer the native FaceDetector API. If unavailable, initialize MediaPipe fallback.
    const FaceDetectorCtor = (window as any).FaceDetector;
    if (!FaceDetectorCtor) {
      try {
        if (!visionRef.current) {
          visionRef.current = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
          );
        }
        mpFaceDetectorRef.current = await MPFaceDetector.createFromOptions(visionRef.current, {
          baseOptions: {
            modelAssetPath:
              "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/face_detection_short_range.tflite",
          },
          runningMode: "VIDEO",
        });
        setDetectorSupported(true);
      } catch (e) {
        setDetectorSupported(false);
        // Draw guide frame periodically while streaming
        detectionIntervalRef.current = setInterval(() => {
          if (!isStreaming) return;
          drawGuideFrame();
        }, 300);
        toast({
          title: "Face detection unavailable",
          description:
            "This browser lacks native detection and the fallback failed to load. Use manual marking or try Chrome/Edge.",
        });
        return;
      }
    } else {
      setDetectorSupported(true);
      try {
        faceDetectorRef.current = new FaceDetectorCtor({ fastMode: true });
      } catch (e) {
        // If native fails, try fallback once
        try {
          if (!visionRef.current) {
            visionRef.current = await FilesetResolver.forVisionTasks(
              "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
            );
          }
          mpFaceDetectorRef.current = await MPFaceDetector.createFromOptions(visionRef.current, {
            baseOptions: {
              modelAssetPath:
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/face_detection_short_range.tflite",
            },
            runningMode: "VIDEO",
          });
          setDetectorSupported(true);
        } catch (err) {
          setDetectorSupported(false);
          toast({
            title: "Face detection error",
            description: "Could not initialize any face detector. Try refreshing the page.",
            variant: "destructive",
          });
          return;
        }
      }
    }
    // Unified face detection (native or MediaPipe)
    const getFaceBoxes = async (videoEl: HTMLVideoElement) => {
      // Native FaceDetector
      if (faceDetectorRef.current) {
        const faces = await faceDetectorRef.current.detect(videoEl);
        return (faces || []).map((f: any) => ({
          x: f.boundingBox?.x ?? 0,
          y: f.boundingBox?.y ?? 0,
          width: f.boundingBox?.width ?? 0,
          height: f.boundingBox?.height ?? 0,
        }));
      }
      // MediaPipe fallback
      if (mpFaceDetectorRef.current) {
        const result = mpFaceDetectorRef.current.detectForVideo(videoEl, performance.now());
        const dets = result?.detections || [];
        return dets.map((d: any) => ({
          x: d.boundingBox?.originX ?? 0,
          y: d.boundingBox?.originY ?? 0,
          width: d.boundingBox?.width ?? 0,
          height: d.boundingBox?.height ?? 0,
        }));
      }
      return [] as Array<{ x: number; y: number; width: number; height: number }>;
    };

    const detect = async () => {
      if (!isStreaming || !videoRef.current) return;
      const video = videoRef.current;
      if (video.readyState !== 4) {
        detectionRafRef.current = requestAnimationFrame(detect);
        return;
      }

      try {
        const boxes = await getFaceBoxes(video);
        setDetectionCount(boxes.length);

        const mappedFaces: DetectedFace[] = [];
        for (const faceBox of boxes) {
          let recognizedStudent: { studentId: string; studentName: string; confidence: number } | null = null;

          if (studentEmbeddings.length > 0) {
            try {
              const sx = Math.max(0, Math.floor(faceBox.x));
              const sy = Math.max(0, Math.floor(faceBox.y));
              const sw = Math.max(1, Math.floor(faceBox.width));
              const sh = Math.max(1, Math.floor(faceBox.height));

              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = sw;
              tempCanvas.height = sh;
              const tempCtx = tempCanvas.getContext('2d');
              if (tempCtx) {
                tempCtx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
                const faceImageData = tempCanvas.toDataURL('image/jpeg', 0.8);
                const faceEmbedding = await generateFaceEmbedding(faceImageData);
                recognizedStudent = findBestMatch(faceEmbedding, studentEmbeddings, 0.5);
                if (recognizedStudent && !markedAttendance.has(recognizedStudent.studentId)) {
                  await markAttendance(recognizedStudent.studentId, 'present');
                }
              }
            } catch {
              // ignore recognition errors per frame
            }
          }

          mappedFaces.push({
            box: faceBox,
            studentId: recognizedStudent?.studentId,
            studentName: recognizedStudent?.studentName,
            confidence: recognizedStudent?.confidence,
          });
        }

        setDetectedFaces(mappedFaces);
        drawDetections(mappedFaces);
      } catch {
        // ignore detection errors
      }

      detectionRafRef.current = requestAnimationFrame(detect);
    };

    detectionRafRef.current = requestAnimationFrame(detect);
  };

  const getCanvasColor = (cssVar: string): string => {
    const computedStyle = getComputedStyle(document.documentElement);
    const hslValue = computedStyle.getPropertyValue(cssVar).trim();
    return hslValue ? `hsl(${hslValue})` : '#10b981';
  };

  const drawDetections = (faces: DetectedFace[]) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    // Size canvas to match displayed video size
    const videoRect = video.getBoundingClientRect();
    canvas.width = videoRect.width;
    canvas.height = videoRect.height;

    // Compute scaling from intrinsic video dimensions to displayed size
    const scaleX = videoRect.width / (video.videoWidth || 1);
    const scaleY = videoRect.height / (video.videoHeight || 1);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get colors from CSS variables
    const successColor = getCanvasColor('--success');
    const primaryColor = getCanvasColor('--primary');

    faces.forEach((face, i) => {
      const isRecognized = !!face.studentId;
      const x = face.box.x * scaleX;
      const y = face.box.y * scaleY;
      const w = face.box.width * scaleX;
      const h = face.box.height * scaleY;

      // Border - use primary color for detected faces
      ctx.strokeStyle = isRecognized ? successColor : primaryColor;
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, w, h);

      // Label background
      const label = face.studentName || 'Detected';
      const labelH = 32;
      ctx.fillStyle = isRecognized ? successColor : primaryColor;
      ctx.fillRect(x, Math.max(0, y - labelH), Math.max(100, w), labelH);

      // Label text
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 15px system-ui';
      ctx.fillText(label, x + 8, Math.max(20, y - 9));
    });
  };

  const markAttendance = async (studentId: string, status: 'present' | 'absent' | 'late') => {
    if (!selectedClass) return;

    const { error } = await supabase
      .from('attendance')
      .insert({
        student_id: studentId,
        class_id: selectedClass,
        status: status
      });

    if (!error) {
      setMarkedAttendance(prev => new Set([...prev, studentId]));
      const student = students.find(s => s.id === studentId);
      toast({
        title: "Attendance Marked",
        description: `${student?.name} marked as ${status}`,
      });
    }
  };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Take Attendance</h1>
          <p className="text-muted-foreground">Real-time face recognition attendance tracking</p>
        </div>

        {/* Controls */}
        <Card className="border-border/50 animate-scale-in">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Select value={selectedClass} onValueChange={setSelectedClass} disabled={isLoadingModel}>
                    <SelectTrigger className="transition-all duration-200 hover:border-primary/50">
                      <SelectValue placeholder="Select a class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map(cls => (
                        <SelectItem key={cls.id} value={cls.id}>
                          {cls.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!isStreaming ? (
                  <Button 
                    onClick={startCamera} 
                    className="gap-2 hover:scale-105 transition-transform duration-200"
                    disabled={isLoadingModel || !selectedClass}
                  >
                    {isLoadingModel ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <Camera className="w-4 h-4" />
                        Start Camera
                      </>
                    )}
                  </Button>
                ) : (
                  <Button onClick={stopCamera} variant="destructive" className="gap-2 hover:scale-105 transition-transform duration-200">
                    <Square className="w-4 h-4" />
                    Stop Camera
                  </Button>
                )}
              </div>

              {/* Detection Status Indicators */}
              {isStreaming && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border/50">
                  <div className="flex items-center gap-2">
                    {detectorSupported ? (
                      <Badge variant="default" className="gap-1.5">
                        <CheckCircle2 className="w-3 h-3" />
                        Face Detection Active
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1.5">
                        <XCircle className="w-3 h-3" />
                        Detection Unavailable
                      </Badge>
                    )}
                  </div>
                  
                  {detectorSupported && (
                    <>
                      <div className="h-4 w-px bg-border" />
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Faces Detected:</span>
                        <Badge variant="secondary" className="font-mono">
                          {detectionCount}
                        </Badge>
                      </div>
                      
                      <div className="h-4 w-px bg-border" />
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Face Database:</span>
                        <Badge variant="secondary" className="font-mono">
                          {studentEmbeddings.length} students
                        </Badge>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Camera Feed and Student List */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Camera Feed */}
          <Card className="lg:col-span-2 border-border/50 animate-scale-in hover:shadow-lg transition-shadow duration-300" style={{ animationDelay: "0.1s" }}>
            <CardHeader>
              <CardTitle>Live Camera Feed</CardTitle>
            </CardHeader>
            <CardContent>
              {isStreaming && !detectorSupported && (
                <p className="text-sm text-muted-foreground mb-2">
                  Face detection not supported in this browser. Use manual marking or try Chrome/Edge.
                </p>
              )}
              <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
                {!isStreaming && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Camera className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Select a class and start camera to begin</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Student Attendance List */}
          {selectedClass && classStudents.length > 0 && (
            <Card className="border-border/50 animate-scale-in hover:shadow-lg transition-shadow duration-300" style={{ animationDelay: "0.2s" }}>
              <CardHeader>
                <CardTitle>Class Students</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Present: {markedAttendance.size} / {classStudents.length}
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {classStudents.map((student, index) => {
                    const isPresent = markedAttendance.has(student.id);
                    return (
                      <div
                        key={student.id}
                        className={`p-3 rounded-lg border transition-all duration-300 animate-fade-in hover:scale-102`}
                        style={{ 
                          animationDelay: `${index * 0.03}s`,
                          backgroundColor: isPresent ? 'hsl(var(--success) / 0.1)' : 'hsl(var(--muted) / 0.5)',
                          borderColor: isPresent ? 'hsl(var(--success) / 0.3)' : 'hsl(var(--border))',
                          color: isPresent ? 'hsl(var(--success-foreground))' : 'hsl(var(--foreground))'
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className={`font-medium ${isPresent ? 'text-success' : ''}`}>
                              {student.name}
                            </p>
                            {student.student_id && (
                              <p className="text-xs opacity-70">
                                ID: {student.student_id}
                              </p>
                            )}
                          </div>
                          {isPresent && (
                            <div className="w-3 h-3 rounded-full bg-success animate-pulse-glow" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Attendance Summary */}
        {markedAttendance.size > 0 && (
          <Card className="border-success/50 animate-fade-in-up hover:shadow-lg transition-shadow duration-300">
            <CardHeader>
              <CardTitle className="text-success">Recently Marked: {markedAttendance.size} students</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {Array.from(markedAttendance).map((studentId, index) => {
                  const student = classStudents.find(s => s.id === studentId) || students.find(s => s.id === studentId);
                  return (
                    <div 
                      key={studentId} 
                      className="p-3 bg-success/10 rounded-lg border border-success/20 animate-scale-in hover:scale-105 transition-transform duration-200"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <p className="font-medium text-sm">{student?.name}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default TakeAttendance;
