import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PlusCircle, Search, Activity, AlertCircle, ShieldOff } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import DomainList from '@/components/domains/DomainList';
import DomainDialog from '@/components/domains/DomainDialog';
import LiveLogModal from '@/components/domains/LiveLogModal';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate } from 'react-router-dom';

const DomainsPage = () => {
  const [domains, setDomains] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentDomain, setCurrentDomain] = useState(null);
  const [loadingDomains, setLoadingDomains] = useState(true);
  const [error, setError] = useState(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [loggingDomain, setLoggingDomain] = useState(null);
  const { toast } = useToast();
  const { user, profile, usage, refetchUsage } = useAuth();
  const navigate = useNavigate();

  const fetchDomains = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingDomains(true);
      setError(null);
      const { data, error } = await supabase
        .from('domains')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDomains(data || []);
    } catch (err) {
      setError('Failed to fetch targets. The server might be hostile.');
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingDomains(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (user) {
      fetchDomains();

      const channel = supabase.channel(`public:domains:user_id=eq.${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'domains', filter: `user_id=eq.${user?.id}` }, payload => {
          fetchDomains();
          if (typeof refetchUsage === 'function') {
            refetchUsage();
          }
        })
        .subscribe();
        
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, fetchDomains, refetchUsage]);

  const handleOpenDialog = (domain = null) => {
    const isPremium = profile?.subscription_status === 'active';
    if (!domain && !isPremium && usage && usage.domainCount >= 2) {
      toast({
        title: 'Domain Limit Reached',
        description: 'Free plan is limited to 2 domains. Please upgrade to add more.',
        variant: 'destructive',
        action: <Button onClick={() => navigate('/pricing')}>Upgrade</Button>,
      });
      return;
    }
    setCurrentDomain(domain);
    setIsDialogOpen(true);
  };

  const handleSaveDomain = useCallback(async (domainData) => {
    if (!user) return;
    const domainPayload = {
      ...domainData,
      user_id: user.id,
      status: domainData.status || 'Pending'
    };
    
    let promise;
    if (currentDomain && currentDomain.id) {
      promise = supabase.from('domains').update(domainPayload).eq('id', currentDomain.id).select().single();
    } else {
      promise = supabase.from('domains').insert(domainPayload).select().single();
    }

    const { data: savedDomain, error } = await promise;
    if (error) {
      toast({ title: 'Operation Failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: currentDomain ? 'Target Updated' : 'Target Acquired', description: `${savedDomain.name} configuration saved.` });
      setIsDialogOpen(false);
      setCurrentDomain(null);
    }
  }, [user, currentDomain, toast]);

  const handleDeleteDomain = useCallback(async (domainId) => {
    const { error } = await supabase.from('domains').delete().eq('id', domainId);
    if (error) {
      toast({ title: 'Failed to Remove Target', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Target Removed', description: 'The target has been removed from surveillance.', variant: 'destructive' });
    }
  }, [toast]);
  
  const handleRunAudit = useCallback(async (domainId) => {
    const domainToAudit = domains.find(d => d.id === domainId);
    if (!domainToAudit || !user || !usage || !profile) {
        toast({ title: 'Error', description: 'User data not fully loaded. Please try again in a moment.', variant: 'destructive' });
        return;
    }

    const isPremium = profile.subscription_status === 'active';
    
    if (!isPremium && usage.scanCount >= 3 && usage.scanCredits <= 0) {
      toast({
        title: 'Scan Limit Reached',
        description: 'You have used all your free scans for this month. Please upgrade or purchase scan credits.',
        variant: 'destructive',
        action: <Button onClick={() => navigate('/pricing')}>Get More Scans</Button>,
      });
      return;
    }

    const hasAdvancedScans = Object.values(domainToAudit.scan_types?.advanced || {}).some(v => v);
    if (hasAdvancedScans && !isPremium) {
      toast({
        title: 'Premium Feature Locked',
        description: 'Advanced scans require a premium subscription. Please upgrade your plan.',
        variant: 'destructive',
        action: <Button onClick={() => navigate('/pricing')}>Upgrade</Button>,
      });
      return;
    }

    setLoggingDomain(domainToAudit);
    setIsLogModalOpen(true);

    await supabase.from('domains').update({ status: 'Auditing' }).eq('id', domainId);
    
    const { data: scanData, error: scanInsertError } = await supabase.from('scans').insert({ user_id: user.id, target_url: domainToAudit.name, status: 'initiated' }).select().single();

    if (scanInsertError) {
      toast({ title: 'Scan Failed', description: scanInsertError.message, variant: 'destructive' });
      await supabase.from('domains').update({ status: 'Failed' }).eq('id', domainId);
      setIsLogModalOpen(false);
      return;
    }
    
    toast({ title: 'Scan Initiated...', description: `Dispatching minions to assess ${domainToAudit.name}.`});
    
    try {
      let url = domainToAudit.name;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }

      const webhookPayload = { url, email: user.email, domain_id: domainToAudit.id, scan_id: scanData.id };
      const { error: functionError } = await supabase.functions.invoke('n8n-proxy', { body: webhookPayload });

      if (functionError) throw new Error(`Webhook dispatch failed: ${functionError.message}`);

      toast({ title: 'Dispatch Confirmed', description: 'n8n workflow triggered successfully. Awaiting results.'});
    } catch(err) {
      toast({ title: 'Dispatch Failed', description: err.message, variant: 'destructive' });
      await supabase.from('domains').update({ status: 'Failed' }).eq('id', domainId);
      setIsLogModalOpen(false);
    }
  }, [domains, user, profile, toast, usage, navigate]);

  const filteredDomains = domains.filter(domain =>
    domain.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

  const isPremium = profile?.subscription_status === 'active';

  return (
    <>
      <Helmet>
        <title>Targets - RedFox Audit Core</title>
        <meta name="description" content="Manage and monitor your target domains and IPs." />
      </Helmet>
      <motion.div 
        className="space-y-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold font-orbitron text-gray-100">Target Management</h1>
            <p className="text-gray-400 font-fira-code">Add, edit, and scan your monitored assets.</p>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <PlusCircle className="mr-2 h-4 w-4" /> Acquire New Target
          </Button>
        </motion.div>

        {!isPremium && usage && (
          <motion.div variants={itemVariants}>
            <Card className="bg-dark-gray border-neon-red/20">
              <CardHeader>
                <CardTitle className="flex items-center text-yellow-400"><ShieldOff className="mr-2 h-5 w-5" /> Agent Plan Limits</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row gap-4 sm:gap-8 text-sm">
                <p>Domains: <span className="font-bold">{usage.domainCount} / 2</span></p>
                <p>Monthly Scans Used: <span className="font-bold">{usage.scanCount} / 3</span></p>
                <p>Scan Credits: <span className="font-bold">{usage.scanCredits}</span></p>
                <Button size="sm" className="ml-auto" onClick={() => navigate('/pricing')}>Upgrade Plan</Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Target Roster</CardTitle>
                  <CardDescription>List of all assets under surveillance.</CardDescription>
                </div>
                <div className="relative w-full max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    type="search"
                    placeholder="Search targets..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    name="search_targets"
                    id="search_targets"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingDomains ? (
                <div className="flex items-center justify-center p-10"><Activity className="h-8 w-8 animate-spin text-crimson" /> <p className="ml-3 font-fira-code">Loading targets...</p></div>
              ) : error ? (
                <div className="flex items-center justify-center p-10 text-destructive"><AlertCircle className="h-8 w-8 mr-3" /> <p className="font-fira-code">{error}</p></div>
              ) : (
                <DomainList
                  domains={filteredDomains}
                  onEdit={handleOpenDialog}
                  onDelete={handleDeleteDomain}
                  onRunAudit={handleRunAudit}
                />
              )}
            </CardContent>
          </Card>
        </motion.div>

        <DomainDialog
          isOpen={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          domain={currentDomain}
          onSave={handleSaveDomain}
        />
        <LiveLogModal
          isOpen={isLogModalOpen}
          onOpenChange={setIsLogModalOpen}
          domain={loggingDomain}
        />
      </motion.div>
    </>
  );
};

export default DomainsPage;