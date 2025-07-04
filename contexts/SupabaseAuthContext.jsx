
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();

  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [usage, setUsage] = useState({ domainCount: 0, scanCount: 0, scanCredits: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingUsage, setLoadingUsage] = useState(true);

  const fetchProfileAndSubscription = useCallback(async (user) => {
    if (!user) {
      setProfile(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, subscriptions(*, plans(*))')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // Ignore 'exact one row' error for new users
        throw error;
      }
      
      if (data) {
        const activeSubscription = data.subscriptions?.find(sub => sub.status === 'active');
        const profileData = {
          ...data,
          subscription_status: activeSubscription ? 'active' : 'inactive',
          plan: activeSubscription ? activeSubscription.plans : null,
        };
        setProfile(profileData);
      } else {
        setProfile(null);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Profile Error",
        description: "Could not fetch user profile.",
      });
      setProfile(null);
    }
  }, [toast]);

  const fetchUsage = useCallback(async (user) => {
    if (!user) {
      setUsage({ domainCount: 0, scanCount: 0, scanCredits: 0 });
      setLoadingUsage(false);
      return;
    }
    setLoadingUsage(true);
    try {
      const { data, error } = await supabase.rpc('get_user_usage_stats', { p_user_id: user.id });
      if (error) throw error;
      setUsage({
        domainCount: data.domain_count,
        scanCount: data.monthly_scan_count,
        scanCredits: data.scan_credits,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Usage Error",
        description: "Could not fetch usage statistics.",
      });
      setUsage({ domainCount: 0, scanCount: 0, scanCredits: 0 });
    } finally {
      setLoadingUsage(false);
    }
  }, [toast]);

  const handleSession = useCallback(async (session) => {
    setSession(session);
    const currentUser = session?.user ?? null;
    setUser(currentUser);
    if (currentUser) {
      await fetchProfileAndSubscription(currentUser);
      await fetchUsage(currentUser);
    }
    setLoading(false);
  }, [fetchProfileAndSubscription, fetchUsage]);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await handleSession(session);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        await handleSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, [handleSession]);

  const signUp = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      toast({ variant: "destructive", title: "Sign up Failed", description: error.message });
    }
    return { error };
  }, [toast]);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ variant: "destructive", title: "Sign in Failed", description: error.message });
    }
    return { error };
  }, [toast]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({ variant: "destructive", title: "Sign out Failed", description: error.message });
    }
    setProfile(null);
    setUsage({ domainCount: 0, scanCount: 0, scanCredits: 0 });
    return { error };
  }, [toast]);

  const refetchUsage = useCallback(() => {
    if (user) fetchUsage(user);
  }, [user, fetchUsage]);

  const value = useMemo(() => ({
    user,
    session,
    profile,
    usage,
    loading,
    loadingUsage,
    signUp,
    signIn,
    signOut,
    refetchUsage,
  }), [user, session, profile, usage, loading, loadingUsage, signUp, signIn, signOut, refetchUsage]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
