import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/useSettings";
import { useState, useEffect } from "react";

const Settings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings: globalSettings, updateSettings, loading } = useSettings();
  const [localSettings, setLocalSettings] = useState(globalSettings);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalSettings(globalSettings);
  }, [globalSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings(localSettings);
      toast({
        title: "Settings Saved",
        description: "Your preferences have been updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-3xl animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage your account and application preferences</p>
        </div>

        {/* Profile */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Manage your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user?.email || ""} disabled />
            </div>
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" placeholder="Enter your name" />
            </div>
            <Button>Update Profile</Button>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Configure how you receive alerts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Push Notifications</Label>
                <p className="text-sm text-muted-foreground">Receive in-app notifications</p>
              </div>
              <Switch
                checked={localSettings.notifications}
                onCheckedChange={(checked) => setLocalSettings({ ...localSettings, notifications: checked })}
                disabled={loading}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Email Alerts</Label>
                <p className="text-sm text-muted-foreground">Get attendance summaries via email</p>
              </div>
              <Switch
                checked={localSettings.emailAlerts}
                onCheckedChange={(checked) => setLocalSettings({ ...localSettings, emailAlerts: checked })}
                disabled={loading}
              />
            </div>
          </CardContent>
        </Card>

        {/* Attendance Settings */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>Attendance</CardTitle>
            <CardDescription>Configure face recognition behavior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-mark Attendance</Label>
                <p className="text-sm text-muted-foreground">Automatically mark when face is recognized</p>
              </div>
              <Switch
                checked={localSettings.autoMarkAttendance}
                onCheckedChange={(checked) => setLocalSettings({ ...localSettings, autoMarkAttendance: checked })}
                disabled={loading}
              />
            </div>
            <div>
              <Label htmlFor="confidence">Recognition Confidence Threshold</Label>
              <Input
                id="confidence"
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={localSettings.confidenceThreshold}
                onChange={(e) => setLocalSettings({ ...localSettings, confidenceThreshold: parseFloat(e.target.value) })}
                disabled={loading}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Current: {(localSettings.confidenceThreshold * 100).toFixed(0)}% - Lower values are more strict, higher values are more lenient
              </p>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} className="w-full" disabled={loading || isSaving}>
          {isSaving ? "Saving..." : "Save All Settings"}
        </Button>
      </div>
    </Layout>
  );
};

export default Settings;
