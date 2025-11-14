import { ReactNode } from "react";
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
  Radar
} from "lucide-react";
import { useAuth } from "@/lib/auth";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const { signOut } = useAuth();
  
  const navItems = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard },
    { name: "Take Attendance", path: "/attendance", icon: Camera },
    { name: "Analytics", path: "/analytics", icon: BarChart3 },
    { name: "Class Management", path: "/classes", icon: Users },
    { name: "Add Student", path: "/add-student", icon: UserPlus },
    { name: "Settings", path: "/settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Bar */}
      <nav className="bg-card border-b border-border">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 text-xl font-bold text-primary">
              <Radar className="w-6 h-6" />
              <span>InSight</span>
            </Link>

            {/* Navigation Links */}
            <div className="flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 hover:scale-105",
                      isActive
                        ? "bg-primary/10 text-primary shadow-md"
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
                className="ml-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
};

export default Layout;
