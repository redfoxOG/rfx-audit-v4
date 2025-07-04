
    import React, { useState, useEffect, useRef } from 'react';
    import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
    import { Terminal, Loader2 } from 'lucide-react';
    import { supabase } from '@/lib/customSupabaseClient';

    const LiveLogModal = ({ isOpen, onOpenChange, domain }) => {
      const [logs, setLogs] = useState([]);
      const [isFinished, setIsFinished] = useState(false);
      const logContainerRef = useRef(null);

      useEffect(() => {
        if (logContainerRef.current) {
          logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
      }, [logs]);

      useEffect(() => {
        if (!isOpen || !domain) {
          setLogs([]);
          setIsFinished(false);
          return;
        }

        setLogs([`[${new Date().toLocaleTimeString()}] Initializing stream for ${domain.name}...`]);
        setIsFinished(false);

        const channel = supabase
          .channel(`public:audits:domain_id=eq.${domain.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'audits', filter: `domain_id=eq.${domain.id}` },
            (payload) => {
              const newDetails = payload.new.details;
              if (newDetails && newDetails.log_stream) {
                setLogs(prevLogs => {
                  const existingLogs = new Set(prevLogs);
                  const updatedLogs = [...prevLogs];
                  newDetails.log_stream.forEach(log => {
                    if (!existingLogs.has(log)) {
                      updatedLogs.push(log);
                    }
                  });
                  return updatedLogs;
                });
              }
              if (payload.new.summary?.executive_summary) {
                setIsFinished(true);
                channel.unsubscribe();
              }
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      }, [isOpen, domain]);

      return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <Terminal className="mr-2 h-5 w-5 text-neon-green" />
                Live Scan Log: {domain?.name}
              </DialogTitle>
              <DialogDescription>
                Real-time output from the scanning engine. Do not close this window.
              </DialogDescription>
            </DialogHeader>
            <div 
              ref={logContainerRef}
              className="mt-4 p-4 bg-black rounded-md h-80 overflow-y-auto border border-neon-green/20"
            >
              <pre className="text-xs text-neon-green font-fira-code whitespace-pre-wrap">
                {logs.map((log, index) => (
                  <div key={index} className="animate-fadeIn">{log}</div>
                ))}
                {!isFinished && (
                  <div className="flex items-center animate-fadeIn">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>Awaiting next transmission...</span>
                  </div>
                )}
                 {isFinished && (
                  <div className="text-yellow-400 animate-fadeIn font-bold">
                    {`[${new Date().toLocaleTimeString()}] --- STREAM END --- Assessment complete.`}
                  </div>
                )}
              </pre>
            </div>
          </DialogContent>
        </Dialog>
      );
    };

    export default LiveLogModal;
  