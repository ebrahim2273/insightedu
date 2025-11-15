import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import StatCard from "@/components/StatCard";
import { Users, CheckCircle, XCircle, TrendingUp, BarChart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, BarChart as ReBarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

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
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [classPerformance, setClassPerformance] = useState<any[]>([]);
  const [dailyPattern, setDailyPattern] = useState<any[]>([]);

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
    const absentCount = (studentsCount || 0) - presentCount;
    const rate = studentsCount ? Math.round((presentCount / studentsCount) * 100) : 0;

    setStats({
      totalStudents: studentsCount || 0,
      presentToday: presentCount,
      absentToday: absentCount,
      attendanceRate: rate,
    });

    // Fetch weekly data (last 7 days)
    await fetchWeeklyData();
    // Fetch monthly data (last 6 months)
    await fetchMonthlyData();
    // Fetch class performance
    await fetchClassPerformance();
    // Fetch daily pattern
    await fetchDailyPattern();
  };

  const fetchWeeklyData = async () => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const today = new Date();
    const weekData = [];

    for (let i = 4; i >= 0; i--) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - i);
      const dateStr = targetDate.toISOString().split('T')[0];

      let query = supabase
        .from('attendance')
        .select('status')
        .gte('marked_at', `${dateStr}T00:00:00`)
        .lte('marked_at', `${dateStr}T23:59:59`);

      if (selectedClass !== 'all') {
        query = query.eq('class_id', selectedClass);
      }

      const { data } = await query;
      const present = data?.filter(a => a.status === 'present').length || 0;
      const absent = data?.filter(a => a.status === 'absent').length || 0;

      weekData.push({
        day: days[4 - i] || 'Day',
        present,
        absent,
      });
    }
    setWeeklyData(weekData);
  };

  const fetchMonthlyData = async () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const monthData = [];

    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() - i);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1;

      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0);
      const endDateStr = `${year}-${String(month).padStart(2, '0')}-${endDate.getDate()}`;

      let attendanceQuery = supabase
        .from('attendance')
        .select('status')
        .gte('marked_at', `${startDate}T00:00:00`)
        .lte('marked_at', `${endDateStr}T23:59:59`);

      let studentsQuery = supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      if (selectedClass !== 'all') {
        attendanceQuery = attendanceQuery.eq('class_id', selectedClass);
        studentsQuery = studentsQuery.eq('class_id', selectedClass);
      }

      const { data: attendance } = await attendanceQuery;
      const { count: studentsCount } = await studentsQuery;

      const present = attendance?.filter(a => a.status === 'present').length || 0;
      const daysInMonth = Math.max(1, attendance?.length || 1);
      const rate = studentsCount ? Math.round((present / (studentsCount * daysInMonth)) * 100) : 0;

      monthData.push({
        month: months[5 - i],
        rate: Math.min(100, rate),
      });
    }
    setMonthlyData(monthData);
  };

  const fetchClassPerformance = async () => {
    const { data: classesData } = await supabase
      .from('classes')
      .select('*')
      .order('name')
      .limit(5);

    if (!classesData) {
      setClassPerformance([]);
      return;
    }

    const performance = await Promise.all(
      classesData.map(async (cls) => {
        const { count: studentsCount } = await supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('class_id', cls.id)
          .eq('status', 'active');

        const { data: attendance } = await supabase
          .from('attendance')
          .select('status')
          .eq('class_id', cls.id)
          .gte('marked_at', `${date}T00:00:00`)
          .lte('marked_at', `${date}T23:59:59`);

        const present = attendance?.filter(a => a.status === 'present').length || 0;
        const rate = studentsCount ? Math.round((present / studentsCount) * 100) : 0;

        return {
          class: cls.name.substring(0, 10),
          rate,
        };
      })
    );

    setClassPerformance(performance.sort((a, b) => b.rate - a.rate));
  };

  const fetchDailyPattern = async () => {
    const hours = ['8AM', '9AM', '10AM', '11AM', '12PM', '1PM', '2PM'];
    const pattern = [];

    for (let hour = 8; hour <= 14; hour++) {
      let query = supabase
        .from('attendance')
        .select('*')
        .gte('marked_at', `${date}T${String(hour).padStart(2, '0')}:00:00`)
        .lt('marked_at', `${date}T${String(hour + 1).padStart(2, '0')}:00:00`);

      if (selectedClass !== 'all') {
        query = query.eq('class_id', selectedClass);
      }

      const { data } = await query;
      pattern.push({
        time: hours[hour - 8],
        attendance: data?.length || 0,
      });
    }
    setDailyPattern(pattern);
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Weekly Attendance Comparison */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle>Weekly Attendance Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <ReBarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                  <Legend />
                  <Bar dataKey="present" fill="hsl(var(--success))" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="absent" fill="hsl(var(--destructive))" radius={[8, 8, 0, 0]} />
                </ReBarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Attendance Distribution */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle>Attendance Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Present', value: stats.presentToday },
                      { name: 'Absent', value: stats.absentToday },
                    ]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    <Cell fill="hsl(var(--success))" />
                    <Cell fill="hsl(var(--destructive))" />
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Monthly Trends */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle>Monthly Attendance Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="rate" 
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary) / 0.2)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Class Performance */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle>Top Performing Classes</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <ReBarChart 
                  data={classPerformance}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                  <YAxis dataKey="class" type="category" stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                  <Bar dataKey="rate" fill="hsl(var(--accent))" radius={[0, 8, 8, 0]} />
                </ReBarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Daily Pattern */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle>Daily Attendance Pattern</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyPattern}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="attendance" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--primary))', r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Student Status Distribution */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle>Student Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Active', value: stats.totalStudents },
                      { name: 'Inactive', value: 0 },
                      { name: 'Graduated', value: 0 },
                    ]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => value > 0 ? `${name}: ${value}` : null}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    <Cell fill="hsl(var(--success))" />
                    <Cell fill="hsl(var(--muted-foreground))" />
                    <Cell fill="hsl(var(--accent))" />
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Analytics;
