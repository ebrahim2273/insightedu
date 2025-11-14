import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Users as UsersIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const ClassManagement = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<any>(null);
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
    const { data } = await supabase
      .from('classes')
      .select(`
        *,
        students:students(count)
      `)
      .order('name');
    
    setClasses(data || []);
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
    if (confirm("Are you sure you want to delete this class?")) {
      const { error } = await supabase
        .from('classes')
        .delete()
        .eq('id', id);

      if (!error) {
        toast({ title: "Success", description: "Class deleted successfully" });
        fetchClasses();
      }
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
      </div>
    </Layout>
  );
};

export default ClassManagement;
