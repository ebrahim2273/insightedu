import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  gradient?: boolean;
}

const StatCard = ({ title, value, icon: Icon, gradient = true }: StatCardProps) => {
  return (
    <Card className={cn(
      "card-glow relative overflow-hidden hover:scale-105 transition-all duration-300 hover:shadow-2xl cursor-pointer border-2 border-primary/20 bg-card/50 backdrop-blur-sm",
      gradient && "before:absolute before:inset-0 before:bg-gradient-to-br before:from-primary/10 before:to-accent/10 before:opacity-50"
    )}>
      <CardContent className="p-6 relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className={cn(
            "p-3 rounded-lg transition-all duration-300",
            "bg-primary/10 hover:bg-primary/20 hover:shadow-lg hover:shadow-primary/20 animate-pulse-glow"
          )}>
            <Icon className="w-6 h-6 text-primary drop-shadow-[0_0_8px_rgba(71,209,199,0.5)]" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-4xl font-bold text-primary transition-all duration-300 hover:scale-110 neon-text">{value}</p>
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default StatCard;
