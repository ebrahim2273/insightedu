import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Users as UsersIcon, Eye, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseCSVFile } from "@/utils/csvExport";

const ClassManagement = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<any>(null);
  const [viewingStudents, setViewingStudents] = useState<any>(null);
  const [studentsDialogOpen, setStudentsDialogOpen] = useState(false);
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [bulkImportDialogOpen, setBulkImportDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    schedule: "",
    teacher: "",
    room: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    const { data, error } = await supabase
      .from('classes')
      .select(`
        *,
        students:students(count)
      `)
      .order('name', { ascending: true });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setClasses([]);
      return;
    }
    setClasses(data || []);
  };

  const fetchStudentsForClass = async (classId: string) => {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('class_id', classId)
      .order('name');

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setClassStudents(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingClass) {
      const { error } = await supabase
        .from('classes')
        .update(formData)
        .eq('id', editingClass.id);

      if (error) {
        toast({ 
          title: "Error", 
          description: error.message,
          variant: "destructive" 
        });
      } else {
        toast({ title: "Success", description: "Class updated successfully" });
        setIsDialogOpen(false);
        setEditingClass(null);
        setFormData({ name: "", description: "", schedule: "", teacher: "", room: "" });
        fetchClasses();
      }
    } else {
      const { error } = await supabase
        .from('classes')
        .insert([formData]);

      if (error) {
        toast({ 
          title: "Error", 
          description: error.message,
          variant: "destructive" 
        });
      } else {
        toast({ title: "Success", description: "Class created successfully" });
        setIsDialogOpen(false);
        setFormData({ name: "", description: "", schedule: "", teacher: "", room: "" });
        fetchClasses();
      }
    }
  };

  const handleEdit = (cls: any) => {
    setEditingClass(cls);
    setFormData({
      name: cls.name,
      description: cls.description || "",
      schedule: cls.schedule || "",
      teacher: cls.teacher || "",
      room: cls.room || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this class? Students in this class will not be deleted.")) {
      const { error } = await supabase
        .from('classes')
        .delete()
        .eq('id', id);

      if (!error) {
        toast({ title: "Success", description: "Class deleted successfully" });
        fetchClasses();
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    }
  };

  const handleViewStudents = async (cls: any) => {
    setViewingStudents(cls);
    await fetchStudentsForClass(cls.id);
    setStudentsDialogOpen(true);
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (confirm("Remove this student from the class? Their data will remain but they will be unassigned.")) {
      const { error } = await supabase
        .from('students')
        .update({ class_id: null })
        .eq('id', studentId);

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Student removed from class" });
        if (viewingStudents) {
          await fetchStudentsForClass(viewingStudents.id);
        }
        fetchClasses();
      }
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (confirm("Permanently delete this student and all their data? This cannot be undone!")) {
      const { error } = await supabase
        .from('students')
        .delete()
        .eq('id', studentId);

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Student deleted permanently" });
        if (viewingStudents) {
          await fetchStudentsForClass(viewingStudents.id);
        }
        fetchClasses();
      }
    }
  };

  const handleBulkImport = async () => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a CSV file to import",
        variant: "destructive",
      });
      return;
    }

    if (!viewingStudents) {
      toast({
        title: "No class selected",
        description: "Please open a class first",
        variant: "destructive",
      });
      return;
    }

    try {
      const csvData = await parseCSVFile(selectedFile);
      
      // Expected CSV columns: name, student_id, email
      const studentsToInsert = csvData.map(row => ({
        name: row.name || row.Name,
        student_id: row.student_id || row['Student ID'] || row.id,
        email: row.email || row.Email,
        class_id: viewingStudents.id,
      })).filter(s => s.name); // Only include rows with names

      if (studentsToInsert.length === 0) {
        toast({
          title: "No valid data",
          description: "CSV file must contain 'name' column",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from('students')
        .insert(studentsToInsert);

      if (error) throw error;

      toast({
        title: "Import successful",
        description: `Imported ${studentsToInsert.length} students`,
      });

      setBulkImportDialogOpen(false);
      setSelectedFile(null);
      fetchStudentsForClass(viewingStudents.id);
      fetchClasses();
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to import students",
        variant: "destructive",
      });
    }
  };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in-up">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Class Management</h1>
            <p className="text-muted-foreground">Create and manage your classes</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" onClick={() => {
                setEditingClass(null);
                setFormData({ name: "", description: "", schedule: "", teacher: "", room: "" });
              }}>
                <Plus className="w-4 h-4" />
                Add Class
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingClass ? "Edit Class" : "Add New Class"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Class Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="schedule">Schedule</Label>
                  <Input
                    id="schedule"
                    value={formData.schedule}
                    onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
                    placeholder="e.g., Mon, Wed, Fri 9:00 AM"
                  />
                </div>
                <div>
                  <Label htmlFor="teacher">Teacher</Label>
                  <Input
                    id="teacher"
                    value={formData.teacher}
                    onChange={(e) => setFormData({ ...formData, teacher: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="room">Room</Label>
                  <Input
                    id="room"
                    value={formData.room}
                    onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full">
                  {editingClass ? "Update Class" : "Create Class"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Classes Table */}
        <Card className="border-border/50 animate-scale-in hover:shadow-lg transition-shadow duration-300">
          <CardHeader>
            <CardTitle>All Classes</CardTitle>
          </CardHeader>
          <CardContent>
            {classes.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground animate-fade-in">
                <UsersIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>No classes yet. Create your first class to get started!</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Students</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classes.map((cls, index) => (
                    <TableRow 
                      key={cls.id}
                      className="animate-fade-in hover:bg-muted/50 transition-colors duration-200"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <TableCell className="font-medium">{cls.name}</TableCell>
                      <TableCell>{cls.teacher || "-"}</TableCell>
                      <TableCell>{cls.schedule || "-"}</TableCell>
                      <TableCell>{cls.room || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <UsersIcon className="w-4 h-4" />
                          {cls.students?.[0]?.count || 0}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewStudents(cls)}
                            className="hover:scale-110 transition-transform duration-200"
                            title="View Students"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(cls)}
                            className="hover:scale-110 transition-transform duration-200"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(cls.id)}
                            className="hover:scale-110 transition-transform duration-200"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Students Dialog */}
        <Dialog open={studentsDialogOpen} onOpenChange={setStudentsDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>
                  Students in {viewingStudents?.name}
                </DialogTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkImportDialogOpen(true)}
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Bulk Import CSV
                </Button>
              </div>
            </DialogHeader>
            <div className="space-y-4">
              {classStudents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <UsersIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No students in this class yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Student ID</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classStudents.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell className="font-medium">{student.name}</TableCell>
                        <TableCell>{student.student_id || "-"}</TableCell>
                        <TableCell>{student.email || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={student.status === 'active' ? 'default' : 'secondary'}>
                            {student.status || 'active'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteStudent(student.id)}
                              title="Delete student permanently"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk Import Dialog */}
        <Dialog open={bulkImportDialogOpen} onOpenChange={setBulkImportDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bulk Import Students</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>CSV File</Label>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  CSV should have columns: name, student_id, email
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setBulkImportDialogOpen(false);
                    setSelectedFile(null);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleBulkImport}>
                  Import Students
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default ClassManagement;
