import { 
  LayoutDashboard, 
  Camera, 
  BarChart3, 
  Users, 
  UserPlus, 
  Settings,
  History,
  Eye
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { name: "Take Attendance", path: "/attendance", icon: Camera },
  { name: "Analytics", path: "/analytics", icon: BarChart3 },
  { name: "Class Management", path: "/classes", icon: Users },
  { name: "Attendance History", path: "/history", icon: History },
  { name: "Add Student", path: "/add-student", icon: UserPlus },
  { name: "Settings", path: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const isCollapsed = state === "collapsed";

  const isActive = (path: string) => currentPath === path;

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarContent className="bg-card/80 backdrop-blur-xl">
        {/* Logo Section */}
        <div className={cn(
          "flex items-center gap-2 p-4 border-b border-border/50",
          isCollapsed ? "justify-center" : "justify-start"
        )}>
          <Link to="/dashboard" className="flex items-center gap-2 group">
            <Eye className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
            {!isCollapsed && (
              <span className="text-xl font-bold neon-text">InSight</span>
            )}
          </Link>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className={cn(isCollapsed && "sr-only")}>
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={isCollapsed ? item.name : undefined}
                    >
                      <Link
                        to={item.path}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                        )}
                      >
                        <Icon className="w-5 h-5 shrink-0" />
                        {!isCollapsed && <span>{item.name}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
