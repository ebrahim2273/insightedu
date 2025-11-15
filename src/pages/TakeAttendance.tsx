import { useEffect, useRef, useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Camera, Square, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { loadFaceApiModels, detectFacesWithDescriptors, findBestMatchFromDescriptor } from "@/lib/faceApiHelper";

interface StudentDescriptors {
  studentId: string;
  studentName: string;
  descriptors: Float32Array[];
}

const SIMILARITY_THRESHOLD = 0.5; // Stricter threshold for better differentiation
const MIN_CONFIDENCE_PERCENTAGE = 75; // Require at least 75% match for higher accuracy
const REQUIRED_CONSECUTIVE_MATCHES = 4; // Need 4 consecutive matches to confirm identity

const TakeAttendance = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectionRafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const markedStudents = useRef<Set<string>>(new Set());
  const lastProcessTime = useRef<number>(0);
  const pendingMatches = useRef<Map<string, { count: number; sumConfidence: number; name: string }>>(new Map());
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [faceCount, setFaceCount] = useState<number>(0);
  const [profilesLoaded, setProfilesLoaded] = useState<number>(0);
  const [studentDescriptors, setStudentDescriptors] = useState<StudentDescriptors[]>([]);
  const [studentConfidenceScores, setStudentConfidenceScores] = useState<Map<string, number>>(new Map());
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  
  const { toast } = useToast();

  // Fetch classes on mount and cleanup
  useEffect(() => {
    fetchClasses();
    loadModels();
    return () => {
      stopCamera();
    };
  }, []);

  // Fetch students when class changes
  useEffect(() => {
    if (selectedClass) {
      fetchStudents();
      markedStudents.current.clear();
      pendingMatches.current.clear();
      setStudentConfidenceScores(new Map());
    }
  }, [selectedClass]);

  const loadModels = async () => {
    try {
      setModelStatus('loading');
      await loadFaceApiModels();
      setModelStatus('ready');
      toast({
        title: "Face-api.js ready",
        description: "Face recognition models loaded successfully",
      });
    } catch (error) {
      console.error('Failed to load face-api.js models:', error);
      setModelStatus('error');
      toast({
        title: "Model loading failed",
        description: "Could not load face recognition models",
        variant: "destructive",
      });
    }
  };

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
      const { data: studentsData, error: studentsError} = await supabase
        .from('students')
        .select('*')
        .eq('class_id', selectedClass);
      
      if (studentsError) throw studentsError;
      
      console.log(`Found ${studentsData?.length || 0} students`);
      setStudents(studentsData || []);
      
      // Fetch face embeddings for these students
      const studentIds = studentsData?.map(s => s.id) || [];
      if (studentIds.length === 0) {
        setStudentDescriptors([]);
        setProfilesLoaded(0);
        return;
      }
      
      const { data: embeddingsData, error: embeddingsError } = await supabase
        .from('face_embeddings')
        .select('*')
        .in('student_id', studentIds);
      
      if (embeddingsError) throw embeddingsError;
      
      console.log(`Loaded ${embeddingsData?.length || 0} face embeddings`);
      
      // Group descriptors by student
      const descriptorsByStudent = (embeddingsData || []).reduce((acc, emb) => {
        if (!acc[emb.student_id]) {
          acc[emb.student_id] = [];
        }
        // Convert embedding_data (array) to Float32Array
        const embeddingData = emb.embedding_data as any;
        const embeddingArray = embeddingData?.embedding || embeddingData;
        if (Array.isArray(embeddingArray)) {
          acc[emb.student_id].push(new Float32Array(embeddingArray));
        }
        return acc;
      }, {} as Record<string, Float32Array[]>);
      
      // Create student descriptors array
      const studentDescriptorsArray = studentsData?.map(student => ({
        studentId: student.id,
        studentName: student.name,
        descriptors: descriptorsByStudent[student.id] || [],
      })).filter(s => s.descriptors.length > 0) || [];
      
      setStudentDescriptors(studentDescriptorsArray);
      setProfilesLoaded(studentDescriptorsArray.length);
      
      if (studentDescriptorsArray.length > 0) {
        toast({
          title: "Profiles loaded",
          description: `${studentDescriptorsArray.length} face profiles ready`,
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
        
        toast({
          title: "Camera started",
          description: "Face recognition active",
        });
        
        startFaceDetection();
      }
    } catch (error) {
      console.error('Camera error:', error);
      toast({
        title: "Camera Error",
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
    setFaceCount(0);
  };

  const startFaceDetection = async () => {
    if (modelStatus !== 'ready') {
      toast({
        title: "Models not ready",
        description: "Please wait for models to load",
        variant: "destructive",
      });
      return;
    }

    // Start detection loop
    const detectLoop = async () => {
      const video = videoRef.current;
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        detectionRafRef.current = requestAnimationFrame(detectLoop);
        return;
      }

      try {
        const now = performance.now();
        
        // Throttle processing to every 500ms
        if (now - lastProcessTime.current < 500) {
          detectionRafRef.current = requestAnimationFrame(detectLoop);
          return;
        }
        lastProcessTime.current = now;

        // Detect faces with descriptors
        const detections = await detectFacesWithDescriptors(video);
        setFaceCount(detections.length);
        
        // Clear pending matches for students not currently detected
        const currentDetectedIds = new Set<string>();
        
        // Process each detected face
        for (const detection of detections) {
          if (detection.descriptor && studentDescriptors.length > 0) {
            const match = findBestMatchFromDescriptor(
              detection.descriptor,
              studentDescriptors,
              SIMILARITY_THRESHOLD
            );
            
            if (match && match.confidence >= MIN_CONFIDENCE_PERCENTAGE && !markedStudents.current.has(match.studentId)) {
              currentDetectedIds.add(match.studentId);
              
              // Get or initialize pending match data
              const pending = pendingMatches.current.get(match.studentId) || { count: 0, sumConfidence: 0, name: match.studentName };
              
              // Increment count and accumulate confidence
              pending.count += 1;
              pending.sumConfidence += match.confidence;
              pending.name = match.studentName;
              
              pendingMatches.current.set(match.studentId, pending);
              
              const avgConfidence = pending.sumConfidence / pending.count;
              
              // Update per-student confidence display
              setStudentConfidenceScores((prev) => {
                const m = new Map(prev);
                m.set(match.studentId, avgConfidence);
                return m;
              });
              
              console.log(`Pending match: ${match.studentName} - ${pending.count}/${REQUIRED_CONSECUTIVE_MATCHES} (${avgConfidence.toFixed(1)}%)`);
              
              // If we have enough consecutive matches and strong average confidence, mark attendance
              if (pending.count >= REQUIRED_CONSECUTIVE_MATCHES && avgConfidence >= MIN_CONFIDENCE_PERCENTAGE) {
                console.log(`✓ Confirmed match: ${match.studentName} (${avgConfidence.toFixed(1)}%)`);
                await markAttendance(match.studentId, match.studentName, avgConfidence);
                pendingMatches.current.delete(match.studentId);
              }
            }
          }
        }
        
        // Clear pending matches for students not detected in this frame
        for (const [studentId] of pendingMatches.current) {
          if (!currentDetectedIds.has(studentId)) {
            pendingMatches.current.delete(studentId);
          }
        }
      } catch (err) {
        console.error('Detection error:', err);
      }

      detectionRafRef.current = requestAnimationFrame(detectLoop);
    };
    detectLoop();
  };

  const markAttendance = async (studentId: string, studentName: string, confidence: number) => {
    if (markedStudents.current.has(studentId)) return;
    
    try {
      markedStudents.current.add(studentId);
      
      // Update confidence score
      setStudentConfidenceScores(prev => {
        const newMap = new Map(prev);
        newMap.set(studentId, confidence);
        return newMap;
      });
      
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
        description: `${studentName} - ${confidence.toFixed(1)}% confidence`,
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
                  <span className="text-muted-foreground">Model: </span>
                  <span className={`font-semibold ${
                    modelStatus === 'ready' ? 'text-green-600' :
                    modelStatus === 'loading' ? 'text-blue-600' :
                    'text-red-600'
                  }`}>
                    {modelStatus === 'ready' ? 'Face-api.js Ready' :
                     modelStatus === 'loading' ? 'Loading...' :
                     'Error'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Faces: </span>
                  <span className="font-semibold">{faceCount}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Profiles: </span>
                  <span className="font-semibold">{profilesLoaded}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Min Confidence: </span>
                  <span className="font-semibold text-primary">{MIN_CONFIDENCE_PERCENTAGE}%</span>
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
              <Label className="text-sm font-medium">Select Class</Label>
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
                disabled={!selectedClass || isStreaming || loadingStudents || modelStatus !== 'ready'}
                className="flex items-center gap-2"
              >
                {loadingStudents ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading Students...
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
                {students.map((student) => {
                  const isPresent = markedStudents.current.has(student.id);
                  const confidence = studentConfidenceScores.get(student.id);
                  return (
                    <div
                      key={student.id}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-lg border-2 transition-all",
                        isPresent 
                          ? "bg-success/10 border-success/30" 
                          : "bg-destructive/10 border-destructive/30"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {/* Status Icon */}
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center",
                          isPresent ? "bg-status-present" : "bg-status-absent"
                        )}>
                          {isPresent ? (
                            <CheckCircle2 className="h-6 w-6 text-success-foreground" />
                          ) : (
                            <XCircle className="h-6 w-6 text-foreground" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-base text-foreground">{student.name}</p>
                          <p className="text-sm text-muted-foreground">{student.student_id}</p>
                          {isPresent && confidence !== undefined && (
                            <p className="text-sm text-success font-bold mt-1">
                              Match: {confidence.toFixed(1)}%
                            </p>
                          )}
                        </div>
                      </div>
                      <div>
                        {isPresent ? (
                          <Badge className="bg-status-present text-success-foreground hover:bg-success font-semibold px-4 py-1">
                            Present
                          </Badge>
                        ) : (
                          <Badge className="bg-status-absent text-foreground hover:bg-destructive font-semibold px-4 py-1">
                            Absent
                          </Badge>
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
    </Layout>
  );
};

export default TakeAttendance;
