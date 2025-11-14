import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import StatCard from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BookOpen, UserCheck, TrendingUp, Camera } from "lucide-react";

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalStudents: 0,
    activeClasses: 0,
    todayAttendance: 0,
    attendanceRate: 0,
    presentToday: 0,
    absentToday: 0,
    lateToday: 0,
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    // Fetch total students
    const { count: studentsCount } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // Fetch active classes
    const { count: classesCount } = await supabase
      .from('classes')
      .select('*', { count: 'exact', head: true });

    // Fetch today's attendance
    const today = new Date().toISOString().split('T')[0];
    const { data: todayAttendance } = await supabase
      .from('attendance')
      .select('status')
      .gte('marked_at', `${today}T00:00:00`)
      .lte('marked_at', `${today}T23:59:59`);

    const presentCount = todayAttendance?.filter(a => a.status === 'present').length || 0;
    const absentCount = todayAttendance?.filter(a => a.status === 'absent').length || 0;
    const lateCount = todayAttendance?.filter(a => a.status === 'late').length || 0;
    const totalToday = todayAttendance?.length || 0;
    const attendanceRate = studentsCount ? Math.round((presentCount / studentsCount) * 100) : 0;

    setStats({
      totalStudents: studentsCount || 0,
      activeClasses: classesCount || 0,
      todayAttendance: totalToday,
      attendanceRate,
      presentToday: presentCount,
      absentToday: absentCount,
      lateToday: lateCount,
    });
  };

  return (
    <Layout>
      <div className="space-y-8 animate-fade-in">
        {/* Welcome Section */}
        <div className="bg-card rounded-lg p-8 border border-border/50 relative overflow-hidden animate-fade-in-up hover:shadow-xl transition-shadow duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 opacity-50" />
          <div className="relative">
            <h1 className="text-3xl font-bold text-foreground mb-2">Welcome to Your Dashboard</h1>
            <p className="text-muted-foreground">Manage your classes and track attendance efficiently</p>
          </div>
        </div>

        {/* Stats Grid */}
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
              title="Active Classes"
              value={stats.activeClasses}
              icon={BookOpen}
            />
          </div>
          <div className="animate-scale-in" style={{ animationDelay: "0.3s" }}>
            <StatCard
              title="Today's Attendance"
              value={stats.todayAttendance}
              icon={UserCheck}
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

        {/* Bottom Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live Camera Feed */}
          <Card className="lg:col-span-2 border-border/50 animate-scale-in hover:shadow-lg transition-shadow duration-300" style={{ animationDelay: "0.5s" }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="w-5 h-5" />
                Live Camera Feed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center border border-border">
                <div className="text-center">
                  <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-2 animate-pulse-glow" />
                  <p className="text-muted-foreground">Camera feed will appear here during attendance sessions</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Today's Summary */}
          <div className="space-y-4">
            <Card className="border-success/50 animate-scale-in hover:scale-105 transition-transform duration-300" style={{ animationDelay: "0.6s" }}>
              <CardContent className="p-6">
                <div className="text-center">
                  <p className="text-4xl font-bold text-success">{stats.presentToday}</p>
                  <p className="text-sm text-muted-foreground mt-2 uppercase tracking-wide">Present Today</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-destructive/50 animate-scale-in hover:scale-105 transition-transform duration-300" style={{ animationDelay: "0.7s" }}>
              <CardContent className="p-6">
                <div className="text-center">
                  <p className="text-4xl font-bold text-destructive">{stats.absentToday}</p>
                  <p className="text-sm text-muted-foreground mt-2 uppercase tracking-wide">Absent Today</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-status-late/50 animate-scale-in hover:scale-105 transition-transform duration-300" style={{ animationDelay: "0.8s" }}>
              <CardContent className="p-6">
                <div className="text-center">
                  <p className="text-4xl font-bold text-[hsl(var(--status-late))]">{stats.lateToday}</p>
                  <p className="text-sm text-muted-foreground mt-2 uppercase tracking-wide">Late Today</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Pro Tip */}
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <p className="text-sm text-foreground">
            <span className="font-semibold">Pro tip:</span> Press <kbd className="px-2 py-1 bg-muted rounded text-xs">G</kbd> for Classes, 
            <kbd className="px-2 py-1 bg-muted rounded text-xs ml-2">A</kbd> for Analytics, 
            <kbd className="px-2 py-1 bg-muted rounded text-xs ml-2">R</kbd> to Take Attendance
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
