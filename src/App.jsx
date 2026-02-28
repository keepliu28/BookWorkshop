import React, { useState, useEffect, useRef } from 'react';
// Firebase 核心组件
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, collection, doc, onSnapshot, query, 
  addDoc, deleteDoc, serverTimestamp 
} from 'firebase/firestore';
// UI 图标库
import { 
  Book, Trash2, Zap, Quote, PenTool, Loader2, Library, 
  Cpu, Box, CheckCircle, Clock, HardDrive, BarChart3, Settings, ShieldCheck, Key
} from 'lucide-react';
// 导出与压缩库 (需通过 npm install 安装)
import * as htmlToImage from 'html-to-image';
import JSZip from 'jszip';

// --- 配置区：请在此处填入您的 Firebase 密钥 ---
const firebaseConfig = {
  apiKey: "AIzaSyCsNTQAwb2op2h9uyWyKXW204jrEgRf8LA",
  authDomain: "xhs-book.firebaseapp.com",
  projectId: "xhs-book",
  storageBucket: "xhs-book.firebasestorage.app",
  messagingSenderId: "33908972500",
  appId: "1:33908972500:web:a71f9b6895260882ccd441",
};

const APP_ID = 'master-book-production-stable';
const COLORS = [
  '#1A1A1A', '#2E3B2E', '#3D2B1F', '#2B3D41', '#4A4A4A', '#5C2D2D', '#2C3E50', '#1F3A3D'
];

// --- 增强版网络请求工具 ---
const fetchWithRetry = async (url, options, retries = 5, delay = 1000) => {
  try {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return JSON.parse(text);
  } catch (error) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }
    throw error;
  }
};

const safeParseAIContent = (rawText) => {
  if (!rawText) return null;
  try {
    return JSON.parse(rawText);
  } catch (e) {
    const match = rawText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (innerE) { return null; }
    }
    return null;
  }
};

const yieldToUI = (ms = 400) => new Promise(resolve => setTimeout(resolve, ms));

