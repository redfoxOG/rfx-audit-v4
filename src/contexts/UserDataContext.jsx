import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const UserDataContext = createContext(undefined);

export const UserDataProvider = ({ children }) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [profile, setProfile] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingUsage, setLoadingUsage] = useState(true);

  const fetchProfileAndSubscription = useCallback(async (currentUser) => {
    if (!currentUser) {
      setProfile(null);
      setLoadingProfile(false);
      return;
    }
    setLoadingProfile(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, subscriptions(*, plans(*))')
        .eq('id', currentUser.id)
        .single();

      if (error && error.code !== 'PGRST116') {
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
    } finally {
      setLoadingProfile(false);
    }
  }, [toast]);

  const fetchUsage = useCallback(async (currentUser) => {
    if (!currentUser) {
      setUsage(null);
      setLoadingUsage(false);
      return;
    }
    setLoadingUsage(true);
    try {
      const { data, error } = await supabase.rpc('get_user_usage_stats', { p_user_id: currentUser.id });
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
      setUsage(null);
    } finally {
      setLoadingUsage(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user) {
      fetchProfileAndSubscription(user);
      fetchUsage(user);
    } else {
      setLoadingProfile(false);
      setLoadingUsage(false);
    }
  }, [user, fetchProfileAndSubscription, fetchUsage]);

  const refetchProfile = useCallback(() => {
    if (user) fetchProfileAndSubscription(user);
  }, [user, fetchProfileAndSubscription]);

  const refetchUsage = useCallback(() => {
    if (user) fetchUsage(user);
  }, [user, fetchUsage]);

  const value = useMemo(() => ({
    profile,
    usage,
    loadingProfile,
    loadingUsage,
    refetchProfile,
    refetchUsage,
  }), [profile, usage, loadingProfile, loadingUsage, refetchProfile, refetchUsage]);

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
};

export const useUserData = () => {
  const context = useContext(UserDataContext);
  if (context === undefined) {
    throw new Error('useUserData must be used within a UserDataProvider');
  }
  return context;
};