import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Camera, 
  BarChart3, 
  Users, 
  UserPlus, 
  Settings, 
  LogOut,
  Eye
} from "lucide-react";
import { useAuth } from "@/lib/auth";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const { signOut } = useAuth();
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    setTransitioning(true);
    const t = setTimeout(() => setTransitioning(false), 250);
    return () => clearTimeout(t);
  }, [location.pathname]);
  
  const navItems = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard },
    { name: "Take Attendance", path: "/attendance", icon: Camera },
    { name: "Analytics", path: "/analytics", icon: BarChart3 },
    { name: "Class Management", path: "/classes", icon: Users },
    { name: "Attendance History", path: "/history", icon: BarChart3 },
    { name: "Add Student", path: "/add-student", icon: UserPlus },
    { name: "Settings", path: "/settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Animated Grid Background */}
      <div className="animated-grid-bg" aria-hidden="true" />
      
      {/* Navigation Bar */}
      <nav className="bg-card/80 backdrop-blur-xl border-b border-border/50 relative z-10 animate-slide-in-left">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 text-xl font-bold text-primary group">
              <Eye className="w-6 h-6 animate-pulse-glow group-hover:animate-rotate-slow transition-all" />
              <span className="neon-text">InSight</span>
            </Link>

            {/* Navigation Links */}
            <div className="flex items-center gap-1">
              {navItems.map((item, index) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    style={{ animationDelay: `${index * 0.1}s` }}
                    className={cn(
                      "px-4 py-2 rounded-md text-sm font-medium transition-all duration-300 hover:scale-105 btn-lightsaber animate-fade-in",
                      isActive
                        ? "bg-primary/10 text-primary shadow-md shadow-primary/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    )}
                  >
                    {item.name}
                  </Link>
                );
              })}
              <Button
                onClick={signOut}
                variant="ghost"
                size="sm"
                className="ml-2 text-destructive hover:text-destructive hover:bg-destructive/10 btn-lightsaber animate-fade-in"
                style={{ animationDelay: `${navItems.length * 0.1}s` }}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Page transition overlay */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-0 bg-background/60 backdrop-blur-sm transition-opacity duration-300 z-20",
          transitioning ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8 relative z-10">
        <div key={location.pathname} className="animate-fade-in-up">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
