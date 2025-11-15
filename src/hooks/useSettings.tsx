import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

interface Settings {
  notifications: boolean;
  emailAlerts: boolean;
  autoMarkAttendance: boolean;
  confidenceThreshold: number;
  detectionMethod: string;
  photosPerStudent: number;
}

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
  loading: boolean;
}

const defaultSettings: Settings = {
  notifications: true,
  emailAlerts: false,
  autoMarkAttendance: true,
  confidenceThreshold: 0.5,
  detectionMethod: 'faceapi',
  photosPerStudent: 20,
};

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  updateSettings: async () => {},
  loading: true,
});

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setSettings({
          notifications: data.notifications,
          emailAlerts: data.email_alerts,
          autoMarkAttendance: data.auto_mark_attendance,
          confidenceThreshold: Number(data.confidence_threshold),
          detectionMethod: data.detection_method,
          photosPerStudent: data.photos_per_student,
        });
      } else {
        // Create default settings if none exist
        const { error: insertError } = await supabase
          .from('user_settings')
          .insert({
            user_id: user?.id,
            ...defaultSettings,
            email_alerts: defaultSettings.emailAlerts,
            auto_mark_attendance: defaultSettings.autoMarkAttendance,
            confidence_threshold: defaultSettings.confidenceThreshold,
            detection_method: defaultSettings.detectionMethod,
            photos_per_student: defaultSettings.photosPerStudent,
          });

        if (!insertError) {
          setSettings(defaultSettings);
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (newSettings: Partial<Settings>) => {
    try {
      const updatedSettings = { ...settings, ...newSettings };
      
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user?.id,
          notifications: updatedSettings.notifications,
          email_alerts: updatedSettings.emailAlerts,
          auto_mark_attendance: updatedSettings.autoMarkAttendance,
          confidence_threshold: updatedSettings.confidenceThreshold,
          detection_method: updatedSettings.detectionMethod,
          photos_per_student: updatedSettings.photosPerStudent,
        });

      if (error) throw error;

      setSettings(updatedSettings);
    } catch (error) {
      console.error('Error updating settings:', error);
      throw error;
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};
