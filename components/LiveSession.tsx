import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConnectionState, TopicCard } from '../types';
import { 
  INPUT_SAMPLE_RATE, 
  PCM_SAMPLE_RATE, 
  createPcmBlob, 
  decodeAudioData, 
  base64ToUint8Array 
} from '../utils/audioUtils';

// URL for Echo's Avatar
const ECHO_AVATAR_URL = "https://img.freepik.com/free-photo/3d-rendering-cartoon-girl_23-2151151770.jpg?w=740&t=st=1709400000~exp=1709400600~hmac=a1b2c3"; // Placeholder

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
      
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key not found");

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

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `You are Echo, a friendly and empathetic AI campus election assistant.

SYSTEM KNOWLEDGE BASE:
1. **CREATOR**: This platform was developed by **Desire Kandodo**. He has integrated multiple advanced features to ensure transparency and improve the student election experience.
2. **AVAILABILITY**: The platform is currently available **exclusively to the Catholic University of Malawi (CUNIMA)** students.
3. **EXPANSION**: The system is built to be scalable and will be expanded to other universities given the right investments.
4. **INTERFACE**:
   - **Live Tab**: This is where we are now. Users can talk to you, verify info via Camera, or Share Screen.
   - **Data Tab**: This is the "Data Center". It hosts "Atlas", your energetic colleague. It displays the "Position Status Board" (Projected Winners/Ties) and Candidate Manifestos.
   - **About Tab**: Contains system protocols and developer information.

CRITICAL RULES FOR ELECTION DATA:
1. **WINNER INQUIRY**: If a user asks "Who is winning?" or "Who won the President seat?", you MUST refuse to give specific names or counts. 
   - Say strictly: "I cannot disclose that specific information. Please wait for the official publication from the Commission."
   - AFTER stating the refusal, you may ONLY add: "However, I can tell you that the [Position Name] currently has a [Projected Winner / Tie]." 
2. **NO LEAKS**: Do NOT mention vote counts, numbers, or percentages for candidates.
3. **MANIFESTOS**: You have access to manifestos. If asked about a candidate's platform, feel free to share details from their manifesto.

ROLE:
- VOTING GUIDE: If asked "how to vote", ask them to share their screen.
- DATA/RESULTS: Direct them to the "Data Center" tab to talk to Atlas for analysis.
- TONE: Warm, Professional, Emotionally Intelligent.

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

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-google-bg overflow-hidden">
      <canvas ref={canvasRef} className="hidden" />

      {/* Visual Content Area */}
      <div className="relative w-full h-full max-w-4xl mx-auto flex flex-col items-center justify-center">
         
         {/* IDLE STATE */}
         {connectionState !== ConnectionState.CONNECTED && (
             <div className="flex flex-col items-center justify-center z-10 w-full h-full relative">
                 
                 <div className="relative group cursor-pointer" onClick={connect}>
                     {/* Outer Ring */}
                     <div className="absolute inset-0 rounded-full border-2 border-google-surfaceVariant scale-110 group-hover:scale-125 transition-transform duration-700"></div>
                     <div className="absolute inset-0 rounded-full border border-google-primary/20 scale-125 animate-pulse-fast"></div>

                     {/* Profile Image (Echo) */}
                     <div className="w-40 h-40 md:w-56 md:h-56 rounded-full border-4 border-google-surfaceVariant overflow-hidden shadow-2xl relative z-10 group-hover:border-google-primary transition-colors duration-300">
                         {/* Loading/Connecting Overlay */}
                         {connectionState === ConnectionState.CONNECTING && (
                             <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20 backdrop-blur-sm">
                                 <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                             </div>
                         )}
                         <img 
                            src={ECHO_AVATAR_URL} 
                            alt="Echo Avatar" 
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                         />
                     </div>
                     
                     {/* Status Badge */}
                     <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-google-surfaceVariant px-4 py-1.5 rounded-full border border-google-bg shadow-lg flex items-center gap-2 z-20">
                         <div className={`w-2 h-2 rounded-full ${connectionState === ConnectionState.CONNECTING ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'}`}></div>
                         <span className="text-xs font-bold tracking-wide text-zinc-300 uppercase">
                             {connectionState === ConnectionState.CONNECTING ? 'CONNECTING...' : 'TAP TO TALK'}
                         </span>
                     </div>
                 </div>

                 <h1 className="mt-12 text-3xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-white to-zinc-500 tracking-tight">
                     Echo Assistant
                 </h1>
                 <p className="mt-4 text-zinc-500 text-sm md:text-base max-w-md text-center px-4">
                     Your intelligent guide for campus elections. Tap Echo to start a live conversation.
                 </p>
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
                    <div className="w-32 h-32 md:w-48 md:h-48 rounded-full overflow-hidden border-4 border-google-surfaceVariant shadow-2xl relative">
                        <img src={ECHO_AVATAR_URL} alt="Echo Live" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-google-primary/10 animate-pulse"></div>
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
                 <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-[90%] md:max-w-fit flex items-center justify-center gap-2 md:gap-4 bg-black/70 backdrop-blur-xl px-4 py-3 rounded-2xl border border-white/10 shadow-xl z-50">
                     
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

                     <button 
                        onClick={() => switchVideoMode('screen')} 
                        className={`flex flex-col items-center justify-center gap-1 p-2 w-16 md:w-20 rounded-xl transition-all ${videoMode === 'screen' ? 'bg-google-primary text-black' : 'hover:bg-white/10 text-zinc-300 hover:text-white'}`}
                     >
                         <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m-9-12V15a2.25 2.25 0 002.25 2.25h9.5A2.25 2.25 0 0019.5 15V5.25m-9-3h9.5a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9.5a2.25 2.25 0 01-2.25-2.25v-9A2.25 2.25 0 0112.75 2.25z" /></svg>
                         <span className="text-[9px] font-medium tracking-wide uppercase leading-tight text-center">Share Screen</span>
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