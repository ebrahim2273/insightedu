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
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([]);
  const [markedAttendance, setMarkedAttendance] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    fetchClasses();
    fetchStudents();
  }, []);

  useEffect(() => {
    if (isStreaming) {
      startFaceDetection();
    }
    return () => {
      stopCamera();
    };
  }, [isStreaming]);

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
        // Ensure video plays
        await videoRef.current.play();
        setIsStreaming(true);
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
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  };

  const startFaceDetection = () => {
    // Simulated face detection (in real implementation, use @huggingface/transformers)
    const interval = setInterval(() => {
      if (!isStreaming || !videoRef.current) return;

      // Simulate detecting faces with mock data
      const mockFaces: DetectedFace[] = [];
      
      // Randomly detect some students
      students.slice(0, Math.floor(Math.random() * 3) + 1).forEach((student, i) => {
        mockFaces.push({
          box: {
            x: 100 + i * 200,
            y: 150,
            width: 150,
            height: 180
          },
          studentId: student.id,
          studentName: student.name,
          confidence: 0.85 + Math.random() * 0.15
        });
      });

      setDetectedFaces(mockFaces);
      drawDetections(mockFaces);
      
      // Auto-mark attendance
      mockFaces.forEach(face => {
        if (face.studentId && !markedAttendance.has(face.studentId)) {
          markAttendance(face.studentId, 'present');
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  };

  const drawDetections = (faces: DetectedFace[]) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    faces.forEach(face => {
      const isRecognized = !!face.studentId;
      
      // Draw rectangle
      ctx.strokeStyle = isRecognized ? '#10b981' : '#ef4444';
      ctx.lineWidth = 3;
      ctx.strokeRect(face.box.x, face.box.y, face.box.width, face.box.height);

      // Draw label
      if (face.studentName) {
        ctx.fillStyle = '#10b981';
        ctx.fillRect(face.box.x, face.box.y - 30, face.box.width, 30);
        ctx.fillStyle = '#ffffff';
        ctx.font = '16px Arial';
        ctx.fillText(face.studentName, face.box.x + 5, face.box.y - 8);
      } else {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(face.box.x, face.box.y - 30, face.box.width, 30);
        ctx.fillStyle = '#ffffff';
        ctx.font = '16px Arial';
        ctx.fillText('Unknown', face.box.x + 5, face.box.y - 8);
      }
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

        {/* Camera Feed */}
        <Card className="border-border/50 animate-scale-in hover:shadow-lg transition-shadow duration-300" style={{ animationDelay: "0.1s" }}>
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
                className="absolute inset-0 w-full h-full"
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

        {/* Attendance Summary */}
        {markedAttendance.size > 0 && (
          <Card className="border-success/50 animate-fade-in-up hover:shadow-lg transition-shadow duration-300">
            <CardHeader>
              <CardTitle className="text-success">Attendance Marked: {markedAttendance.size} students</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {Array.from(markedAttendance).map((studentId, index) => {
                  const student = students.find(s => s.id === studentId);
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
