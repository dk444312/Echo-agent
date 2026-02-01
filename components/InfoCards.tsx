import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { TopicCard } from '../types';
import { getSupabase } from '../utils/supabaseClient';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { 
    INPUT_SAMPLE_RATE, 
    PCM_SAMPLE_RATE, 
    createPcmBlob, 
    decodeAudioData, 
    base64ToUint8Array 
} from '../utils/audioUtils';

interface InfoCardsProps {
  cards: TopicCard[];
  activeTab: string; 
  electionContext: string;
}

interface Candidate {
  id: string;
  name: string;
  manifesto: string;
  position: string;
  like_count: number;
}

interface Vote {
  candidate_id: string;
  position: string;
}

// Replaced AggregatedResult with PositionStatus for the blind dashboard
interface PositionStatus {
    position: string;
    hasWinner: boolean;
    isTie: boolean;
    totalVotes: number;
}

const InfoCards: React.FC<InfoCardsProps> = ({ cards, activeTab, electionContext }) => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [positionStatuses, setPositionStatuses] = useState<PositionStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  
  // Atlas State
  const [isAtlasActive, setIsAtlasActive] = useState(false);
  const [atlasVolume, setAtlasVolume] = useState(0);
  
  // Data Monitoring for Atlas Reaction
  const prevTotalVotesRef = useRef<number | null>(null);

  // Atlas Refs
  const atlasSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioInputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  
  // Synthetic Vision Ref
  const dashboardCanvasRef = useRef<HTMLCanvasElement>(null);

  // Keep a ref of candidates for Atlas prompt building
  const candidatesRef = useRef<Candidate[]>([]);
  useEffect(() => {
    candidatesRef.current = candidates;
  }, [candidates]);

  // Real-time Data Fetching & Aggregation
  useEffect(() => {
    // Only fetch if we are in analytics or dashboard mode
    if (activeTab !== 'analytics' && activeTab !== 'dashboard') return;

    const fetchData = async () => {
      const supabase = getSupabase();
      if (!supabase) return;

      try {
        setLoading(true);
        // 1. Fetch Candidates
        const { data: cData } = await supabase
          .from('candidates')
          .select('*')
          .order('name');
        
        if (cData) setCandidates(cData);

        // 2. Fetch All Votes
        const { data: vData } = await supabase
          .from('votes')
          .select('candidate_id, position');

        if (cData && vData) {
            // Group votes by position
            const posStats: Record<string, Record<string, number>> = {};
            cData.forEach(c => {
                if(!posStats[c.position]) posStats[c.position] = {};
                posStats[c.position][c.id] = 0;
            });
            
            vData.forEach((v: Vote) => {
                if(posStats[v.position]) {
                    posStats[v.position][v.candidate_id] = (posStats[v.position][v.candidate_id] || 0) + 1;
                }
            });

            // Calculate Status per Position
            const statuses: PositionStatus[] = Object.keys(posStats).map(pos => {
                 const counts = Object.values(posStats[pos]);
                 const max = Math.max(...counts, 0);
                 const total = counts.reduce((a,b)=>a+b, 0);
                 // Determine if winner or tie
                 // Tie if multiple candidates have max votes (and max > 0)
                 const winners = counts.filter(c => c === max);
                 const isTie = winners.length > 1 && max > 0;
                 const hasWinner = winners.length === 1 && max > 0;

                 return {
                     position: pos,
                     hasWinner,
                     isTie,
                     totalVotes: total
                 };
            });
            
            setPositionStatuses(statuses);
        }
      } catch (error) {
        console.error("Error fetching real election data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData(); 
    const interval = setInterval(fetchData, 3000); 

    return () => clearInterval(interval);
  }, [activeTab]);

  // DRAW DASHBOARD TO CANVAS (Synthetic Vision - BLINDED VERSION)
  const drawDashboardFrame = useCallback(() => {
      if (!dashboardCanvasRef.current || positionStatuses.length === 0) return null;
      
      const ctx = dashboardCanvasRef.current.getContext('2d');
      if (!ctx) return null;

      // 1. Background
      ctx.fillStyle = '#1E1F20';
      ctx.fillRect(0, 0, 800, 600);

      // 2. Header
      ctx.fillStyle = '#E3E3E3';
      ctx.font = 'bold 30px Arial';
      ctx.fillText("POSITION STATUS BOARD", 40, 60);
      
      ctx.strokeStyle = '#444746';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(40, 80);
      ctx.lineTo(760, 80);
      ctx.stroke();

      // 3. Draw Position Status Rows (No Names, No Counts)
      let y = 140;

      positionStatuses.forEach(stat => {
          // Position Name
          ctx.fillStyle = '#A8C7FA';
          ctx.font = 'bold 28px Arial';
          ctx.fillText(stat.position.toUpperCase(), 40, y);

          // Status Box
          let statusText = "WAITING FOR VOTES";
          let boxColor = '#444746';
          let textColor = '#C4C7C5';

          if (stat.hasWinner) {
              statusText = "WINNER PROJECTED";
              boxColor = '#6DD58C'; // Green
              textColor = '#0F5223';
          } else if (stat.isTie) {
              statusText = "TIE / TOO CLOSE TO CALL";
              boxColor = '#FFD600'; // Yellow
              textColor = '#413C00';
          }

          // Draw Status Box
          ctx.fillStyle = boxColor;
          ctx.fillRect(40, y + 20, 400, 40);

          // Draw Status Text
          ctx.fillStyle = textColor;
          ctx.font = 'bold 20px Arial';
          ctx.fillText(statusText, 55, y + 48);
          
          y += 110;
      });

      // 4. Timestamp
      ctx.fillStyle = '#9AA0A6';
      ctx.font = '14px monospace';
      ctx.fillText(`GENERATED: ${new Date().toLocaleTimeString()}`, 40, 580);

      return dashboardCanvasRef.current.toDataURL('image/jpeg', 0.6).split(',')[1];
  }, [positionStatuses]);


  // ATLAS LIVE REACTION LOGIC
  useEffect(() => {
    const currentTotal = positionStatuses.reduce((acc, curr) => acc + curr.totalVotes, 0);

    // Stream Vision Frame
    if (isAtlasActive && atlasSessionRef.current) {
         const base64Frame = drawDashboardFrame();
         if (base64Frame) {
             atlasSessionRef.current.sendRealtimeInput({
                 media: { mimeType: 'image/jpeg', data: base64Frame }
             });
         }
    }

    // Reaction Trigger
    if (prevTotalVotesRef.current !== null && currentTotal !== prevTotalVotesRef.current) {
        if (isAtlasActive && atlasSessionRef.current) {
             console.log("Triggering Atlas Reaction for new votes:", currentTotal);
             atlasSessionRef.current.sendRealtimeInput({
                 content: { parts: [{ text: `[SYSTEM ALERT: VOTE COUNT CHANGED! BRIEF EXCLAMATION ONLY. DO NOT READ STATS.]` }] }
             });
        }
    }
    prevTotalVotesRef.current = currentTotal;
  }, [positionStatuses, isAtlasActive, drawDashboardFrame]);

  // Cleanup
  useEffect(() => {
     if (activeTab !== 'analytics' && isAtlasActive) {
         disconnectAtlas();
     }
  }, [activeTab, isAtlasActive]);

  const disconnectAtlas = () => {
      if (atlasSessionRef.current) {
          try { atlasSessionRef.current.close(); } catch(e) {}
          atlasSessionRef.current = null;
      }
      if (audioContextRef.current) audioContextRef.current.close();
      if (audioInputContextRef.current) audioInputContextRef.current.close();
      setIsAtlasActive(false);
      setAtlasVolume(0);
  };

  const connectAtlas = async () => {
      if (isAtlasActive) {
          disconnectAtlas();
          return;
      }

      try {
          // Access API Key from Environment Variables
          // We check standard process.env (Webpack/Node) and import.meta.env (Vite)
          const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_API_KEY;
          
          if (!apiKey) {
            throw new Error("No API Key found. Please check your environment variables.");
          }

          setIsAtlasActive(true);
          const ai = new GoogleGenAI({ apiKey });
          
          audioInputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: INPUT_SAMPLE_RATE });
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: PCM_SAMPLE_RATE });
          
          const inputCtx = audioInputContextRef.current;
          const outputCtx = audioContextRef.current;
          
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const source = inputCtx.createMediaStreamSource(stream);
          const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
          
          const analyser = outputCtx.createAnalyser();
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateVol = () => {
              if (!isAtlasActive) return;
              analyser.getByteFrequencyData(dataArray);
              const avg = dataArray.reduce((a,b)=>a+b)/dataArray.length;
              setAtlasVolume(avg);
              requestAnimationFrame(updateVol);
          };
          
          // Build Manifesto Context with Like Counts
          const manifestoContext = candidatesRef.current.map(c => 
             `Candidate: ${c.name} (${c.position})\n   - Likes: ${c.like_count}\n   - Manifesto: "${c.manifesto}"`
          ).join('\n\n');

          const sessionPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-12-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction: `You are ATLAS, a Happy, Extroverted, and High-Energy Data Reporter.
- GENDER/VOICE: Male (Deep, confident).
- TASK: Watch the "Position Status Board" with the user.

CRITICAL RULES FOR RESULTS:
1. **WINNER INQUIRY**: If a user asks "Who is winning?" or "Who won?", you MUST refuse to give specific names or counts. 
   - Say strictly: "I cannot disclose that specific information. Please wait for the official publication from the Commission."
   - AFTER stating the refusal, you may ONLY report the status you see on the board (e.g., "However, I can see that the [Position Name] has a Projected Winner!" or "It's currently a Tie!").
2. **VISION**: You see a board listing Positions and their Status (Winner Projected / Tie). You DO NOT see vote counts.
3. **DATA ACCESS**: You have access to the candidates' manifestos AND their current "Like" counts below. Use them to answer questions about popularity or platforms.

CANDIDATE DATA (Manifestos & Likes):
${manifestoContext}
`,
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } }
                }
            },
            callbacks: {
                onopen: () => {
                    console.log("Atlas Connected");
                    updateVol();
                    
                    scriptProcessor.onaudioprocess = (e) => {
                        const inputData = e.inputBuffer.getChannelData(0);
                        const pcmBlob = createPcmBlob(inputData);
                        sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputCtx.destination);
                    
                    sessionPromise.then(s => {
                        atlasSessionRef.current = s;
                        const initialFrame = drawDashboardFrame();
                        if(initialFrame) {
                             s.sendRealtimeInput({
                                media: { mimeType: 'image/jpeg', data: initialFrame }
                             });
                        }
                        (s as any).sendRealtimeInput({ content: { parts: [{ text: "Start your intro." }] } });
                    });
                },
                onmessage: async (msg: LiveServerMessage) => {
                    const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (base64Audio && outputCtx) {
                        const audioBuffer = await decodeAudioData(base64ToUint8Array(base64Audio), outputCtx, PCM_SAMPLE_RATE);
                        const sourceNode = outputCtx.createBufferSource();
                        sourceNode.buffer = audioBuffer;
                        sourceNode.connect(analyser); // Connect to visualizer
                        analyser.connect(outputCtx.destination);
                        
                        const currentTime = outputCtx.currentTime;
                        if (nextStartTimeRef.current < currentTime) nextStartTimeRef.current = currentTime;
                        sourceNode.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += audioBuffer.duration;
                    }
                }
            }
          });

      } catch (err) {
          console.error("Atlas Connection Failed", err);
          setIsAtlasActive(false);
      }
  };

  const renderContent = () => {
    // Shared empty state
    if (activeTab === 'analytics' && positionStatuses.length === 0 && !loading) {
       return <div className="p-8 text-center text-zinc-500 text-sm">No election data available yet.</div>;
    }

    if (activeTab === 'analytics') {
      return (
        <div className="flex flex-col h-full p-6 animate-fade-in relative overflow-y-auto custom-scrollbar">
           {/* Header */}
           <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
              <div className="flex flex-col items-center md:items-start">
                  <h2 className="text-2xl md:text-3xl font-light text-google-primary tracking-tight">Data Center</h2>
                  <p className="text-zinc-500 text-sm">Real-time Election Analytics</p>
              </div>
           </div>
           
           {/* Atlas Visualizer Overlay */}
           {isAtlasActive && (
               <div className="w-full max-w-2xl mx-auto bg-emerald-900/20 border border-emerald-500/30 rounded-2xl p-4 flex items-center gap-4 mb-8 backdrop-blur-sm">
                   <div className="w-12 h-12 rounded-full bg-emerald-800 flex items-center justify-center shrink-0 overflow-hidden relative shadow-inner">
                       <div className="absolute inset-0 bg-emerald-500/20 animate-pulse"></div>
                       <svg className="w-7 h-7 text-emerald-200 z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
                   </div>
                   <div className="flex-1">
                       <p className="text-sm font-bold text-emerald-400 uppercase tracking-wide mb-1">Atlas is Speaking</p>
                       <div className="flex gap-1 mt-1 h-6 items-end">
                           {[...Array(30)].map((_, i) => (
                               <div key={i} className="w-1.5 bg-emerald-500/50 rounded-full transition-all duration-75" 
                                    style={{ height: `${Math.max(10, Math.min(100, atlasVolume * (Math.random() + 0.5)))}%` }} 
                               />
                           ))}
                       </div>
                   </div>
               </div>
           )}

           {/* Dashboard Content Container with Collapse Logic on Mobile */}
           <div className="flex flex-col w-full max-w-7xl mx-auto mb-6 md:mb-10 relative">
               
               {/* Mobile Toggle Button (Visible only on mobile - Moved to Top) */}
               <div className="md:hidden flex justify-center mb-6">
                   <button 
                     onClick={() => setIsMobileExpanded(!isMobileExpanded)}
                     className="flex items-center gap-2 text-xs font-semibold text-google-primary bg-google-surfaceVariant/50 px-6 py-3 rounded-full border border-google-surfaceVariant hover:bg-google-surfaceVariant transition-colors"
                   >
                       {isMobileExpanded ? 'Hide Dashboard Details' : 'View Dashboard Details'}
                       <svg className={`w-4 h-4 transition-transform ${isMobileExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                       </svg>
                   </button>
               </div>

               {/* Grid Wrapper - Hidden on Mobile unless expanded */}
               <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 transition-all duration-300 ease-in-out 
                   ${!isMobileExpanded ? 'hidden md:grid' : 'grid animate-fade-in'}
               `}>
                    
                   {/* Col 1: Position Status (No Specific Results) */}
                   <div className="bg-google-surface p-6 rounded-3xl border border-google-surfaceVariant shadow-lg">
                       <h3 className="text-base font-medium text-zinc-300 mb-6 flex items-center gap-2 border-b border-zinc-800 pb-2">
                          <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          Position Status Board
                       </h3>
                       <div className="space-y-4">
                          {positionStatuses.map((stat, i) => (
                              <div key={stat.position} className="p-4 rounded-xl bg-google-surfaceVariant/30 border border-zinc-700/50 flex flex-col gap-2">
                                  <div className="flex justify-between items-center">
                                      <span className="text-lg font-medium text-white">{stat.position.toUpperCase()}</span>
                                  </div>
                                  <div className={`px-4 py-3 rounded-lg font-bold text-center tracking-wide text-sm
                                      ${stat.hasWinner ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 
                                        stat.isTie ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 
                                        'bg-zinc-700/50 text-zinc-400'}
                                  `}>
                                      {stat.hasWinner ? "WINNER PROJECTED" : stat.isTie ? "TIE / TOO CLOSE TO CALL" : "WAITING FOR VOTES"}
                                  </div>
                              </div>
                          ))}
                          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                              <p className="text-xs text-blue-300 flex gap-2 items-start">
                                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  Official specific results are confidential. Only projected status is displayed.
                              </p>
                          </div>
                       </div>
                   </div>

                   {/* Col 2: Candidates & Manifestos */}
                   <div className="bg-google-surface p-6 rounded-3xl border border-google-surfaceVariant shadow-lg">
                       <h3 className="text-base font-medium text-zinc-300 mb-6 border-b border-zinc-800 pb-2">Candidates & Manifestos</h3>
                       <div className="grid gap-4 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
                          {candidates.map((cand) => (
                              <div key={cand.id} className="flex flex-col gap-3 p-4 rounded-2xl bg-google-surfaceVariant/30 border border-transparent hover:border-google-surfaceVariant hover:bg-google-surfaceVariant/60 transition-all">
                                  <div className="flex justify-between items-start">
                                      <div>
                                          <span className="text-base font-medium text-zinc-200">{cand.name}</span>
                                          <span className="text-[10px] ml-2 px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300 font-bold uppercase">{cand.position}</span>
                                      </div>
                                      <div className="flex items-center gap-1.5 text-sm text-pink-400 font-medium" title="Likes">
                                          <svg className="w-4 h-4 fill-current animate-pulse" viewBox="0 0 20 20"><path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.16-1.1c-1.059-.958-2.55-2.045-3.54-2.993C2.688 10.623 2 8.57 2 6.5 2 3.95 3.95 2 6.5 2c1.95 0 3.52.87 4.5 2.25A5.495 5.495 0 0115.5 2C18.05 2 20 3.95 20 6.5c0 2.07-.688 4.123-2.93 6.309-1.01.968-2.52 2.075-3.613 3.093l-.01.01-.005.003a.75.75 0 01-.79 0z" /></svg>
                                          {cand.like_count}
                                      </div>
                                  </div>
                                  <p className="text-sm text-zinc-400 italic leading-relaxed border-l-2 border-zinc-700 pl-3">"{cand.manifesto}"</p>
                              </div>
                          ))}
                       </div>
                   </div>
               </div>

           </div>
           
           {/* Bottom Action Area */}
           <div className="flex justify-center pb-safe-bottom z-20">
                 <button 
                    onClick={connectAtlas}
                    className={`flex items-center gap-3 px-10 py-5 rounded-full text-lg font-bold transition-all shadow-2xl hover:scale-105 active:scale-95 border-2 ${
                        isAtlasActive 
                        ? 'bg-emerald-500 text-white shadow-emerald-500/30 border-emerald-400' 
                        : 'bg-white text-zinc-900 hover:bg-zinc-100 border-white'
                    }`}
                 >
                    {isAtlasActive ? (
                        <>
                            <div className="flex gap-1 items-end h-6">
                                <span className="w-1.5 bg-white animate-pulse" style={{height: '60%'}}></span>
                                <span className="w-1.5 bg-white animate-pulse" style={{height: '100%', animationDelay: '0.1s'}}></span>
                                <span className="w-1.5 bg-white animate-pulse" style={{height: '40%', animationDelay: '0.2s'}}></span>
                            </div>
                            LISTENING...
                        </>
                    ) : (
                        <>
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" /></svg>
                            ASK ME FOR ANALYSIS
                        </>
                    )}
                 </button>
           </div>
           
           {/* HIDDEN CANVAS FOR SYNTHETIC VISION */}
           <canvas ref={dashboardCanvasRef} width={800} height={600} className="hidden" />
        </div>
      );
    }

    // Default: Dashboard / History View
    return (
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 custom-scrollbar pb-20 md:pb-6">
          <h2 className="text-lg font-medium text-google-primary mb-2">
            {activeTab === 'history' ? 'Session History' : 'Live Updates'}
          </h2>
          
          {cards.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-google-surfaceVariant rounded-3xl bg-google-surface/50">
               <div className="w-12 h-12 rounded-full bg-google-surfaceVariant flex items-center justify-center mb-3">
                   <svg className="w-6 h-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
               </div>
               <p className="text-sm text-zinc-400 font-medium">No updates yet</p>
               <p className="text-xs text-zinc-500 mt-1">Echo will push election alerts here.</p>
            </div>
          )}

          {cards.map((card) => (
             <div key={card.id} className="bg-google-surface p-4 rounded-2xl border border-google-surfaceVariant shadow-sm hover:shadow-md transition-shadow">
                 <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                         <span className={`w-2 h-2 rounded-full ${
                             card.category === 'alert' ? 'bg-google-error' :
                             card.category === 'location' ? 'bg-emerald-400' :
                             'bg-google-primary'
                         }`} />
                         <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">{card.category}</span>
                    </div>
                    <span className="text-[10px] text-zinc-600 font-mono">{card.timestamp.toLocaleTimeString()}</span>
                 </div>
                 <h4 className="text-sm font-medium text-zinc-200 mb-1">{card.title}</h4>
                 <p className="text-xs text-zinc-400 leading-relaxed">{card.description}</p>
             </div>
          ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-google-bg border-l border-google-surfaceVariant">
      {renderContent()}
    </div>
  );
};

export default InfoCards;