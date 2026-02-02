import React from 'react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const navItems = [
    { id: 'session', icon: (active: boolean) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 2} className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>, label: 'Live' },
    { id: 'analytics', icon: (active: boolean) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 2} className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" /></svg>, label: 'Data' },
    { id: 'commissioners', icon: (active: boolean) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 2} className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>, label: 'Board' },
    { id: 'about', icon: (active: boolean) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 2} className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>, label: 'About' },
  ];

  return (
    <>
      {/* Desktop Sidebar (Rail) */}
      <div className="hidden md:flex w-20 h-full bg-google-bg border-r border-google-surfaceVariant flex-col items-center py-6 gap-2 z-20 flex-shrink-0">
        <div className="w-10 h-10 bg-google-primary text-google-onPrimary rounded-xl flex items-center justify-center font-bold text-lg mb-6 shadow-md">
          E
        </div>
        {navItems.map((item) => {
           const isActive = activeTab === item.id;
           return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className="group flex flex-col items-center gap-1 w-16 py-3 rounded-full transition-all"
            >
              <div className={`p-1.5 rounded-full transition-colors ${isActive ? 'bg-google-primary/20 text-google-primary' : 'text-zinc-400 group-hover:text-zinc-200 group-hover:bg-google-surfaceVariant'}`}>
                 {item.icon(isActive)}
              </div>
              <span className={`text-[10px] font-medium ${isActive ? 'text-google-primary' : 'text-zinc-500'}`}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-google-surface border-t border-google-surfaceVariant flex items-center justify-around z-50 pb-safe">
        {navItems.map((item) => {
           const isActive = activeTab === item.id;
           return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className="flex flex-col items-center justify-center w-full h-full gap-1 active:scale-95 transition-transform"
            >
              <div className={`p-1 rounded-full ${isActive ? 'bg-google-primary/20 text-google-primary' : 'text-zinc-400'}`}>
                {item.icon(isActive)}
              </div>
              <span className={`text-[10px] font-medium ${isActive ? 'text-google-primary' : 'text-zinc-500'}`}>
                {item.label}
              </span>
            </button>
           )
        })}
      </div>
    </>
  );
};

export default Sidebar;