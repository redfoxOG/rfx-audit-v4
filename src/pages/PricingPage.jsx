
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Star, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { loadStripe } from '@stripe/stripe-js';
import { supabase } from '@/lib/customSupabaseClient';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const PricingCard = ({ plan, onSelectPlan, isCurrentPlan, loadingPlan }) => (
  <Card className={`flex flex-col h-full ${isCurrentPlan ? 'border-crimson shadow-crimson/20' : ''}`}>
    <CardHeader className="text-center">
      <CardTitle className="flex items-center justify-center gap-2 text-2xl font-orbitron">
        {plan.is_premium && <Star className="h-5 w-5 text-yellow-400" />} {plan.name}
      </CardTitle>
      <div className="text-4xl font-bold font-orbitron my-2">
        {plan.price}
        {plan.price_per && <span className="text-sm font-normal text-gray-400">{plan.price_per}</span>}
      </div>
      <CardDescription>{plan.description}</CardDescription>
    </CardHeader>
    <CardContent className="flex-grow space-y-3">
      {plan.features.map((feature, i) => (
        <div key={i} className="flex items-start">
          <Check className="h-5 w-5 text-neon-green mr-3 flex-shrink-0 mt-0.5" />
          <span className="text-sm text-gray-300">{feature}</span>
        </div>
      ))}
    </CardContent>
    <CardFooter>
      <Button
        className="w-full font-bold tracking-wider"
        onClick={() => onSelectPlan(plan)}
        disabled={isCurrentPlan || loadingPlan}
        variant={plan.is_premium && !isCurrentPlan ? 'default' : 'secondary'}
      >
        {loadingPlan === plan.name ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {isCurrentPlan ? 'Current Plan' : plan.cta || `Get ${plan.name}`}
      </Button>
    </CardFooter>
  </Card>
);

const PricingPage = () => {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    const fetchPlans = async () => {
      const { data, error } = await supabase.from('plans').select('*').order('price', { ascending: true });
      if (error) {
        toast({ title: 'Error', description: 'Could not fetch pricing plans.', variant: 'destructive' });
      } else {
        setPlans(data);
      }
    };
    fetchPlans();
  }, [toast]);

  const handleSelectPlan = async (plan) => {
    if (!plan.stripe_price_id) {
      toast({
        title: 'Enterprise Plan',
        description: "This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
      });
      return;
    }
    
    setLoadingPlan(plan.name);

    if (plan.type === 'subscription') {
      try {
        const stripe = await stripePromise;
        const { error } = await stripe.redirectToCheckout({
          lineItems: [{ price: plan.stripe_price_id, quantity: 1 }],
          mode: 'subscription',
          successUrl: `${window.location.origin}/premium-success`,
          cancelUrl: `${window.location.origin}/premium-cancel`,
          clientReferenceId: user.id,
        });

        if (error) {
          toast({ title: 'Stripe Error', description: error.message, variant: 'destructive' });
        }
      } catch (error) {
          toast({ title: 'Error', description: 'Could not connect to Stripe.', variant: 'destructive' });
      } finally {
          setLoadingPlan(null);
      }
    } else if (plan.type === 'one-time') {
        const { data, error } = await supabase.functions.invoke('create-checkout-session', {
            body: { priceId: plan.stripe_price_id, userId: user.id },
        });

        if (error) {
            toast({ title: 'Error', description: 'Could not create checkout session.', variant: 'destructive' });
            setLoadingPlan(null);
            return;
        }

        const stripe = await stripePromise;
        const { error: stripeError } = await stripe.redirectToCheckout({ sessionId: data.sessionId });

        if (stripeError) {
            toast({ title: 'Stripe Error', description: stripeError.message, variant: 'destructive' });
        }
        setLoadingPlan(null);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  const currentPlanLookupKey = profile?.subscription_status === 'active' ? 'adv_scan_monthly' : 'free_tier';

  return (
    <>
      <Helmet>
        <title>Pricing - RedFox Audit Core</title>
        <meta name="description" content="Choose your plan and upgrade your security operations." />
      </Helmet>
      <motion.div
        className="space-y-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants} className="text-center">
          <h1 className="text-4xl font-bold font-orbitron text-gray-100">Choose Your Arsenal</h1>
          <p className="text-gray-400 font-fira-code mt-2 max-w-2xl mx-auto">
            Scale your operations from lone wolf to full-blown ghost protocol. More power, more possibilities.
          </p>
        </motion.div>

        <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {plans.map((plan) => (
            <motion.div variants={itemVariants} key={plan.id}>
              <PricingCard 
                plan={plan} 
                onSelectPlan={handleSelectPlan} 
                isCurrentPlan={plan.type === 'subscription' && plan.lookup_key === currentPlanLookupKey} 
                loadingPlan={loadingPlan} 
              />
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </>
  );
};

export default PricingPage;
