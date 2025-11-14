import { useState, useRef, useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Trash2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const AddStudent = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    studentId: "",
    classId: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchClasses();
    return () => {
      stopCamera();
    };
  }, []);

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('*')
      .order('name');
    setClasses(data || []);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsStreaming(true);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to access camera",
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

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    
    setCapturedImages(prev => [...prev, imageData]);
    
    toast({
      title: "Image Captured",
      description: `${capturedImages.length + 1} of 5 images captured`,
    });
  };

  const removeImage = (index: number) => {
    setCapturedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (capturedImages.length < 3) {
      toast({
        title: "Error",
        description: "Please capture at least 3 images",
        variant: "destructive",
      });
      return;
    }

    // Create student
    const { data: student, error: studentError } = await supabase
      .from('students')
      .insert([{
        name: formData.name,
        student_id: formData.studentId,
        class_id: formData.classId || null,
      }])
      .select()
      .single();

    if (studentError) {
      toast({
        title: "Error",
        description: studentError.message,
        variant: "destructive",
      });
      return;
    }

    // In a real implementation, you would:
    // 1. Process face embeddings using @huggingface/transformers
    // 2. Store embeddings in face_embeddings table
    // For now, we'll just store mock embedding data
    for (const image of capturedImages) {
      await supabase
        .from('face_embeddings')
        .insert([{
          student_id: student.id,
          embedding_data: { mock: "embedding_vector" }, // Replace with real embeddings
          image_url: image, // In production, upload to storage first
        }]);
    }

    toast({
      title: "Success",
      description: "Student added successfully with face data",
    });

    // Reset form
    setFormData({ name: "", studentId: "", classId: "" });
    setCapturedImages([]);
    stopCamera();
  };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        <div className="animate-fade-in-up">
          <h1 className="text-3xl font-bold text-foreground mb-2">Add New Student</h1>
          <p className="text-muted-foreground">Register a student with face recognition</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <Card className="border-border/50 animate-scale-in hover:shadow-lg transition-shadow duration-300">
            <CardHeader>
              <CardTitle>Student Information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="transition-all duration-200 focus:scale-[1.01]"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="studentId">Student ID</Label>
                  <Input
                    id="studentId"
                    value={formData.studentId}
                    onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                    placeholder="e.g., STU-2025-001"
                    className="transition-all duration-200 focus:scale-[1.01]"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="class">Class</Label>
                  <Select value={formData.classId} onValueChange={(value) => setFormData({ ...formData, classId: value })}>
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
                <Button type="submit" className="w-full gap-2 hover:scale-[1.02] transition-transform duration-200">
                  <Check className="w-4 h-4" />
                  Add Student
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Camera */}
          <Card className="border-border/50 animate-scale-in hover:shadow-lg transition-shadow duration-300" style={{ animationDelay: "0.1s" }}>
            <CardHeader>
              <CardTitle>Capture Face Images ({capturedImages.length}/5)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
                {!isStreaming && (
                  <div className="absolute inset-0 flex items-center justify-center animate-pulse-glow">
                    <Camera className="w-16 h-16 text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                {!isStreaming ? (
                  <Button 
                    onClick={startCamera} 
                    className="flex-1 gap-2 hover:scale-[1.02] transition-transform duration-200"
                  >
                    <Camera className="w-4 h-4" />
                    Start Camera
                  </Button>
                ) : (
                  <>
                    <Button 
                      onClick={captureImage} 
                      className="flex-1 gap-2 hover:scale-[1.02] transition-transform duration-200"
                      disabled={capturedImages.length >= 5}
                    >
                      <Camera className="w-4 h-4" />
                      Capture Image
                    </Button>
                    <Button 
                      onClick={stopCamera} 
                      variant="outline"
                      className="hover:scale-[1.02] transition-transform duration-200"
                    >
                      Stop
                    </Button>
                  </>
                )}
              </div>

              {capturedImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {capturedImages.map((img, index) => (
                    <div 
                      key={index} 
                      className="relative group animate-scale-in"
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <img
                        src={img}
                        alt={`Capture ${index + 1}`}
                        className="w-full aspect-square object-cover rounded-lg border border-border transition-all duration-200 group-hover:scale-105"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                        onClick={() => removeImage(index)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default AddStudent;
