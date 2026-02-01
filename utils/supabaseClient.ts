import { createClient, SupabaseClient } from '@supabase/supabase-js';

// --- CONFIGURATION ---
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qasedjbzodcqkfflnkmf.supabase.co';
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhc2VkamJ6b2RjcWtmZmxua21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2OTIzMzAsImV4cCI6MjA4MjI2ODMzMH0.AwJzudlnHKuj-wLHU0rqHPx3ZDEm-9uK6_mCltnG1Jc';

// ⚠️ SECURITY WARNING: This key has full admin access. 
// In a real production app, never hardcode this in the frontend.
export const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhc2VkamJ6b2RjcWtmZmxua21mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjY5MjMzMCwiZXhwIjoyMDgyMjY4MzMwfQ.gAqlAOkkB-XZkit9ut4SUHcen3fAGtv3GBKL57yFBto';

// --- CLIENT INSTANCES ---
let supabaseInstance: SupabaseClient | null = null;
let supabaseAdminInstance: SupabaseClient | null = null;

// 1. Standard Client (For public/logged-in user actions)
export const getSupabase = (): SupabaseClient | null => {
  if (supabaseInstance) return supabaseInstance;

  if (supabaseUrl && supabaseAnonKey) {
    try {
      supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
      return supabaseInstance;
    } catch (error) {
      console.error("Invalid Supabase credentials", error);
      return null;
    }
  } else {
    console.warn("Supabase credentials missing.");
    return null;
  }
};

// 2. Admin Client (For file uploads bypassing RLS)
export const getSupabaseAdmin = (): SupabaseClient | null => {
    if (supabaseAdminInstance) return supabaseAdminInstance;

    if (supabaseUrl && supabaseServiceKey) {
        try {
            supabaseAdminInstance = createClient(supabaseUrl, supabaseServiceKey);
            return supabaseAdminInstance;
        } catch (error) {
            console.error("Invalid Supabase Admin credentials", error);
            return null;
        }
    } else {
        console.warn("Supabase Service Key missing.");
        return null;
    }
};

// --- UTILITIES ---
export const initSupabase = (url: string, key: string): boolean => {
  try {
    if (!url || !key) return false;
    supabaseInstance = createClient(url, key);
    return true;
  } catch (error) {
    console.error("Failed to initialize Supabase client manually", error);
    return false;
  }
};

export const resetSupabase = () => {
  supabaseInstance = null;
  supabaseAdminInstance = null;
};