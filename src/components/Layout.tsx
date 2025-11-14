import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, Menu, Eye, LayoutDashboard, Camera, BarChart3, Users, History, UserPlus, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Link } from "react-router-dom";
import { NavLink } from "@/components/NavLink";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const { signOut } = useAuth();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background relative overflow-hidden">
        {/* Animated Grid Background */}
        <div className="animated-grid-bg" aria-hidden="true" />
        
        {/* Sidebar - Mobile Only */}
        <div className="lg:hidden">
          <AppSidebar />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col relative z-10">
          {/* Top Bar */}
          <header className="h-16 border-b border-border/50 bg-card/80 backdrop-blur-xl flex items-center justify-between px-4 md:px-6">
            {/* Mobile: Sidebar Trigger */}
            <SidebarTrigger className="lg:hidden">
              <Menu className="w-6 h-6" />
            </SidebarTrigger>
            
            {/* Desktop: Logo & Navigation */}
            <div className="hidden lg:flex items-center gap-8 flex-1">
              <Link to="/dashboard" className="flex items-center gap-2 group">
                <Eye className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
                <span className="text-xl font-bold neon-text">InSight</span>
              </Link>
              
              <nav className="flex items-center gap-1">
                <NavLink to="/dashboard">
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Dashboard
                </NavLink>
                <NavLink to="/attendance">
                  <Camera className="w-4 h-4 mr-2" />
                  Take Attendance
                </NavLink>
                <NavLink to="/analytics">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Analytics
                </NavLink>
                <NavLink to="/classes">
                  <Users className="w-4 h-4 mr-2" />
                  Classes
                </NavLink>
                <NavLink to="/history">
                  <History className="w-4 h-4 mr-2" />
                  History
                </NavLink>
                <NavLink to="/add-student">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Student
                </NavLink>
                <NavLink to="/settings">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </NavLink>
              </nav>
            </div>

            <Button
              onClick={signOut}
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <LogOut className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </header>

          {/* Page Content */}
          <main className="flex-1 container mx-auto px-4 md:px-6 py-8">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Layout;
