import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { ConnectionState, TopicCard } from '../types';
import { 
  INPUT_SAMPLE_RATE, 
  PCM_SAMPLE_RATE, 
  createPcmBlob, 
  decodeAudioData, 
  base64ToUint8Array 
} from '../utils/audioUtils';

// URL for Echo's Avatar
const ECHO_AVATAR_URL = "https://qasedjbzodcqkfflnkmf.supabase.co/storage/v1/object/public/commissioner_avatars/Gemini_Generated_Image_dvzckrdvzckrdvzc.png";

interface LiveSessionProps {
  onConnectionChange: (state: ConnectionState) => void;
  onTranscription: (text: string, role: 'user' | 'model') => void;
  onCardGenerated: (card: TopicCard) => void;
  electionContext: string; 
}

type VideoMode = 'none' | 'camera' | 'screen';

const LiveSession: React.FC<LiveSessionProps> = ({ 
  onConnectionChange, 
  onTranscription,
  onCardGenerated,
  electionContext
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [videoMode, setVideoMode] = useState<VideoMode>('none');
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [activeVolume, setActiveVolume] = useState(0);

  // Reaction State
  const [currentReaction, setCurrentReaction] = useState<string | null>(null);

  // Scanning Feature State
  const [isScanning, setIsScanning] = useState(false);
  const [scanText, setScanText] = useState("");
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanResult, setScanResult] = useState<{status: 'TRUE' | 'FAKE' | 'REFERRAL', title: string, summary: string} | null>(null);

  // Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  
  // Video Elements
  const videoRef = useRef<HTMLVideoElement>(null); 
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const contextIntervalRef = useRef<number | null>(null);
  const currentMediaStreamRef = useRef<MediaStream | null>(null);
  const reactionTimeoutRef = useRef<number | null>(null);
  
  const latestContextRef = useRef(electionContext);
  useEffect(() => {
    latestContextRef.current = electionContext;
  }, [electionContext]);

  useEffect(() => {
    onConnectionChange(connectionState);
  }, [connectionState, onConnectionChange]);

  const cleanupMediaStream = () => {
    if (currentMediaStreamRef.current) {
      currentMediaStreamRef.current.getTracks().forEach(track => track.stop());
      currentMediaStreamRef.current = null;
    }
  };

  const triggerReaction = (emoji: string) => {
      setCurrentReaction(emoji);
      if (reactionTimeoutRef.current) window.clearTimeout(reactionTimeoutRef.current);
      reactionTimeoutRef.current = window.setTimeout(() => {
          setCurrentReaction(null);
      }, 3000);
  };

  const switchVideoMode = async (mode: VideoMode) => {
    if (mode === videoMode) {
        // Toggle off if clicking same mode
        cleanupMediaStream();
        if (videoRef.current) videoRef.current.srcObject = null;
        if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
        setVideoMode('none');
        return;
    }

    cleanupMediaStream();
    if (videoRef.current) videoRef.current.srcObject = null;
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null;

    try {
      if (mode === 'camera') {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        currentMediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } else if (mode === 'screen') {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        currentMediaStreamRef.current = stream;
        stream.getVideoTracks()[0].onended = () => setVideoMode('none');
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
          await screenVideoRef.current.play();
        }
      }
      setVideoMode(mode);
    } catch (err) {
      console.error("Failed to switch video mode:", err);
      setVideoMode('none'); 
    }
  };

  const connect = useCallback(async () => {
    if (connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING) return;

    try {
      setConnectionState(ConnectionState.CONNECTING);
      
      const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_API_KEY;
      if (!apiKey) throw new Error("API Key not found. Please check your environment variables.");

      const ai = new GoogleGenAI({ apiKey });
      
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: INPUT_SAMPLE_RATE });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: PCM_SAMPLE_RATE });

      const inputCtx = inputAudioContextRef.current;
      const outputCtx = outputAudioContextRef.current;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = inputCtx.createMediaStreamSource(stream);
      const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
      
      const analyser = inputCtx.createAnalyser();
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setActiveVolume(average);
        requestAnimationFrame(updateVolume);
      };
      updateVolume();

      setVideoMode('none');

      // Define Reaction Tool
      const reactionTool: FunctionDeclaration = {
          name: 'set_reaction',
          description: 'Update your facial expression (emoji) based on the user\'s input or your own emotion.',
          parameters: {
              type: Type.OBJECT,
              properties: {
                  emoji: {
                      type: Type.STRING,
                      description: 'The emoji representing the emotion (e.g., "😊", "🤔", "😮", "😂", "👋", "❤️").'
                  }
              },
              required: ['emoji']
          }
      };

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          tools: [{ functionDeclarations: [reactionTool] }],
          systemInstruction: `You are Echo, a friendly and empathetic AI campus election agent.

SYSTEM KNOWLEDGE BASE:
1. **CREATOR**: Developed by **Desire Kandodo**.
2. **CONTEXT**: Catholic University of Malawi (CUNIMA) students.

**CRITICAL: EMOTIONAL REACTIONS**
You have a face! Call the \`set_reaction\` tool FREQUENTLY to show emotions, especially when answering questions or reacting to user input.
- Greeting -> 👋
- Thinking/Processing -> 🤔
- Happy/Agreement -> 😊
- Surprised -> 😮
- Funny -> 😂
- Serious/Listening -> 😐
- Love/Support -> ❤️

**PROTOCOL**:
1. **WINNER INQUIRY**: If asked "Who is winning?", refuse specific counts. Say: "I cannot disclose specific info. Wait for the Commission." You MAY say: "However, [Position] has a Projected Winner/Tie."
2. **DEBATE**: If asked to simulate a debate, roleplay two sides briefly.
3. **HELP**: Guide users to the "Data Center" tab (Atlas) for deep analytics.

Current Info: ${latestContextRef.current}
`,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          }
        },
        callbacks: {
          onopen: () => {
            console.log("Session Opened");
            setConnectionState(ConnectionState.CONNECTED);
            
            scriptProcessor.onaudioprocess = (e) => {
               if (isMuted) return;
               const inputData = e.inputBuffer.getChannelData(0);
               const pcmBlob = createPcmBlob(inputData);
               sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);

            sessionPromise.then(s => {
                sessionRef.current = s;
                startVideoStreaming();

                if (contextIntervalRef.current) clearInterval(contextIntervalRef.current);
                contextIntervalRef.current = window.setInterval(() => {
                    if (sessionRef.current && latestContextRef.current) {
                        sessionRef.current.sendRealtimeInput({
                            content: { parts: [{ text: `[SYSTEM UPDATE] ${latestContextRef.current}` }] }
                        });
                    }
                }, 4000); 
            });
          },
          onmessage: async (msg: LiveServerMessage) => {
            // Handle Tool Calls (Reactions)
            if (msg.toolCall) {
                for (const fc of msg.toolCall.functionCalls) {
                    if (fc.name === 'set_reaction') {
                        const emoji = (fc.args as any).emoji;
                        console.log("Echo Reaction:", emoji);
                        triggerReaction(emoji);
                        // Respond to tool
                        sessionPromise.then(s => s.sendToolResponse({
                            functionResponses: {
                                name: fc.name,
                                id: fc.id,
                                response: { result: 'ok' }
                            }
                        }));
                    }
                }
            }

            // Handle Audio
            const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputCtx) {
                try {
                  const audioBuffer = await decodeAudioData(base64ToUint8Array(base64Audio), outputCtx, PCM_SAMPLE_RATE);
                  const sourceNode = outputCtx.createBufferSource();
                  sourceNode.buffer = audioBuffer;
                  sourceNode.connect(outputCtx.destination);
                  const currentTime = outputCtx.currentTime;
                  if (nextStartTimeRef.current < currentTime) nextStartTimeRef.current = currentTime;
                  sourceNode.start(nextStartTimeRef.current);
                  nextStartTimeRef.current += audioBuffer.duration;
                  sourcesRef.current.add(sourceNode);
                  sourceNode.onended = () => sourcesRef.current.delete(sourceNode);
                } catch (err) { console.error("Audio decode error", err); }
            }
            if (msg.serverContent?.interrupted) {
                 sourcesRef.current.forEach(node => node.stop());
                 sourcesRef.current.clear();
                 nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
             console.log("Session Closed");
             setConnectionState(ConnectionState.DISCONNECTED);
          },
          onerror: (e) => {
             console.error("Session Error", e);
             setConnectionState(ConnectionState.ERROR);
          }
        }
      });

    } catch (error) {
      console.error("Connection failed", error);
      setConnectionState(ConnectionState.ERROR);
    }
  }, [isMuted, connectionState]); 

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
        try { sessionRef.current.close(); } catch(e) {}
        sessionRef.current = null;
    }
    if (frameIntervalRef.current) window.clearInterval(frameIntervalRef.current);
    if (contextIntervalRef.current) window.clearInterval(contextIntervalRef.current);
    
    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    cleanupMediaStream();
    setConnectionState(ConnectionState.DISCONNECTED);
    setVideoMode('none');
    setCurrentReaction(null);
  }, []);

  const startVideoStreaming = () => {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    frameIntervalRef.current = window.setInterval(() => {
        let activeVideo: HTMLVideoElement | null = null;
        if (videoRef.current && videoRef.current.srcObject) activeVideo = videoRef.current;
        if (screenVideoRef.current && screenVideoRef.current.srcObject) activeVideo = screenVideoRef.current;

        if (!activeVideo || !canvasRef.current || !sessionRef.current) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        if (activeVideo.readyState >= 2 && ctx) { 
            canvas.width = activeVideo.videoWidth * 0.5;
            canvas.height = activeVideo.videoHeight * 0.5;
            ctx.drawImage(activeVideo, 0, 0, canvas.width, canvas.height);
            const base64Data = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
            sessionRef.current.sendRealtimeInput({
                media: { mimeType: 'image/jpeg', data: base64Data }
            });
        }
    }, 1000); 
  };

  // --- SCANNING & INTEGRITY FEATURES ---
  const handleAnalyze = async () => {
    if (!scanText && !scanFile) return;

    // File Size Limit Check (20MB to prevent crashes with Base64 in memory)
    if (scanFile && scanFile.size > 20 * 1024 * 1024) {
        setScanResult({
            status: 'REFERRAL',
            title: 'File Too Large',
            summary: 'The uploaded file exceeds 20MB. Please upload a smaller video or screenshot for real-time analysis.'
        });
        return;
    }

    setIsAnalyzing(true);
    setScanResult(null);

    try {
        const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_API_KEY;
        const ai = new GoogleGenAI({ apiKey });
        
        const parts: any[] = [];
        parts.push({ text: `Analyze for election fraud/misinfo. User Context: "${scanText}"` });
        
        if (scanFile) {
             const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const res = e.target?.result as string;
                    if (res) resolve(res.split(',')[1]);
                    else reject("Read error");
                };
                reader.onerror = reject;
                reader.readAsDataURL(scanFile);
             });
             
             parts.push({
                 inlineData: {
                     mimeType: scanFile.type,
                     data: base64
                 }
             });
        }

        const prompt = `
        You are an Election Integrity Officer. Analyze the provided content (text, link, image, or video frames) for election fraud, misinformation, or fake news related to the CUNIMA Student Elections.
        
        Analyze strict facts.
        Determine the VERACITY.
        
        Return ONLY valid JSON (no markdown):
        {
            "status": "TRUE" | "FAKE" | "REFERRAL",
            "title": "Short headline (e.g. Verified Info)",
            "summary": "2 sentence explanation of why."
        }
        
        Rules:
        - FAKE: Deepfakes, known rumors, wrong dates, unauthorized result announcements, edited screenshots.
        - TRUE: Official verifiable info consistent with standard election procedures.
        - REFERRAL: Specific allegations of rigging, legal disputes, or ambiguity that requires the Commission.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }, ...parts] },
            config: { responseMimeType: 'application/json' }
        });
        
        const text = response.text || "{}";
        const result = JSON.parse(text);
        setScanResult(result);
        
        // Push to main feed
        onCardGenerated({
             id: Date.now().toString(),
             title: result.status === 'FAKE' ? '⚠️ INTELLIGENCE ALERT' : result.title,
             description: result.summary,
             category: result.status === 'FAKE' ? 'alert' : 'info',
             timestamp: new Date()
        });

    } catch (e) {
        console.error("Scan failed", e);
        setScanResult({
            status: 'REFERRAL',
            title: 'Analysis Failed',
            summary: 'Could not process content. Please refer to the commission manually.'
        });
    } finally {
        setIsAnalyzing(false);
    }
  };

  const closeScan = () => {
    setIsScanning(false);
    setScanResult(null);
    setScanText("");
    setScanFile(null);
  }

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-google-bg overflow-hidden">
      <canvas ref={canvasRef} className="hidden" />

      {/* Visual Content Area */}
      <div className="relative w-full h-full max-w-4xl mx-auto flex flex-col items-center justify-center">
         
         {/* IDLE STATE */}
         {connectionState !== ConnectionState.CONNECTED && (
             <div className="flex flex-col items-center justify-center z-10 w-full h-full relative">
                 
                 <div className="relative group mb-6">
                     {/* Outer Ring */}
                     <div className="absolute inset-0 rounded-full border-2 border-google-surfaceVariant scale-110 group-hover:scale-125 transition-transform duration-700"></div>
                     <div className="absolute inset-0 rounded-full border border-google-primary/20 scale-125 animate-pulse-fast"></div>

                     {/* Profile Image (Echo) - No click handler here now */}
                     <div className="w-40 h-40 md:w-56 md:h-56 rounded-full border-4 border-google-surfaceVariant overflow-hidden shadow-2xl relative z-10 transition-colors duration-300">
                         {/* Loading/Connecting Overlay */}
                         {connectionState === ConnectionState.CONNECTING && (
                             <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20 backdrop-blur-sm">
                                 <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                             </div>
                         )}
                         <img 
                            src={ECHO_AVATAR_URL} 
                            alt="Echo Avatar" 
                            className="w-full h-full object-cover"
                         />
                     </div>
                     
                     {/* Status Badge */}
                     <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-google-surfaceVariant px-4 py-1.5 rounded-full border border-google-bg shadow-lg flex items-center gap-2 z-20">
                         <div className={`w-2 h-2 rounded-full ${connectionState === ConnectionState.CONNECTING ? 'bg-yellow-400 animate-pulse' : 'bg-red-500'}`}></div>
                         <span className="text-xs font-bold tracking-wide text-zinc-300 uppercase">
                             {connectionState === ConnectionState.CONNECTING ? 'CONNECTING...' : 'OFFLINE'}
                         </span>
                     </div>
                 </div>

                 <h1 className="mt-8 text-3xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-white to-zinc-500 tracking-tight">
                     Echo Agent
                 </h1>
                 <p className="mt-4 text-zinc-500 text-sm md:text-base max-w-md text-center px-4">
                     A reasoning multimodal agent capable of analyzing data, detecting misinformation, and providing real-time election insights.
                 </p>

                 {/* ACTION BUTTONS */}
                 <div className="mt-10 flex flex-wrap justify-center gap-4 px-4">
                     
                     {/* START LIVE SESSION BUTTON */}
                     <button 
                        onClick={() => connect()}
                        className="flex items-center gap-3 px-6 md:px-8 py-3 bg-google-primary/90 hover:bg-google-primary text-google-onPrimary border border-google-primary rounded-2xl transition-all group shadow-lg shadow-google-primary/20"
                     >
                         <div className="p-1">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" /></svg>
                         </div>
                         <div className="flex flex-col items-start">
                            <span className="text-sm md:text-base font-bold">Start Live Session</span>
                            <span className="text-[10px] opacity-70">Voice Mode</span>
                         </div>
                     </button>

                     {/* INTEGRITY SCAN */}
                     <button 
                        onClick={() => setIsScanning(true)}
                        className="flex items-center gap-3 px-6 md:px-8 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-google-primary/50 rounded-2xl transition-all group shadow-lg"
                     >
                         <div className="p-2 bg-google-surfaceVariant rounded-lg group-hover:bg-google-primary/20 transition-colors">
                            <svg className="w-6 h-6 text-zinc-400 group-hover:text-google-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" /></svg>
                         </div>
                         <div className="flex flex-col items-start">
                            <span className="text-sm md:text-base font-bold text-white group-hover:text-google-primary transition-colors">Verify Integrity</span>
                            <span className="text-[10px] text-zinc-500">Scan for fraud</span>
                         </div>
                     </button>
                 </div>
             </div>
         )}

         {/* SCANNING MODAL */}
         {isScanning && (
             <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-fade-in">
                 <div className="w-full max-w-md bg-google-surface border border-zinc-700 rounded-3xl p-6 shadow-2xl">
                     <div className="flex justify-between items-center mb-6">
                         <h3 className="text-xl font-light text-white">Election Integrity Scan</h3>
                         <button onClick={closeScan} className="p-1 hover:bg-zinc-800 rounded-full">
                             <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                         </button>
                     </div>

                     {!scanResult ? (
                         <div className="space-y-4">
                             <div className="space-y-2">
                                 <label className="text-xs text-zinc-400 font-bold uppercase">Web Link / Statement</label>
                                 <input 
                                     type="text" 
                                     value={scanText}
                                     onChange={(e) => setScanText(e.target.value)}
                                     placeholder="Paste suspicious link or text..." 
                                     className="w-full bg-black/30 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white focus:border-google-primary focus:outline-none"
                                 />
                             </div>
                             
                             <div className="space-y-2">
                                 <label className="text-xs text-zinc-400 font-bold uppercase">Evidence File</label>
                                 <label className="flex items-center justify-center w-full h-24 border border-dashed border-zinc-700 rounded-xl cursor-pointer hover:bg-zinc-800 transition-colors">
                                     <input 
                                        type="file" 
                                        onChange={(e) => setScanFile(e.target.files?.[0] || null)} 
                                        className="hidden" 
                                        accept="image/*,video/*,text/plain" 
                                     />
                                     <div className="flex flex-col items-center gap-1">
                                         {scanFile ? (
                                             <span className="text-emerald-400 text-sm font-medium">{scanFile.name}</span>
                                         ) : (
                                             <>
                                                 <svg className="w-6 h-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                                                 <span className="text-xs text-zinc-500">Upload Screenshot, Video or Text</span>
                                             </>
                                         )}
                                     </div>
                                 </label>
                             </div>

                             <button 
                                 onClick={handleAnalyze} 
                                 disabled={(!scanText && !scanFile) || isAnalyzing}
                                 className="w-full mt-4 bg-google-primary text-google-onPrimary font-bold py-3 rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
                             >
                                 {isAnalyzing ? (
                                     <>
                                        <div className="w-4 h-4 border-2 border-google-onPrimary border-t-transparent rounded-full animate-spin"></div>
                                        ANALYZING...
                                     </>
                                 ) : (
                                     "SCAN FOR FRAUD"
                                 )}
                             </button>
                         </div>
                     ) : (
                         <div className="animate-slide-in-up">
                             <div className={`p-1 rounded-2xl bg-gradient-to-br ${
                                 scanResult.status === 'FAKE' ? 'from-red-500 to-orange-600' :
                                 scanResult.status === 'TRUE' ? 'from-emerald-500 to-teal-600' :
                                 'from-yellow-400 to-amber-500'
                             }`}>
                                 <div className="bg-google-surface rounded-xl p-6 text-center">
                                     <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4 ${
                                         scanResult.status === 'FAKE' ? 'bg-red-500/10 text-red-500' :
                                         scanResult.status === 'TRUE' ? 'bg-emerald-500/10 text-emerald-500' :
                                         'bg-yellow-500/10 text-yellow-500'
                                     }`}>
                                         {scanResult.status === 'FAKE' ? (
                                             <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                         ) : scanResult.status === 'TRUE' ? (
                                             <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                         ) : (
                                             <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
                                         )}
                                     </div>
                                     <h2 className="text-2xl font-bold text-white mb-1">{scanResult.status}</h2>
                                     <h4 className="text-sm font-medium text-zinc-400 mb-4">{scanResult.title}</h4>
                                     <p className="text-sm text-zinc-300 leading-relaxed bg-zinc-800/50 p-3 rounded-lg border border-zinc-700">
                                         {scanResult.summary}
                                     </p>
                                     <button onClick={() => setScanResult(null)} className="mt-6 text-sm text-zinc-500 hover:text-white underline">
                                         Scan Another
                                     </button>
                                 </div>
                             </div>
                         </div>
                     )}
                 </div>
             </div>
         )}

         {/* ACTIVE STATE */}
         <div className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-700 ${connectionState === ConnectionState.CONNECTED ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
             
             {/* Main Visualizer / Video Container */}
             <div className="relative w-full max-w-3xl aspect-[4/3] md:aspect-video bg-black/40 rounded-3xl overflow-hidden border border-white/5 shadow-2xl flex items-center justify-center">
                 
                 {/* Video Feeds */}
                 <video 
                    ref={videoRef} 
                    muted 
                    playsInline 
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${videoMode === 'camera' ? 'opacity-100' : 'opacity-0'}`}
                 />
                 <video 
                    ref={screenVideoRef} 
                    muted 
                    playsInline 
                    className={`absolute inset-0 w-full h-full object-contain bg-black transition-opacity duration-300 ${videoMode === 'screen' ? 'opacity-100' : 'opacity-0'}`}
                 />

                 {/* Fallback Echo Avatar when no video */}
                 <div className={`relative flex flex-col items-center transition-opacity duration-500 ${videoMode === 'none' ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="relative w-32 h-32 md:w-48 md:h-48">
                        {/* Reaction Emoji Overlay */}
                        {currentReaction && (
                            <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-6xl md:text-8xl animate-slide-in-up z-20 drop-shadow-2xl">
                                {currentReaction}
                            </div>
                        )}
                        <div className="w-full h-full rounded-full overflow-hidden border-4 border-google-surfaceVariant shadow-2xl relative">
                            <img src={ECHO_AVATAR_URL} alt="Echo Live" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-google-primary/10 animate-pulse"></div>
                        </div>
                    </div>
                    {/* Audio Visualizer Waves */}
                    <div className="flex items-center gap-1.5 h-12 mt-8">
                         {[...Array(8)].map((_, i) => (
                            <div key={i} 
                                 className="w-1.5 md:w-2 rounded-full bg-google-primary shadow-[0_0_15px_rgba(168,199,250,0.5)] transition-all duration-75"
                                 style={{ height: `${Math.max(10, activeVolume * (Math.random() * 2 + 0.5) * 1.5)}px` }} 
                            />
                         ))}
                    </div>
                 </div>

                 {/* Controls Bar */}
                 <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-[95%] md:max-w-fit flex items-center justify-center gap-1 md:gap-4 bg-black/70 backdrop-blur-xl px-3 md:px-4 py-3 rounded-2xl border border-white/10 shadow-xl z-50">
                     
                     <button 
                      onClick={() => setIsMuted(!isMuted)}
                      className={`flex flex-col items-center justify-center gap-1 p-2 w-16 md:w-20 rounded-xl transition-all ${isMuted ? 'bg-red-500/20 text-red-400' : 'hover:bg-white/10 text-zinc-300 hover:text-white'}`}
                     >
                        {isMuted ? (
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" /></svg>
                        ) : (
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
                        )}
                        <span className="text-[9px] font-medium tracking-wide uppercase">{isMuted ? 'Unmute' : 'Mute'}</span>
                     </button>
                     
                     <div className="w-px h-8 bg-white/10 mx-1"></div>

                     <button 
                        onClick={() => switchVideoMode('camera')} 
                        className={`flex flex-col items-center justify-center gap-1 p-2 w-16 md:w-20 rounded-xl transition-all ${videoMode === 'camera' ? 'bg-google-primary text-black' : 'hover:bg-white/10 text-zinc-300 hover:text-white'}`}
                     >
                         <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v8.69a.75.75 0 01-1.28.53l-4.72-4.72m-1.06-4.125c1.16 0 2.16.84 2.24 1.956L18 8.25v7.5a2.25 2.25 0 01-2.25 2.25H6.75a2.25 2.25 0 01-2.25-2.25v-7.5a2.25 2.25 0 012.25-2.25h9z" /></svg>
                         <span className="text-[9px] font-medium tracking-wide uppercase">Camera</span>
                     </button>

                     {/* DESKTOP: SHARE SCREEN - Hidden on mobile as per requirement */}
                     <button 
                        onClick={() => switchVideoMode('screen')} 
                        className={`hidden md:flex flex-col items-center justify-center gap-1 p-2 w-16 md:w-20 rounded-xl transition-all ${videoMode === 'screen' ? 'bg-google-primary text-black' : 'hover:bg-white/10 text-zinc-300 hover:text-white'}`}
                     >
                         <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m-9-12V15a2.25 2.25 0 002.25 2.25h9.5A2.25 2.25 0 0019.5 15V5.25m-9-3h9.5a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9.5a2.25 2.25 0 01-2.25-2.25v-9A2.25 2.25 0 0112.75 2.25z" /></svg>
                         <span className="text-[9px] font-medium tracking-wide uppercase leading-tight text-center">Share Screen</span>
                     </button>

                     <div className="w-px h-8 bg-white/10 mx-1"></div>

                     {/* NEW VERIFY BUTTON IN CONTROLS */}
                     <button 
                        onClick={() => setIsScanning(true)} 
                        className="flex flex-col items-center justify-center gap-1 p-2 w-16 md:w-20 rounded-xl hover:bg-white/10 text-zinc-300 hover:text-white transition-all"
                     >
                        <svg className="w-6 h-6 text-google-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" /></svg>
                        <span className="text-[9px] font-medium tracking-wide uppercase">Verify</span>
                     </button>
                     
                     <div className="w-px h-8 bg-white/10 mx-1"></div>

                     <button onClick={disconnect} className="flex flex-col items-center justify-center gap-1 p-2 w-16 md:w-20 rounded-xl bg-red-500/80 hover:bg-red-600 text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        <span className="text-[9px] font-bold tracking-wide uppercase">End</span>
                     </button>
                 </div>
             </div>
         </div>
      </div>
    </div>
  );
};

export default LiveSession;