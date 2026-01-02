import React, { useState } from 'react';
import { 
  TrendingUp, 
  Landmark, 
  Briefcase, 
  Wallet,
  School,
  CheckCircle2,
  Gem,
  ArrowUpRight,
  Layers,
  Users,
  HeartHandshake,
  Globe2,
  BoxSelect,
  Wheat,
  Footprints,
  Mountain,
  Sun,
  BookOpen,
  CreditCard,
  Bell,
  Menu,
  MoreHorizontal,
  ChevronRight,
  Sparkles,
  LayoutGrid
} from 'lucide-react';

const AppDesignKit = () => {
  const [activeTab, setActiveTab] = useState('simulation');
  const [selectedColor, setSelectedColor] = useState('gold');

  // Premium Gold Theme Definition
  const theme = {
    primary: 'bg-amber-500',
    primaryGradient: 'bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600',
    secondary: 'bg-amber-50',
    text: 'text-amber-600',
    textDark: 'text-amber-900',
    border: 'border-amber-200',
    accent: 'text-amber-500',
    glass: 'bg-white/80 backdrop-blur-md border border-white/50',
    cardShadow: 'shadow-[0_8px_30px_rgb(0,0,0,0.04)]'
  };

  // --- 1. Logo Design ---
  const AlchanLogo = ({ size = 'large' }) => {
    const isLarge = size === 'large';
    return (
      <div className={`flex items-center gap-3 ${isLarge ? 'p-6' : 'p-3'} bg-white rounded-2xl ${theme.cardShadow} border border-slate-50 relative overflow-hidden group hover:scale-[1.01] transition-transform`}>
        {/* Shine Effect */}
        <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-amber-100/50 to-transparent rounded-bl-full pointer-events-none"></div>
        
        {/* Symbol */}
        <div className={`${isLarge ? 'w-12 h-12' : 'w-8 h-8'} rounded-xl ${theme.primaryGradient} flex items-center justify-center text-white shadow-lg shadow-amber-200`}>
           <Wheat size={isLarge ? 24 : 16} strokeWidth={2.5} className="drop-shadow-sm" />
        </div>
        
        {/* Typography */}
        <div className="flex flex-col justify-center z-10">
           <h3 className={`${isLarge ? 'text-2xl' : 'text-lg'} font-bold text-slate-800 leading-none tracking-tight flex items-baseline gap-1.5`}>
             알찬 <span className={`font-serif italic text-amber-600 ${isLarge ? 'text-2xl' : 'text-lg'}`}>Class</span>
           </h3>
           {isLarge && (
             <span className="text-[10px] text-slate-400 font-medium tracking-[0.25em] mt-1.5 uppercase ml-0.5">
               Premium Economy
             </span>
           )}
        </div>
      </div>
    );
  };

  // --- 2. Iconography Collection ---
  const IconCollection = () => (
    <div className="grid grid-cols-4 gap-6">
      {[
        { Icon: Wheat, label: 'Main' },
        { Icon: TrendingUp, label: 'Asset' },
        { Icon: Wallet, label: 'Wallet' },
        { Icon: School, label: 'Class' },
        { Icon: Gem, label: 'Reward' },
        { Icon: Briefcase, label: 'Job' },
        { Icon: Landmark, label: 'Bank' },
        { Icon: Sparkles, label: 'Item' },
      ].map((item, idx) => (
        <div key={idx} className="flex flex-col items-center gap-3 group">
          <div className={`w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-amber-600 group-hover:bg-amber-50 group-hover:shadow-md transition-all duration-300`}>
            <item.Icon size={24} strokeWidth={1.5} />
          </div>
          <span className="text-xs text-slate-400 font-medium group-hover:text-slate-600">{item.label}</span>
        </div>
      ))}
    </div>
  );

  // --- 3. Final Simulation Components ---
  
  // Asset Card (Credit Card Style)
  const AssetCard = () => (
    <div className={`w-full h-48 rounded-[1.5rem] p-6 relative overflow-hidden ${theme.primaryGradient} text-white shadow-xl shadow-amber-200/50 flex flex-col justify-between group cursor-pointer hover:shadow-2xl hover:shadow-amber-300/40 transition-all`}>
      {/* Background Pattern */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -mr-20 -mt-20 blur-3xl group-hover:opacity-10 transition-opacity"></div>
      <div className="absolute bottom-0 left-0 w-40 h-40 bg-black opacity-5 rounded-full -ml-10 -mb-10 blur-2xl"></div>
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>

      {/* Top Row */}
      <div className="flex justify-between items-start relative z-10">
        <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/20">
          <Wheat size={14} className="text-amber-100" />
          <span className="text-xs font-bold tracking-wider text-amber-50">PREMIUM MEMBER</span>
        </div>
        <div className="opacity-80"><Globe2 size={20} /></div>
      </div>

      {/* Balance */}
      <div className="relative z-10 mt-2">
        <span className="text-amber-100 text-xs font-medium mb-1 block">Total Assets</span>
        <div className="flex items-baseline gap-1">
          <h2 className="text-3xl font-bold tracking-tight">21억 5,000만</h2>
          <span className="text-lg font-medium opacity-80">원</span>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="flex justify-between items-end relative z-10">
        <div className="text-xs font-mono text-amber-100/80 tracking-widest">**** **** 8829</div>
        <div className="flex flex-col items-end">
           <span className="text-[10px] text-amber-200">Profit</span>
           <div className="flex items-center gap-1 text-white font-bold bg-white/20 px-2 py-0.5 rounded-lg backdrop-blur-sm">
             <TrendingUp size={12} />
             <span>+15.4%</span>
           </div>
        </div>
      </div>
    </div>
  );

  // Quick Action Button
  const ActionButton = ({ icon: Icon, label, highlight = false }) => (
    <div className="flex flex-col items-center gap-2 group cursor-pointer">
      <div className={`w-16 h-16 rounded-[1.2rem] flex items-center justify-center transition-all duration-300 shadow-sm
        ${highlight 
          ? 'bg-slate-800 text-white shadow-lg shadow-slate-200 hover:bg-slate-700 hover:scale-105' 
          : 'bg-white text-slate-500 border border-slate-100 hover:border-amber-200 hover:text-amber-600 hover:bg-amber-50 hover:scale-105'
        }
      `}>
        <Icon size={24} strokeWidth={highlight ? 2 : 1.5} />
      </div>
      <span className="text-xs font-medium text-slate-600">{label}</span>
    </div>
  );

  // List Item (Toss Style)
  const ListItem = ({ icon: Icon, title, subtitle, amount, isPositive }) => (
    <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-50 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-full ${theme.secondary} flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform`}>
          <Icon size={18} />
        </div>
        <div>
          <h4 className="font-bold text-slate-800 text-sm">{title}</h4>
          <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="text-right">
        <span className={`block font-bold text-sm ${isPositive ? 'text-rose-500' : 'text-slate-800'}`}>
          {isPositive ? '+' : ''}{amount}
        </span>
        {isPositive && <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded ml-auto w-fit mt-1">입금완료</span>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800 p-4 md:p-8">
      {/* Header Area */}
      <header className="max-w-6xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2 text-slate-500 text-sm font-mono">
            <span>DESIGN SYSTEM v2.1</span>
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-bold">FINAL</span>
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 leading-tight">
            알찬 <span className="font-serif italic text-amber-600">Class</span> Kit
          </h1>
          <p className="text-slate-500 mt-2">세련된 금융 경험을 위한 프리미엄 디자인 시스템</p>
        </div>
        
        {/* Tab Controls */}
        <div className="bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm flex gap-1">
          {['naming', 'icons', 'simulation'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === tab 
                  ? 'bg-slate-800 text-white shadow-md' 
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {tab === 'naming' ? '네이밍 & 로고' : tab === 'icons' ? '아이콘 시스템' : '최종 시뮬레이션'}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-6xl mx-auto">
        {/* TAB 1: NAMING & LOGO */}
        {activeTab === 'naming' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-8 relative overflow-hidden">
               <div className="absolute inset-0 bg-slate-50/50" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: 0.3 }}></div>
               <div className="relative z-10 transform scale-125">
                 <AlchanLogo size="large" />
               </div>
               <div className="text-center relative z-10 max-w-sm">
                 <h3 className="font-bold text-slate-800 mb-2">Design Concept: "Harvest & Class"</h3>
                 <p className="text-sm text-slate-500 leading-relaxed">
                   '알찬'의 실속과 'Class'의 품격을 결합했습니다. 
                   황금빛 그라데이션은 수확의 기쁨과 풍요로운 자산을 상징하며, 
                   세리프 폰트와 모던한 산세리프의 조화는 전통과 혁신의 균형을 의미합니다.
                 </p>
               </div>
            </div>
            
            <div className="space-y-6">
              <div className="bg-slate-900 p-8 rounded-[2rem] flex items-center justify-center">
                 {/* Dark Mode Preview */}
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white">
                      <Wheat size={20} strokeWidth={2.5} />
                    </div>
                    <div className="flex flex-col justify-center">
                      <h3 className="text-xl font-bold text-white leading-none flex items-baseline gap-1.5">
                        알찬 <span className="font-serif italic text-amber-400">Class</span>
                      </h3>
                    </div>
                 </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-3">Primary Color</span>
                    <div className="w-full h-16 rounded-xl bg-amber-500 shadow-lg shadow-amber-200 mb-2"></div>
                    <span className="font-mono text-xs text-slate-600">Amber-500</span>
                 </div>
                 <div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-3">Typography</span>
                    <div className="h-16 flex flex-col items-center justify-center">
                       <span className="font-bold text-slate-800 text-lg">Sans-Serif</span>
                       <span className="font-serif italic text-amber-600 text-lg">Serif Italic</span>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ICONS */}
        {activeTab === 'icons' && (
          <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex justify-between items-center mb-10 border-b border-slate-100 pb-6">
               <h3 className="text-xl font-bold text-slate-800">Icon System</h3>
               <span className="text-sm text-slate-400 bg-slate-50 px-3 py-1 rounded-full">Lucide React Based</span>
             </div>
             
             <div className="max-w-3xl mx-auto py-8">
               <IconCollection />
             </div>

             <div className="mt-12 bg-slate-50 rounded-2xl p-6 text-center">
               <p className="text-sm text-slate-500">
                 아이콘은 <span className="font-bold text-slate-800">Rounded-2xl</span> 컨테이너와 함께 사용하며,<br/>
                 Hover 시 <span className="font-bold text-amber-600">Amber 컬러</span>로 강조되는 인터랙션을 가집니다.
               </p>
             </div>
          </div>
        )}

        {/* TAB 3: SIMULATION */}
        {activeTab === 'simulation' && (
          <div className="flex flex-col lg:flex-row gap-12 items-center justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
             
             {/* Phone Device Mockup */}
             <div className="relative">
                {/* Device Frame */}
                <div className="w-[360px] h-[740px] bg-slate-900 rounded-[3rem] p-3 shadow-2xl relative z-20 ring-4 ring-slate-200/50">
                  <div className="w-full h-full bg-slate-50 rounded-[2.5rem] overflow-hidden relative flex flex-col font-sans">
                    
                    {/* Status Bar Mock */}
                    <div className="h-12 w-full flex justify-between items-center px-6 pt-2 z-30 absolute top-0 left-0">
                      <span className="text-xs font-bold text-slate-800">9:41</span>
                      <div className="flex gap-1.5">
                        <div className="w-4 h-4 rounded-full bg-slate-800 opacity-20"></div>
                        <div className="w-4 h-4 rounded-full bg-slate-800 opacity-20"></div>
                      </div>
                    </div>

                    {/* App Header */}
                    <div className="pt-14 px-6 pb-2 flex justify-between items-center bg-white z-20">
                       <div className="flex items-center gap-1">
                          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-white">
                             <Wheat size={16} />
                          </div>
                          {/* Updated Header Title */}
                          <span className="font-bold text-lg text-slate-800 ml-1">
                            알찬 <span className="font-serif italic text-amber-600">Class</span>
                          </span>
                       </div>
                       <div className="flex gap-3">
                          <Bell size={24} className="text-slate-400" />
                          <Menu size={24} className="text-slate-800" />
                       </div>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
                       <div className="px-6 py-4 space-y-6">
                          
                          {/* 1. Asset Card Section */}
                          <div className="transform hover:scale-[1.02] transition-transform duration-300">
                             <AssetCard />
                          </div>

                          {/* 2. Quick Actions */}
                          <div>
                            <div className="flex justify-between items-center mb-4">
                              <h3 className="font-bold text-slate-800 text-lg">My Menu</h3>
                              <ChevronRight size={18} className="text-slate-400" />
                            </div>
                            <div className="flex justify-between px-2">
                               <ActionButton icon={School} label="교실" highlight={true} />
                               <ActionButton icon={Briefcase} label="직업" />
                               <ActionButton icon={Landmark} label="은행" />
                               <ActionButton icon={MoreHorizontal} label="전체" />
                            </div>
                          </div>

                          {/* 3. Transaction List */}
                          <div>
                            <div className="flex justify-between items-center mb-4 mt-2">
                              <h3 className="font-bold text-slate-800 text-lg">최근 활동</h3>
                              <span className="text-xs text-slate-400">전체보기</span>
                            </div>
                            <div className="flex flex-col gap-3">
                               <ListItem 
                                 icon={Briefcase} 
                                 title="아르바이트 급여" 
                                 subtitle="오늘, 14:30" 
                                 amount="500,000원" 
                                 isPositive={true} 
                               />
                               <ListItem 
                                 icon={BookOpen} 
                                 title="수학 문제집 구매" 
                                 subtitle="어제, 18:20" 
                                 amount="-15,000원" 
                                 isPositive={false} 
                               />
                               <ListItem 
                                 icon={TrendingUp} 
                                 title="투자 수익 정산" 
                                 subtitle="3일 전" 
                                 amount="24,500원" 
                                 isPositive={true} 
                               />
                            </div>
                          </div>

                       </div>
                    </div>

                    {/* Bottom Navigation */}
                    <div className="absolute bottom-0 left-0 w-full h-20 bg-white border-t border-slate-100 flex justify-around items-center px-2 pb-2 z-30">
                       <div className="flex flex-col items-center gap-1 p-2">
                          <div className="text-amber-600"><School size={24} fill="currentColor" fillOpacity={0.1} /></div>
                          <span className="text-[10px] font-bold text-amber-600">홈</span>
                       </div>
                       <div className="flex flex-col items-center gap-1 p-2 opacity-50">
                          <div className="text-slate-400"><TrendingUp size={24} /></div>
                          <span className="text-[10px] font-medium text-slate-400">투자</span>
                       </div>
                       <div className="flex flex-col items-center gap-1 p-2 opacity-50">
                          <div className="text-slate-400"><Sparkles size={24} /></div>
                          <span className="text-[10px] font-medium text-slate-400">상점</span>
                       </div>
                       <div className="flex flex-col items-center gap-1 p-2 opacity-50">
                          <div className="text-slate-400"><Users size={24} /></div>
                          <span className="text-[10px] font-medium text-slate-400">내정보</span>
                       </div>
                    </div>
                  
                  </div>
                </div>
                
                {/* Reflection/Shadow beneath phone */}
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-[300px] h-8 bg-black/20 blur-xl rounded-full"></div>
             </div>

             {/* Description Panel */}
             <div className="max-w-xs space-y-6">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                   <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mb-4">
                      <Sparkles size={20} fill="currentColor" />
                   </div>
                   <h3 className="font-bold text-slate-800 mb-2">프리미엄 경험</h3>
                   <p className="text-sm text-slate-500 leading-relaxed">
                      신용카드 스타일의 자산 카드와 직관적인 아이콘 배치는 학생들에게 VIP가 된 듯한 경험을 제공합니다.
                   </p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                   <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 mb-4">
                      <LayoutGrid size={20} />
                   </div>
                   <h3 className="font-bold text-slate-800 mb-2">정보의 계층화</h3>
                   <p className="text-sm text-slate-500 leading-relaxed">
                      가장 중요한 자산 정보는 상단에 강조하고, 자주 쓰는 메뉴는 중앙에 배치하여 사용성을 극대화했습니다.
                   </p>
                </div>
             </div>

          </div>
        )}
      </main>
    </div>
  );
};

export default AppDesignKit;