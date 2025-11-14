import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import StatCard from "@/components/StatCard";
import { Users, CheckCircle, XCircle, TrendingUp, BarChart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const Analytics = () => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClass, setSelectedClass] = useState("all");
  const [period, setPeriod] = useState("daily");
  const [classes, setClasses] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalStudents: 0,
    presentToday: 0,
    absentToday: 0,
    attendanceRate: 0,
  });

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [date, selectedClass, period]);

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('*')
      .order('name');
    setClasses(data || []);
  };

  const fetchAnalytics = async () => {
    // Fetch students count
    let studentsQuery = supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    if (selectedClass !== 'all') {
      studentsQuery = studentsQuery.eq('class_id', selectedClass);
    }

    const { count: studentsCount } = await studentsQuery;

    // Fetch attendance for selected date
    let attendanceQuery = supabase
      .from('attendance')
      .select('status')
      .gte('marked_at', `${date}T00:00:00`)
      .lte('marked_at', `${date}T23:59:59`);

    if (selectedClass !== 'all') {
      attendanceQuery = attendanceQuery.eq('class_id', selectedClass);
    }

    const { data: attendance } = await attendanceQuery;

    const presentCount = attendance?.filter(a => a.status === 'present').length || 0;
    const absentCount = attendance?.filter(a => a.status === 'absent').length || 0;
    const rate = studentsCount ? Math.round((presentCount / studentsCount) * 100) : 0;

    setStats({
      totalStudents: studentsCount || 0,
      presentToday: presentCount,
      absentToday: absentCount,
      attendanceRate: rate,
    });
  };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="bg-card rounded-lg p-8 border border-border/50 relative overflow-hidden animate-fade-in-up hover:shadow-xl transition-shadow duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 opacity-50" />
          <div className="relative flex items-center gap-3">
            <BarChart className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Attendance Analytics</h1>
              <p className="text-muted-foreground">Analyze attendance patterns and generate insights</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="border-border/50 animate-scale-in hover:shadow-lg transition-shadow duration-300">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Date</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Class</label>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {classes.map(cls => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Period</label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="mt-4 hover:scale-105 transition-transform duration-200">Update</Button>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="animate-scale-in" style={{ animationDelay: "0.1s" }}>
            <StatCard
              title="Total Students"
              value={stats.totalStudents}
              icon={Users}
            />
          </div>
          <div className="animate-scale-in" style={{ animationDelay: "0.2s" }}>
            <StatCard
              title="Present Today"
              value={stats.presentToday}
              icon={CheckCircle}
            />
          </div>
          <div className="animate-scale-in" style={{ animationDelay: "0.3s" }}>
            <StatCard
              title="Absent Today"
              value={stats.absentToday}
              icon={XCircle}
            />
          </div>
          <div className="animate-scale-in" style={{ animationDelay: "0.4s" }}>
            <StatCard
              title="Attendance Rate"
              value={`${stats.attendanceRate}%`}
              icon={TrendingUp}
            />
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1 border-border/50">
            <CardHeader>
              <CardTitle>Daily Attendance Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center border border-border rounded-lg">
                <p className="text-muted-foreground">Chart visualization</p>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-1 border-border/50">
            <CardHeader>
              <CardTitle>Hourly Attendance Pattern</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center border border-border rounded-lg">
                <p className="text-muted-foreground">Chart visualization</p>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-1 border-border/50">
            <CardHeader>
              <CardTitle>Class-wise Attendance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center border border-border rounded-lg">
                <p className="text-muted-foreground">Chart visualization</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Analytics;
