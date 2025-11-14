import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, Menu } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

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
        
        {/* Sidebar */}
        <AppSidebar />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col relative z-10">
          {/* Top Bar */}
          <header className="h-16 border-b border-border/50 bg-card/80 backdrop-blur-xl flex items-center justify-between px-4 md:px-6">
            <SidebarTrigger className="lg:hidden">
              <Menu className="w-6 h-6" />
            </SidebarTrigger>
            
            <div className="hidden lg:block">
              <SidebarTrigger />
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