const App = () => {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('generator');
  const [bookNameInput, setBookNameInput] = useState('');
  const [projects, setProjects] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [productionBuffer, setProductionBuffer] = useState([]); 
  const [renderingIndex, setRenderingIndex] = useState(-1); 
  const [slotStatus, setSlotStatus] = useState([{ name: '-', status: 'waiting' }, { name: '-', status: 'waiting' }]);
  const [exportProgress, setExportProgress] = useState("");
  const [autoStage, setAutoStage] = useState('idle');

  // --- API Key 状态管理 ---
  const [geminiKey, setGeminiKey] = useState('');
  const [inputKey, setInputKey] = useState('');

  const mainCoverRef = useRef(null);
  const quoteRefs = useRef([]);

  // 1. 初始化：加载本地 Key 并连接 Firebase
  useEffect(() => {
    const savedKey = localStorage.getItem('GEMINI_API_KEY');
    if (savedKey) {
      setGeminiKey(savedKey);
      setInputKey(savedKey);
    } else {
      setActiveTab('settings'); // 初始无 Key 时强制引导
    }

    const appInstance = initializeApp(firebaseConfig);
    const authInstance = getAuth(appInstance);
    signInAnonymously(authInstance).catch(console.error);
    const unsubscribe = onAuthStateChanged(authInstance, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 数据库同步
  useEffect(() => {
    if (!user) return;
    const db = getFirestore();
    const q = query(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'projects'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    });
    return () => unsubscribe();
  }, [user]);

  // --- Key 管理逻辑 ---
  const saveApiKey = () => {
    if (!inputKey.trim()) return;
    localStorage.setItem('GEMINI_API_KEY', inputKey.trim());
    setGeminiKey(inputKey.trim());
    alert("API Key 已安全保存至本地");
    setActiveTab('generator');
  };

  const clearApiKey = () => {
    localStorage.removeItem('GEMINI_API_KEY');
    setGeminiKey('');
    setInputKey('');
    alert("本地 Key 已清除");
  };

  const updateSlot = (index, data) => {
    setSlotStatus(prev => {
      const newSlots = [...prev];
      newSlots[index] = { ...newSlots[index], ...data };
      return newSlots;
    });
  };

  const handleProductionFlow = async () => {
    if (!geminiKey) return setActiveTab('settings');
    if (isProcessing) return;
    
    setIsProcessing(true);
    setAutoStage('generating');
    setProductionBuffer([]);
    setRenderingIndex(-1);
    setSlotStatus([{ name: '探测热度中...', status: 'loading' }, { name: '探测热度中...', status: 'loading' }]);
    setExportProgress("正在接入大数据阵列扫描热点...");

    let targets = [];
    const archivedTitles = projects.map(p => p.bookName);

    if (bookNameInput.trim()) {
      targets.push(String(bookNameInput.trim()));
      updateSlot(0, { name: targets[0], status: 'loading' });
    }

    try {
      const trendPrompt = `返回当前热度排名前30的书单。只返回 JSON 数组格式：[{"title": "书名"}]`;
      const result = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: trendPrompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      
      const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      const rawTrends = safeParseAIContent(rawText) || [];
      const availableTrends = rawTrends.filter(t => t && t.title && !archivedTitles.includes(t.title) && !targets.includes(t.title));
      
      while (targets.length < 2 && availableTrends.length > 0) {
        const nextBook = String(availableTrends.shift().title);
        targets.push(nextBook);
        updateSlot(targets.length - 1, { name: nextBook, status: 'loading' });
      }
    } catch (e) { console.error("Trend Discovery Failed:", e); }

    try {
      const results = await Promise.all(targets.map((target, idx) => {
        updateSlot(idx, { status: 'generating' });
        return executeGenerationTask(target);
      }));
      setProductionBuffer(results);
      setAutoStage('rendering');
    } catch (error) {
      setExportProgress("产线阻塞，请检查 API 配额或网络");
      setIsProcessing(false);
    }
  };

  const executeGenerationTask = async (targetBook) => {
    const systemPrompt = `针对《${targetBook}》撰写小红书笔记。JSON格式：{"title": "短标题", "fullContent": "正文", "quotes": ["摘录1", "摘录2", "摘录3"], "tags": ["标签"]}`;
    const result = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `书名：${targetBook}` }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { responseMimeType: "application/json" }
      })
    });
    const content = safeParseAIContent(result.candidates?.[0]?.content?.parts?.[0]?.text);
    return { ...content, color: COLORS[Math.floor(Math.random() * COLORS.length)], originalBook: String(targetBook) };
  };

  useEffect(() => {
    if (productionBuffer.length >= 1 && autoStage === 'rendering') {
      handleFinalSequentialPackaging();
    }
  }, [productionBuffer, autoStage]);

  const handleFinalSequentialPackaging = async () => {
    const zip = new JSZip();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const exportOptions = { pixelRatio: 2, backgroundColor: '#FAF9F6', width: 1242, height: 1656 };

    try {
      await document.fonts.ready;
      for (let idx = 0; idx < productionBuffer.length; idx++) {
        const book = productionBuffer[idx];
        setRenderingIndex(idx);
        updateSlot(idx, { status: 'rendering' });
        await yieldToUI(800); 

        const folder = zip.folder(`${dateStr}_${book.originalBook}`);
        setExportProgress(`正在对《${book.originalBook}》执行物理采样...`);

        if (mainCoverRef.current) {
          const imgData = await htmlToImage.toPng(mainCoverRef.current, exportOptions);
          folder.file(`01_封面_${book.originalBook}.png`, imgData.split(',')[1], {base64: true});
        }

        for (let i = 0; i < (book.quotes || []).length; i++) {
          await yieldToUI(300);
          if (quoteRefs.current[i]) {
            const qImg = await htmlToImage.toPng(quoteRefs.current[i], exportOptions);
            folder.file(`0${i + 2}_摘录_${i + 1}.png`, qImg.split(',')[1], {base64: true});
          }
        }

        folder.file(`${book.originalBook}_文案.md`, `# ${book.title}\n\n${book.fullContent}`);
        updateSlot(idx, { status: 'done' });
        setRenderingIndex(-1);
        await yieldToUI(500);
      }

      setExportProgress("封装数据资产包...");
      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `${dateStr}_热度书单.zip`;
      link.click();
      
      for (const book of productionBuffer) { await autoArchiveBook(book.originalBook); }
      setExportProgress("产线清空，任务圆满完成！");
      setTimeout(() => {
        setIsProcessing(false); setAutoStage('idle'); setProductionBuffer([]); setSlotStatus([{ name: '-', status: 'waiting' }, { name: '-', status: 'waiting' }]);
      }, 2000);
    } catch (err) { console.error(err); setIsProcessing(false); }
  };

  const autoArchiveBook = async (bookName) => {
    const db = getFirestore();
    try { await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'projects'), { bookName, createdAt: serverTimestamp() }); } catch (e) {}
  };

  const calculateResponsiveStyles = (text, type) => {
    const len = text ? text.length : 0;
    if (type === 'mainTitle') {
      if (len <= 6) return { fontSize: '180px', margin: '100px', lineHeight: 1.15 };
      return { fontSize: '120px', margin: '60px', lineHeight: 1.25 };
    }
    return { fontSize: '56px', lineHeight: 1.8, padding: '0 120px' };
  };

  const IndustrialZenCard = ({ title, color, subtitle, type = 'main', innerRef }) => {
    const styles = calculateResponsiveStyles(title, type === 'main' ? 'mainTitle' : 'quoteText');
    return (
      <div ref={innerRef} style={{ width: '1242px', height: '1656px', backgroundColor: '#FAF9F6', border: `64px solid ${color}`, display: 'flex', flexDirection: 'column', position: 'relative', fontFamily: "'Noto Serif SC', serif", overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '160px', left: '0', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '24px', opacity: 0.4, fontSize: '32px', color }}>
          <PenTool size={42} /><span>书 间 回 想 · ECHOES</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: styles.padding }}>
          {type === 'main' ? (
            <>
              <h1 style={{ color, fontSize: styles.fontSize, fontWeight: 900, lineHeight: styles.lineHeight, margin: `0 0 ${styles.margin} 0` }}>《{title}》</h1>
              <div style={{ width: '200px', height: '10px', backgroundColor: color, opacity: 0.2, margin: `0 0 ${styles.margin} 0` }}></div>
              <p style={{ color, fontSize: '68px', fontWeight: 500, fontStyle: 'italic' }}>{subtitle}</p>
            </>
          ) : (
            <>
              <Quote size={140} style={{ color, opacity: 0.2, marginBottom: '120px' }} />
              <h2 style={{ color, fontSize: styles.fontSize, fontWeight: 700, lineHeight: styles.lineHeight, textAlign: 'justify' }}>{title}</h2>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen bg-[#F0EEE6] text-[#2D2D2D] flex flex-col md:flex-row overflow-hidden font-sans">
      <nav className="w-full md:w-24 bg-white border-r border-[#DCD9CE] flex md:flex-col items-center py-10 space-y-12 z-30 shadow-sm">
        <div className="w-16 h-16 bg-[#1A1A1A] rounded-2xl flex items-center justify-center text-white"><Book size={32} /></div>
        <button onClick={() => setActiveTab('generator')} className={`p-5 rounded-[2rem] transition-all ${activeTab === 'generator' ? 'bg-[#F0EEE6]' : 'text-slate-400'}`}><Zap size={32} /></button>
        <button onClick={() => setActiveTab('library')} className={`p-5 rounded-[2rem] transition-all ${activeTab === 'library' ? 'bg-[#F0EEE6]' : 'text-slate-400'}`}><Library size={32} /></button>
        <div className="flex-grow"></div>
        <button onClick={() => setActiveTab('settings')} className={`p-5 rounded-[2rem] transition-all ${activeTab === 'settings' ? 'bg-[#1A1A1A] text-white' : 'text-slate-300'}`}><Settings size={32} /></button>
      </nav>

      <main className="flex-grow flex flex-col h-full overflow-hidden">
        {activeTab === 'generator' && (
          <div className="flex h-full">
            <div className="w-[420px] bg-white p-8 border-r border-[#DCD9CE] flex flex-col shadow-xl">
              <header className="mb-8">
                <h1 className="text-3xl font-black mb-1 text-red-600">重型产线 v10</h1>
                <p className="text-xs text-slate-400 font-bold italic tracking-tighter">极稳热度版：实时顺位生产。</p>
              </header>
              <div className="flex-grow space-y-6">
                <section>
                  <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest block mb-3">首选目标</label>
                  <input type="text" placeholder="输入书名..." value={bookNameInput} onChange={(e) => setBookNameInput(e.target.value)} disabled={isProcessing} className="w-full px-6 py-5 bg-[#F9F8F4] rounded-[2rem] font-black outline-none border-2 border-transparent focus:border-[#1A1A1A]" />
                </section>
                <div className="bg-[#FAF9F6] p-6 rounded-[2.5rem] border-2 border-dashed border-[#DCD9CE]">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><HardDrive size={16}/> 归档资产</h4>
                   <p className="text-xs text-slate-400 font-bold">云端已锁定 <span className="text-xl text-[#1A1A1A]">{projects.length}</span> 本书。</p>
                </div>
              </div>
              <button onClick={handleProductionFlow} disabled={isProcessing} className="w-full py-8 bg-[#1A1A1A] text-white rounded-[3.5rem] font-black flex items-center justify-center space-x-4 shadow-2xl active:scale-95 transition-all">
                {isProcessing ? <Loader2 className="animate-spin" size={32} /> : <><BarChart3 size={32} /><span>探测热度并产出</span></>}
              </button>
            </div>

            <div className="flex-grow p-10 overflow-y-auto">
               <div className="max-w-3xl mx-auto space-y-10">
                  <h2 className="text-2xl font-black flex items-center"><Cpu className={`mr-3 ${isProcessing ? 'text-red-500 animate-pulse' : ''}`} /> 生产矩阵状态反馈</h2>
                  <div className="grid grid-cols-2 gap-8">
                    {slotStatus.map((slot, i) => (
                      <div key={i} className={`bg-white p-8 rounded-[3rem] border-2 transition-all ${slot.status === 'done' ? 'border-green-500' : 'border-[#DCD9CE]'}`}>
                        <div className="flex justify-between mb-4">
                           <Box size={24} className="text-slate-300" />
                           {slot.status === 'done' && <CheckCircle size={24} className="text-green-500" />}
                        </div>
                        <h3 className="text-xl font-bold truncate">《{slot.name}》</h3>
                        <p className="text-sm font-bold text-slate-400 mt-2 uppercase tracking-tighter">{slot.status}</p>
                      </div>
                    ))}
                  </div>
                  <div className="bg-[#FAF9F6] p-8 rounded-[3rem] border-2 border-dashed border-[#DCD9CE] flex items-center space-x-6">
                      <Clock className="text-slate-400" />
                      <p className="text-lg font-black">{exportProgress || "产线就绪，等待下令。"}</p>
                  </div>
               </div>

               <div style={{ position: 'fixed', left: '-5000px', top: 0 }}>
                  {renderingIndex !== -1 && productionBuffer[renderingIndex] && (
                    <div id="render-slot">
                      <IndustrialZenCard 
                        innerRef={mainCoverRef} 
                        title={productionBuffer[renderingIndex].originalBook} 
                        color={productionBuffer[renderingIndex].color} 
                        subtitle={productionBuffer[renderingIndex].title} 
                      />
                      {(productionBuffer[renderingIndex].quotes || []).map((q, qIdx) => (
                        <IndustrialZenCard key={qIdx} innerRef={el => quoteRefs.current[qIdx] = el} title={q} color={productionBuffer[renderingIndex].color} type="quote" />
                      ))}
                    </div>
                  )}
               </div>
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <div className="p-32 overflow-y-auto">
            <h1 className="text-5xl font-black mb-16 border-b border-[#DCD9CE] pb-10">已归档资产库</h1>
            <div className="flex flex-wrap gap-4">
              {projects.map(proj => (
                <div key={proj.id} className="bg-white px-8 py-5 rounded-[2.5rem] border-2 border-[#DCD9CE] flex items-center space-x-6">
                  <span className="font-bold text-2xl">《{proj.bookName}》</span>
                  <button onClick={() => deleteDoc(doc(getFirestore(), 'artifacts', APP_ID, 'users', user.uid, 'projects', proj.id))} className="text-slate-200 hover:text-red-500 transition-all"><Trash2 size={24} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="p-32 flex flex-col items-center justify-center h-full">
            <div className="max-w-xl w-full bg-white p-16 rounded-[5rem] shadow-2xl border-2 border-[#DCD9CE]">
              <div className="flex items-center space-x-8 mb-12">
                <div className="w-24 h-24 bg-orange-100 text-orange-600 rounded-[2.5rem] flex items-center justify-center"><Key size={48} /></div>
                <div>
                  <h1 className="text-4xl font-black">接口配置中心</h1>
                  <p className="text-slate-400 font-bold italic mt-1">API Key 仅保存在本地。</p>
                </div>
              </div>
              <div className="space-y-10">
                <section>
                  <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest block mb-4">Gemini API Key</label>
                  <input type="password" placeholder="粘贴密钥..." value={inputKey} onChange={(e) => setInputKey(e.target.value)} className="w-full px-8 py-6 bg-[#F9F8F4] rounded-[2.5rem] font-mono text-xl outline-none border-2 border-transparent focus:border-[#1A1A1A] transition-all" />
                </section>
                <div className="flex space-x-6">
                  <button onClick={saveApiKey} className="flex-grow py-8 bg-[#1A1A1A] text-white rounded-[3.5rem] font-black flex items-center justify-center space-x-4 shadow-xl active:scale-95 transition-all"><ShieldCheck size={28} /><span>保存密钥</span></button>
                  <button onClick={clearApiKey} className="px-10 py-8 bg-red-50 text-red-500 rounded-[3.5rem] font-black hover:bg-red-500 hover:text-white transition-all">清除</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @font-face {
          font-family: 'Noto Serif SC';
          src: url('./assets/fonts/NotoSerifSC-Black.ttf') format('truetype');
          font-weight: 900;
        }
        body { font-family: 'Noto Sans SC', sans-serif; overflow: hidden; }
        .font-serif { font-family: 'Noto Serif SC', serif; }
      `}} />
    </div>
  );
};

export default App;