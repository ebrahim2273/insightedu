import { useState, useRef, useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Trash2, Check, Loader2, Upload, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { loadFaceApiModels, generateFaceDescriptor } from "@/lib/faceApiHelper";
import { useSettings } from "@/hooks/useSettings";

const AddStudent = () => {
  const { settings } = useSettings();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const frameAnimationRef = useRef<number | null>(null);
  const completionShownRef = useRef(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    studentId: "",
    classId: "",
  });
  const { toast } = useToast();

  const TARGET_PHOTOS = settings.photosPerStudent || 20;
  const MIN_PHOTOS = Math.max(5, Math.floor(TARGET_PHOTOS * 0.4));
  
  const CAPTURE_INSTRUCTIONS = [
    "Look straight ahead",
    "Turn slightly left",
    "Turn slightly right", 
    "Tilt head up slightly",
    "Tilt head down slightly",
    "Smile naturally"
  ];

  useEffect(() => {
    fetchClasses();
    preloadModel();
    return () => {
      stopCamera();
    };
  }, []);

  const preloadModel = async () => {
    try {
      setModelLoading(true);
      await loadFaceApiModels();
      setModelLoading(false);
    } catch (error) {
      console.error('Model preload failed:', error);
      setModelLoading(false);
    }
  };

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('*')
      .order('name');
    setClasses(data || []);
  };

  const drawGuideFrame = () => {
    if (!overlayCanvasRef.current || !videoRef.current || !isStreaming) return;
    const canvas = overlayCanvasRef.current;
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
    
    // Softer, animated guide
    const progress = capturedImages.length / TARGET_PHOTOS;
    const hue = progress * 120; // Green gradient as progress increases
    
    ctx.strokeStyle = `hsla(${hue}, 70%, 50%, 0.8)`;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    
    // Subtle background
    ctx.fillStyle = `hsla(${hue}, 70%, 50%, 0.05)`;
    ctx.fillRect(x, y, w, h);
    
    // Text with better visibility
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 3;
    ctx.font = '600 16px system-ui';
    const instructionIndex = Math.floor((capturedImages.length / TARGET_PHOTOS) * CAPTURE_INSTRUCTIONS.length);
    const instruction = isCapturing && instructionIndex < CAPTURE_INSTRUCTIONS.length 
      ? CAPTURE_INSTRUCTIONS[instructionIndex] 
      : 'Position face here';
    const msg = isCapturing ? `${capturedImages.length}/${TARGET_PHOTOS} - ${instruction}` : instruction;
    const textW = ctx.measureText(msg).width;
    const textX = (canvas.width - textW) / 2;
    const textY = y - 16;
    ctx.strokeText(msg, textX, textY);
    ctx.fillText(msg, textX, textY);
    
    // Request next frame
    if (isStreaming) {
      frameAnimationRef.current = requestAnimationFrame(drawGuideFrame);
    }
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
        
        // Wait for video to be ready
        videoRef.current.onloadedmetadata = () => {
          startAutoCapture();
        };
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
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    if (frameAnimationRef.current) {
      cancelAnimationFrame(frameAnimationRef.current);
      frameAnimationRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    setIsCapturing(false);
    completionShownRef.current = false;
  };

  const startAutoCapture = () => {
    setIsCapturing(true);
    setCapturedImages([]);
    completionShownRef.current = false;
    
    // Start smooth guide frame animation
    if (frameAnimationRef.current) {
      cancelAnimationFrame(frameAnimationRef.current);
    }
    frameAnimationRef.current = requestAnimationFrame(drawGuideFrame);
    
    let captureCount = 0;
    captureIntervalRef.current = setInterval(() => {
      if (captureCount >= TARGET_PHOTOS) {
        // Clear interval FIRST to prevent multiple triggers
        if (captureIntervalRef.current) {
          clearInterval(captureIntervalRef.current);
          captureIntervalRef.current = null;
        }
        setIsCapturing(false);
        
        // Show notification only once
        if (!completionShownRef.current) {
          completionShownRef.current = true;
          toast({
            title: "Capture Complete",
            description: `${TARGET_PHOTOS} photos captured successfully! You can now register the student.`,
          });
        }
        
        stopCamera();
        return;
      }

      captureImage();
      captureCount++;
    }, 700);
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
    
    setCapturedImages(prev => {
      const newImages = [...prev, imageData];
      return newImages;
    });
  };

  const removeImage = (index: number) => {
    setCapturedImages(prev => prev.filter((_, i) => i !== index));
  };

  const removeUploadedImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: string[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid File",
          description: `${file.name} is not an image`,
          variant: "destructive",
        });
        continue;
      }

      // Convert to base64
      const reader = new FileReader();
      const imageData = await new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });
      
      newImages.push(imageData);
    }

    setUploadedImages(prev => [...prev, ...newImages]);
    
    toast({
      title: "Photos Uploaded",
      description: `${newImages.length} photo(s) added successfully`,
    });

    // Reset input
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const allImages = [...capturedImages, ...uploadedImages];
    
    if (allImages.length < MIN_PHOTOS) {
      toast({
        title: "Error",
        description: `Please provide at least ${MIN_PHOTOS} photos (camera capture or upload)`,
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      toast({
        title: "Processing",
        description: "Generating face embeddings...",
      });

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
        setIsProcessing(false);
        return;
      }

      // Generate embeddings for all images (captured + uploaded)
      const allImages = [...capturedImages, ...uploadedImages];
      toast({
        title: "Processing",
        description: `Generating face descriptors from ${allImages.length} images...`,
      });

      const descriptors = [];
      for (let i = 0; i < allImages.length; i++) {
        const imageData = allImages[i];
        
        // Convert data URL to Image element
        const img = new Image();
        img.src = imageData;
        await new Promise((resolve) => { img.onload = resolve; });
        
        // Generate face descriptor
        const descriptor = await generateFaceDescriptor(img);
        if (descriptor) {
          descriptors.push(Array.from(descriptor));
        }
        
        // Update progress
        if ((i + 1) % 5 === 0) {
          toast({
            title: "Processing",
            description: `Processed ${i + 1} of ${allImages.length} images...`,
          });
        }
      }

      if (descriptors.length === 0) {
        throw new Error('No faces detected in provided images');
      }

      toast({
        title: "Processing",
        description: `Storing ${descriptors.length} face descriptors...`,
      });

      // Store descriptors in database
      for (let i = 0; i < descriptors.length; i++) {
        await supabase
          .from('face_embeddings')
          .insert([{
            student_id: student.id,
            embedding_data: { embedding: descriptors[i] },
            image_url: allImages[i],
          }]);
      }

      toast({
        title: "Success",
        description: "Student registered with face recognition data!",
      });

      // Reset form
      setFormData({ name: "", studentId: "", classId: "" });
      setCapturedImages([]);
      setUploadedImages([]);
      stopCamera();
    } catch (error: any) {
      console.error('Registration error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to register student",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
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
                    placeholder="e.g., 20xxxxxxxx"
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
                <Button 
                  type="submit" 
                  className="w-full gap-2 hover:scale-[1.02] transition-transform duration-200"
                  disabled={isProcessing || (capturedImages.length + uploadedImages.length) < MIN_PHOTOS}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Add Student
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Camera */}
          <Card className="border-border/50 animate-scale-in hover:shadow-lg transition-shadow duration-300" style={{ animationDelay: "0.1s" }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Capture Photos ({capturedImages.length} captured)
              </CardTitle>
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
                <canvas 
                  ref={overlayCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
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
                    Start Auto-Capture
                  </Button>
                ) : (
                  <Button 
                    onClick={stopCamera} 
                    variant="outline"
                    className="w-full hover:scale-[1.02] transition-transform duration-200"
                    disabled={isCapturing}
                  >
                    {isCapturing ? `Capturing... ${capturedImages.length}/${TARGET_PHOTOS}` : 'Stop Camera'}
                  </Button>
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

          {/* Upload Photos Section */}
          <Card className="border-border/50 animate-scale-in hover:shadow-lg transition-shadow duration-300" style={{ animationDelay: "0.2s" }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Photos ({uploadedImages.length} uploaded)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground space-y-2">
                <p>Upload photos from different angles and lighting conditions for better recognition accuracy.</p>
                <p className="font-medium">Tips:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Front-facing, left profile, right profile</li>
                  <li>Different lighting (bright, dim, natural)</li>
                  <li>Various expressions (neutral, smiling)</li>
                  <li>With/without glasses if applicable</li>
                </ul>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  className="flex-1"
                  id="photo-upload"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('photo-upload')?.click()}
                  className="gap-2"
                >
                  <ImageIcon className="w-4 h-4" />
                  Browse
                </Button>
              </div>

              {uploadedImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {uploadedImages.map((img, index) => (
                    <div 
                      key={index} 
                      className="relative group animate-scale-in"
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <img
                        src={img}
                        alt={`Upload ${index + 1}`}
                        className="w-full aspect-square object-cover rounded-lg border border-border transition-all duration-200 group-hover:scale-105"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                        onClick={() => removeUploadedImage(index)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                <p className="text-sm text-center">
                  <span className="font-semibold text-primary">
                    Total: {capturedImages.length + uploadedImages.length} photos
                  </span>
                  {' '} • Minimum: {MIN_PHOTOS} photos • Recommended: {TARGET_PHOTOS}+ photos
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default AddStudent;
