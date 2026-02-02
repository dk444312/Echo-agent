import React from 'react';
import { Commissioner } from '../types';

interface CommissionersProps {
    commissioners: Commissioner[];
}

const Commissioners: React.FC<CommissionersProps> = ({ commissioners }) => {
    return (
        <div className="flex flex-col h-full bg-google-bg overflow-hidden animate-fade-in font-sans">
             {/* Header */}
             <div className="px-6 py-5 border-b border-white/5 bg-google-surface/30 backdrop-blur-md shrink-0">
                <h1 className="text-2xl font-light text-white tracking-wide">Electoral <span className="text-purple-400 font-normal">Commission</span></h1>
                <p className="text-zinc-500 text-xs tracking-wider uppercase mt-1">Official Board Members</p>
            </div>

            {/* Grid Content */}
            <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    {commissioners.map(comm => (
                        <div key={comm.id} className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col items-center text-center hover:bg-white/10 transition-colors group relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            
                            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-purple-500/30 mb-4 shadow-lg group-hover:scale-105 transition-transform z-10 relative bg-zinc-900">
                                {comm.image_url ? (
                                    <img src={comm.image_url} alt={comm.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                        <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                                    </div>
                                )}
                            </div>
                            
                            <h3 className="text-lg font-medium text-white z-10 relative">{comm.name}</h3>
                            <span className="text-xs font-mono text-purple-400 uppercase tracking-widest mt-2 px-3 py-1 bg-purple-500/10 rounded-full border border-purple-500/20 z-10 relative">{comm.role}</span>
                        </div>
                    ))}

                    {commissioners.length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
                            <div className="w-10 h-10 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin"></div>
                            <p>Loading Commission Data...</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Commissioners;