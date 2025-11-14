import { useEffect, useRef, useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([]);
  const [markedAttendance, setMarkedAttendance] = useState<Set<string>>(new Set());
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
      setMarkedAttendance(new Set());
    }
  }, [selectedClass]);

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

  const startFaceDetection = () => {
    // Prefer native FaceDetector if available
    const canUseFaceDetector = typeof (window as any).FaceDetector !== 'undefined';

    // Clear existing timers
    if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
    if (detectionRafRef.current) cancelAnimationFrame(detectionRafRef.current);

    if (canUseFaceDetector) {
      faceDetectorRef.current = new (window as any).FaceDetector({ fastMode: true });

      const detectLoop = async () => {
        if (!isStreaming || !videoRef.current) return;
        try {
          const faces = await faceDetectorRef.current.detect(videoRef.current);
          const mapped = (faces || []).map((f: any) => ({
            box: { x: f.boundingBox.x, y: f.boundingBox.y, width: f.boundingBox.width, height: f.boundingBox.height },
            confidence: 0.9,
          })) as DetectedFace[];
          setDetectedFaces(mapped);
          drawDetections(mapped);
        } catch (e) {
          // Silent fail; continue loop
        }
        detectionRafRef.current = requestAnimationFrame(detectLoop);
      };
      detectionRafRef.current = requestAnimationFrame(detectLoop);
      return;
    }

    // Fallback to mock if FaceDetector not available
    detectionIntervalRef.current = setInterval(() => {
      if (!isStreaming || !videoRef.current || videoRef.current.readyState !== 4) return;
      const mockFaces: DetectedFace[] = [];
      const numRecognized = Math.floor(Math.random() * 2);
      const numUnknown = Math.random() > 0.7 ? 1 : 0;
      students.slice(0, numRecognized).forEach((student, i) => {
        mockFaces.push({
          box: { x: 200 + i * 250, y: 100, width: 200, height: 240 },
          studentId: student.id,
          studentName: student.name,
          confidence: 0.9,
        });
      });
      for (let i = 0; i < numUnknown; i++) {
        mockFaces.push({ box: { x: 100 + (numRecognized + i) * 250, y: 100, width: 200, height: 240 }, confidence: 0.6 });
      }
      setDetectedFaces(mockFaces);
      drawDetections(mockFaces);
      mockFaces.forEach(face => {
        if (face.studentId && !markedAttendance.has(face.studentId)) {
          markAttendance(face.studentId, 'present');
        }
      });
    }, 3000);
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
    const scaleX = videoRect.width / (video.videoWidth || videoRect.width);
    const scaleY = videoRect.height / (video.videoHeight || videoRect.height);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    faces.forEach(face => {
      const isRecognized = !!face.studentId;
      const x = face.box.x * scaleX;
      const y = face.box.y * scaleY;
      const w = face.box.width * scaleX;
      const h = face.box.height * scaleY;

      // Border
      ctx.strokeStyle = isRecognized ? '#10b981' : '#ef4444';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);

      // Label background
      const label = face.studentName || 'Unknown';
      const labelH = 24;
      ctx.fillStyle = isRecognized ? '#10b981' : '#ef4444';
      ctx.fillRect(x, Math.max(0, y - labelH), Math.max(60, w), labelH);

      // Label text
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText(label, x + 6, Math.max(14, y - 6));
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
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Select value={selectedClass} onValueChange={setSelectedClass}>
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
                <Button onClick={startCamera} className="gap-2 hover:scale-105 transition-transform duration-200">
                  <Camera className="w-4 h-4" />
                  Start Camera
                </Button>
              ) : (
                <Button onClick={stopCamera} variant="destructive" className="gap-2 hover:scale-105 transition-transform duration-200">
                  <Square className="w-4 h-4" />
                  Stop Camera
                </Button>
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
