/**
 * Authentication Module
 * 
 * This file manages user authentication state across the application using React Context.
 * It provides login, signup, logout functionality and tracks admin status.
 */

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client"; // Lovable Cloud database client
import { useNavigate } from "react-router-dom";

/**
 * AuthContextType defines the shape of authentication data available to components
 * - user: Current authenticated user object or null if not logged in
 * - session: Active session with JWT tokens
 * - isAdmin: Boolean flag indicating if user has admin role
 * - signUp/signIn/signOut: Authentication action functions
 */
interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

// Create React Context for authentication state - accessible to all child components
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * AuthProvider Component
 * 
 * Wraps the application and provides authentication state to all components.
 * Automatically listens for auth changes (login, logout, token refresh).
 */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // State management for authentication data
  const [user, setUser] = useState<User | null>(null); // Current user object
  const [session, setSession] = useState<Session | null>(null); // JWT session data
  const [isAdmin, setIsAdmin] = useState(false); // Admin role flag
  const navigate = useNavigate(); // Router navigation hook

  useEffect(() => {
    /**
     * Set up real-time authentication listener
     * This automatically updates the app when:
     * - User logs in/out
     * - Session expires
     * - Token is refreshed
     */
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Check admin status from database when user logs in
        if (session?.user) {
          setTimeout(() => {
            checkAdminStatus(session.user.id);
          }, 0);
        } else {
          setIsAdmin(false);
        }
      }
    );

    /**
     * Check for existing session on initial load
     * If user is already logged in (token in localStorage), restore the session
     */
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAdminStatus(session.user.id);
      }
    });

    // Cleanup: unsubscribe from auth listener when component unmounts
    return () => subscription.unsubscribe();
  }, []);

  /**
   * Check if user has admin role
   * Queries the user_roles table in the database
   */
  const checkAdminStatus = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles') // Database table storing user roles
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle(); // Returns null if no match found
    
    setIsAdmin(!!data); // Convert to boolean
  };

  /**
   * Sign up a new user
   * Creates account in auth system and profile in database (via trigger)
   */
  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName // Stored in user metadata, triggers profile creation
        }
      }
    });
    
    return { error };
  };

  /**
   * Sign in existing user with email and password
   * On success, redirects to dashboard
   */
  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (!error) {
      navigate('/dashboard'); // Redirect on successful login
    }
    
    return { error };
  };

  /**
   * Sign out current user
   * Clears session and redirects to home page
   */
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  // Provide auth state and functions to all child components
  return (
    <AuthContext.Provider value={{ user, session, isAdmin, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * useAuth Hook
 * 
 * Custom React hook to access authentication state in any component
 * Usage: const { user, signIn, signOut } = useAuth();
 * 
 * Throws error if used outside AuthProvider
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
