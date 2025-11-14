import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AttendanceRow {
  id: string;
  marked_at: string | null;
  status: string;
  student_id: string;
  class_id: string;
}

const AttendanceHistory = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [rows, setRows] = useState<AttendanceRow[]>([]);

  const [classId, setClassId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const { toast } = useToast();

  useEffect(() => {
    document.title = "Attendance History | InSight";
    fetchFilters();
    fetchData();
  }, []);

  useEffect(() => {
    fetchData();
  }, [classId, studentId, startDate, endDate]);

  const fetchFilters = async () => {
    const [{ data: classData }, { data: studentData }] = await Promise.all([
      supabase.from('classes').select('*').order('name'),
      supabase.from('students').select('*').eq('status', 'active').order('name')
    ]);
    setClasses(classData || []);
    setStudents(studentData || []);
  };

  const fetchData = async () => {
    let query = supabase.from('attendance').select('*').order('marked_at', { ascending: false });
    if (classId) query = query.eq('class_id', classId);
    if (studentId) query = query.eq('student_id', studentId);
    if (startDate) query = query.gte('marked_at', new Date(startDate).toISOString());
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query = query.lte('marked_at', end.toISOString());
    }
    const { data, error } = await query;
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setRows([]);
    } else {
      setRows((data || []) as any);
    }
  };

  const rowsView = useMemo(() => {
    const studentMap = new Map(students.map((s: any) => [s.id, s]));
    const classMap = new Map(classes.map((c: any) => [c.id, c]));
    return rows.map(r => ({
      ...r,
      studentName: studentMap.get(r.student_id)?.name || 'Unknown',
      studentCode: studentMap.get(r.student_id)?.student_id || '',
      className: classMap.get(r.class_id)?.name || 'Unknown'
    }));
  }, [rows, students, classes]);

  const exportCSV = () => {
    const headers = ['Date', 'Class', 'Student', 'Student ID', 'Status'];
    const csv = [headers.join(',')]
      .concat(rowsView.map(r => [
        r.marked_at ? new Date(r.marked_at).toLocaleString() : '',
        r.className,
        r.studentName,
        r.studentCode,
        r.status
      ].map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`).join(',')))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'attendance-history.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Attendance History</h1>
            <p className="text-muted-foreground">Filter by date, class, and student. Export as CSV.</p>
          </div>
          <Button onClick={exportCSV} className="hover:scale-105 transition-transform">Export CSV</Button>
        </div>

        <Card className="border-border/50">
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Class</label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="All classes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  {classes.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Student</label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="All students" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  {students.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Start date</label>
              <Input type="date" className="mt-1" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">End date</label>
              <Input type="date" className="mt-1" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 animate-scale-in">
          <CardHeader>
            <CardTitle>Results ({rowsView.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Student ID</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowsView.map((r: any) => (
                    <TableRow key={r.id} className="hover:bg-muted/50">
                      <TableCell>{r.marked_at ? new Date(r.marked_at).toLocaleString() : ''}</TableCell>
                      <TableCell>{r.className}</TableCell>
                      <TableCell>{r.studentName}</TableCell>
                      <TableCell>{r.studentCode}</TableCell>
                      <TableCell className={r.status === 'present' ? 'text-success' : r.status === 'late' ? 'text-accent' : 'text-destructive'}>
                        {r.status}
                      </TableCell>
                    </TableRow>
                  ))}
                  {rowsView.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No attendance found for selected filters.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default AttendanceHistory;
