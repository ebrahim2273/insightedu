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
          <header className="h-20 border-b-2 border-border bg-card/95 backdrop-blur-xl flex items-center justify-between px-6 md:px-8 shadow-sm">
            {/* Mobile: Sidebar Trigger */}
            <SidebarTrigger className="lg:hidden p-2 hover:bg-secondary rounded-lg transition-all duration-200 hover:scale-105">
              <Menu className="w-6 h-6" />
            </SidebarTrigger>
            
            {/* Desktop: Logo & Navigation */}
            <div className="hidden lg:flex items-center gap-12 flex-1">
              <Link 
                to="/dashboard" 
                className="flex items-center gap-3 group px-4 py-2 rounded-lg hover:bg-secondary/50 transition-all duration-200"
              >
                <Eye className="w-7 h-7 text-primary group-hover:scale-110 transition-transform duration-200" />
                <span className="text-2xl font-bold neon-text">InSight</span>
              </Link>
              
              <div className="h-10 w-px bg-border" />
              
              <nav className="flex items-center gap-3">
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

            <div className="h-10 w-px bg-border hidden lg:block mx-4" />

            <Button
              onClick={signOut}
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 transition-all duration-200 hover:scale-105"
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
