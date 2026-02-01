import React from 'react';

const About: React.FC = () => {
    return (
        <div className="flex flex-col h-full bg-google-bg overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 font-sans">
            {/* Header */}
            <div className="px-6 py-5 border-b border-white/5 bg-google-surface/30 backdrop-blur-md flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-2xl font-light text-white tracking-wide">About <span className="text-cyan-400 font-normal">Echo</span></h1>
                    <p className="text-zinc-500 text-xs tracking-wider uppercase mt-1">System Version 3.0.1</p>
                </div>
                <div className="hidden md:block">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/30 border border-cyan-500/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></div>
                        <span className="text-[10px] font-mono text-cyan-400">SYSTEM ONLINE</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
                
                {/* Guide Section */}
                <div className="h-full overflow-y-auto p-6 md:p-10 custom-scrollbar">
                    <div className="space-y-10 max-w-4xl mx-auto">
                        
                        <section className="group">
                            <h3 className="text-sm font-mono text-cyan-400 mb-4 uppercase tracking-widest flex items-center gap-3 opacity-80 group-hover:opacity-100 transition-opacity">
                                <span className="w-6 h-px bg-cyan-500/50"></span>
                                Protocol 1: Verification
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-white/5 p-5 rounded-sm border-l-2 border-transparent hover:border-cyan-400 transition-all cursor-default">
                                    <div className="flex items-center gap-3 mb-2 text-zinc-200">
                                        <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v8.69a.75.75 0 01-1.28.53l-4.72-4.72m-1.06-4.125c1.16 0 2.16.84 2.24 1.956L18 8.25v7.5a2.25 2.25 0 01-2.25 2.25H6.75a2.25 2.25 0 01-2.25-2.25v-7.5a2.25 2.25 0 012.25-2.25h9z" /></svg>
                                        <span className="font-medium text-sm">Visual Input</span>
                                    </div>
                                    <p className="text-xs text-zinc-500 leading-relaxed">
                                        Activate camera feed to allow Echo to analyze physical campaign materials, posters, or identification documents.
                                    </p>
                                </div>
                                <div className="bg-white/5 p-5 rounded-sm border-l-2 border-transparent hover:border-cyan-400 transition-all cursor-default">
                                    <div className="flex items-center gap-3 mb-2 text-zinc-200">
                                        <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m-9-12V15a2.25 2.25 0 002.25 2.25h9.5A2.25 2.25 0 0019.5 15V5.25m-9-3h9.5a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9.5a2.25 2.25 0 01-2.25-2.25v-9A2.25 2.25 0 0112.75 2.25z" /></svg>
                                        <span className="font-medium text-sm">Digital Audit</span>
                                    </div>
                                    <p className="text-xs text-zinc-500 leading-relaxed">
                                        Share screen to let Echo navigate voting portals, cross-reference candidate claims, or verify manifesto details.
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section className="group">
                             <h3 className="text-sm font-mono text-cyan-400 mb-4 uppercase tracking-widest flex items-center gap-3 opacity-80 group-hover:opacity-100 transition-opacity">
                                <span className="w-6 h-px bg-cyan-500/50"></span>
                                Protocol 2: Intelligence
                            </h3>
                            <div className="bg-white/5 p-6 rounded-sm border border-white/5 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <svg className="w-24 h-24 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M3 3v18h18V3H3zm16 16H5V5h14v14zM7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z"/></svg>
                                </div>
                                <h4 className="text-white font-medium mb-2 z-10 relative">Atlas Analytics Engine</h4>
                                <p className="text-xs text-zinc-400 max-w-md leading-relaxed z-10 relative">
                                    Real-time data stream processing. Tracks "Winner Projected" or "Tie" states without compromising specific vote count confidentiality. Full manifesto database access.
                                </p>
                            </div>
                        </section>

                        <section className="group">
                            <h3 className="text-sm font-mono text-cyan-400 mb-4 uppercase tracking-widest flex items-center gap-3 opacity-80 group-hover:opacity-100 transition-opacity">
                                <span className="w-6 h-px bg-cyan-500/50"></span>
                                System Origin: Developer
                            </h3>
                            <div className="bg-white/5 p-6 rounded-sm border-l-2 border-transparent hover:border-cyan-400 transition-all cursor-default">
                                <div className="flex items-center gap-3 mb-2 text-zinc-200">
                                    <div className="w-8 h-8 rounded-full bg-cyan-950/50 flex items-center justify-center border border-cyan-500/20">
                                        <span className="font-mono text-xs text-cyan-400 font-bold">DK</span>
                                    </div>
                                    <span className="font-medium text-sm">Desire Kandodo</span>
                                </div>
                                <p className="text-xs text-zinc-500 leading-relaxed mb-3">
                                    Lead Developer & Architect.
                                </p>
                                <p className="text-xs text-zinc-400 leading-relaxed">
                                    Designed specifically for the <strong>Catholic University of Malawi</strong>, Echo integrates advanced AI modalities to ensure election integrity and student engagement. While currently exclusive to CUNIMA, the architecture is scalable and ready for expansion to other institutions with strategic investment.
                                </p>
                            </div>
                        </section>

                    </div>
                    {/* Bottom spacing for mobile navigation */}
                    <div className="h-20 md:hidden"></div>
                </div>

            </div>
        </div>
    );
};

export default About;