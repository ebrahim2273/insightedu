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
      "relative overflow-hidden hover:scale-105 transition-all duration-300 hover:shadow-xl cursor-pointer",
      gradient && "before:absolute before:inset-0 before:bg-gradient-to-br before:from-primary/20 before:to-accent/20 before:opacity-50"
    )}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={cn(
            "p-3 rounded-lg transition-all duration-300",
            "bg-primary/10 hover:bg-primary/20"
          )}>
            <Icon className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-3xl font-bold text-primary transition-all duration-300 hover:scale-110">{value}</p>
          <p className="text-sm text-muted-foreground uppercase tracking-wide">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default StatCard;
