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
      <div className="space-y-8">
        {/* Welcome Section */}
        <div className="card-glow bg-card/80 backdrop-blur-sm rounded-lg p-8 border-2 border-primary/20 relative overflow-hidden animate-fade-in-up hover:scale-[1.01] transition-transform duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/10 to-transparent opacity-60" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl animate-pulse-glow" />
          <div className="relative z-10">
            <h1 className="text-4xl font-bold neon-text mb-3 float-animation">Welcome to InSight Dashboard</h1>
            <p className="text-muted-foreground text-lg">AI-Powered Face Recognition Attendance System</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="animate-bounce-in" style={{ animationDelay: "0.1s" }}>
            <StatCard title="Total Students" value={stats.totalStudents} icon={Users} />
          </div>
          <div className="animate-bounce-in" style={{ animationDelay: "0.2s" }}>
            <StatCard title="Active Classes" value={stats.activeClasses} icon={BookOpen} />
          </div>
          <div className="animate-bounce-in" style={{ animationDelay: "0.3s" }}>
            <StatCard title="Today's Records" value={stats.todayAttendance} icon={UserCheck} />
          </div>
          <div className="animate-bounce-in" style={{ animationDelay: "0.4s" }}>
            <StatCard title="Attendance Rate" value={`${stats.attendanceRate}%`} icon={TrendingUp} />
          </div>
        </div>

        {/* Wavy Separator */}
        <div className="wavy-line my-8" />

        {/* Status Overview */}
        <Card className="card-glow border-2 border-primary/20 overflow-hidden animate-slide-up bg-card/50 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 bg-[length:200%_100%] animate-shimmer">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Camera className="w-5 h-5 animate-pulse-glow" />
              <span className="neon-text">Today's Attendance Status</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Present Card */}
              <div className="bg-success/10 rounded-lg p-6 border-2 border-success/30 hover:border-success/50 transition-all hover:scale-105 card-glow animate-fade-in" style={{ animationDelay: "0.5s" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-success/80 font-medium uppercase tracking-wide">Present</p>
                    <p className="text-4xl font-bold text-success neon-text mt-2">{stats.presentToday}</p>
                  </div>
                  <UserCheck className="w-12 h-12 text-success opacity-50 float-animation" />
                </div>
              </div>

              {/* Absent Card */}
              <div className="bg-destructive/10 rounded-lg p-6 border-2 border-destructive/30 hover:border-destructive/50 transition-all hover:scale-105 card-glow animate-fade-in" style={{ animationDelay: "0.6s" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-destructive/80 font-medium uppercase tracking-wide">Absent</p>
                    <p className="text-4xl font-bold text-destructive neon-text mt-2">{stats.absentToday}</p>
                  </div>
                  <Users className="w-12 h-12 text-destructive opacity-50 float-animation" style={{ animationDelay: "0.5s" }} />
                </div>
              </div>

              {/* Late Card */}
              <div className="bg-yellow-500/10 rounded-lg p-6 border-2 border-yellow-500/30 hover:border-yellow-500/50 transition-all hover:scale-105 card-glow animate-fade-in" style={{ animationDelay: "0.7s" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-yellow-500/80 font-medium uppercase tracking-wide">Late</p>
                    <p className="text-4xl font-bold text-yellow-500 neon-text mt-2">{stats.lateToday}</p>
                  </div>
                  <TrendingUp className="w-12 h-12 text-yellow-500 opacity-50 float-animation" style={{ animationDelay: "1s" }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Dashboard;
