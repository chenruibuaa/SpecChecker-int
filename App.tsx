
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  ShieldAlert, 
  FileCode, 
  Network, 
  CheckCircle, 
  XCircle, 
  Search,
  UploadCloud,
  Activity,
  AlertTriangle,
  Bug,
  Settings,
  Save,
  Zap,
  Cpu,
  Plus,
  Trash2,
  Code,
  Layers,
  Link as LinkIcon,
  Download,
  X,
  Copy,
  Binary,
  ToggleLeft,
  ToggleRight,
  Filter,
  FileJson,
  Database,
  Monitor,
  FolderOpen,
  Play,
  Folder,
  File,
  ChevronRight,
  ChevronDown,
  Loader2,
  BookOpen,
  Terminal,
  FileText,
  Package,
  Check,
  Ban
} from 'lucide-react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { MOCK_ISSUES } from './constants';
import { Issue, Severity, Status, IssueType, ThreadEvent, FileNode, ConcurrencyRelation } from './types';
import DataFlowVisualizer from './components/DataFlowVisualizer';
import ConcurrencyVisualizer from './components/ConcurrencyVisualizer';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';

// Fix for Editor type definition issue where props are inferred as never
const MonacoEditor = Editor as any;

// --- Configuration Types ---
interface ISRConfig {
  id: string;
  functionName: string;
  priority: number; // 0 is highest
  hardwareId: string; // New: Hardware Vector Number or ID (e.g. "37", "5")
  description?: string;
}

// Advanced Control Rule Interface
interface ControlRule {
  id: string;
  mode: 'FUNCTION' | 'REGISTER';
  identifier: string; // Function Name or Register Name
  
  // Pattern Logic
  pattern: 'SIMPLE' | 'ARG_MATCH' | 'ARG_AS_ID' | 'WRITE_VAL' | 'BITWISE_MASK' | 'REG_BIT_MAPPING';
  
  // Pattern Details
  argIndex?: number;       // e.g., 0 for first argument
  matchValue?: string;     // e.g., "-1", "0", "0xFE"
  
  // New: Register Bit Logic
  regBitMode?: 'FIXED' | 'DYNAMIC'; // New: Support for IER = IER | (1 << n)
  regBitIndex?: number;    // 0-63
  regPolarity?: '1_DISABLES' | '0_DISABLES'; // Logic definition. 0_DISABLES means 1_ENABLES.
  
  action: 'ENABLE' | 'DISABLE'; // This becomes the "Goal" of the rule, logic is derived from polarity
  targetScope: 'GLOBAL' | 'SPECIFIC';
  
  // Linkage
  linkedIsrId?: string;    // If Scope is SPECIFIC, which ISR does this affect?
  targetDetail?: string;   // Fallback text description
}

// --- File Explorer Component ---
const FileTreeItem: React.FC<{ node: FileNode; onFileClick: (path: string) => void }> = ({ node, onFileClick }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!node.isDirectory) {
    return (
      <div 
        onClick={() => onFileClick(node.path)}
        className="flex items-center gap-2 py-1 px-2 text-xs text-[#57606a] hover:bg-[#d0d7de] cursor-pointer rounded-sm ml-4 transition-colors"
      >
        <File size={12} className="text-[#57606a]" />
        <span className="truncate">{node.name}</span>
      </div>
    );
  }

  return (
    <div>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 py-1 px-2 text-xs text-[#24292f] font-medium hover:bg-[#d0d7de] cursor-pointer rounded-sm transition-colors"
      >
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Folder size={12} className="text-[#54aeff]" />
        <span className="truncate">{node.name}</span>
      </div>
      {isOpen && node.children && (
        <div className="pl-2 border-l border-[#d0d7de] ml-2">
          {node.children.map((child) => (
            <FileTreeItem key={child.path} node={child} onFileClick={onFileClick} />
          ))}
        </div>
      )}
    </div>
  );
};


const App: React.FC = () => {
  // IPC Access Helper
  const getElectronAPI = () => {
    // @ts-ignore
    return typeof window !== 'undefined' ? window.electronAPI : null;
  };

  // Project State
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [currentCodeFile, setCurrentCodeFile] = useState<{name: string, content: string} | null>(null);

  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisMessage, setAnalysisMessage] = useState('');

  // App State
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<Severity | 'ALL'>('ALL');
  const [filterType, setFilterType] = useState<IssueType | 'ALL'>('ALL');
  const [view, setView] = useState<'dashboard' | 'issues' | 'settings' | 'code' | 'docs'>('dashboard');
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Monaco Ref
  const editorRef = useRef<any>(null);

  // --- Configuration State (ISR & Rules) ---
  const [isrList, setIsrList] = useState<ISRConfig[]>([
    { id: '1', functionName: 'SysTick_Handler', priority: 15, hardwareId: '-1', description: 'System Tick Timer' },
    { id: '2', functionName: 'USART1_IRQHandler', priority: 1, hardwareId: '37', description: 'High priority serial comms' },
  ]);

  const [controlRules, setControlRules] = useState<ControlRule[]>([
    { 
      id: '1', mode: 'FUNCTION', identifier: 'disableisr', 
      pattern: 'ARG_MATCH', argIndex: 0, matchValue: '-1',
      action: 'DISABLE', targetScope: 'GLOBAL' 
    },
     {
      id: '5', mode: 'REGISTER', identifier: 'IER',
      pattern: 'REG_BIT_MAPPING', regBitMode: 'DYNAMIC', regPolarity: '0_DISABLES',
      action: 'ENABLE', targetScope: 'SPECIFIC', targetDetail: '1 << N (Dynamic)'
    }
  ]);
  
  const [newISR, setNewISR] = useState<Partial<ISRConfig>>({ priority: 0, hardwareId: '' });
  
  const [newRule, setNewRule] = useState<Partial<ControlRule>>({ 
    mode: 'FUNCTION', 
    pattern: 'SIMPLE',
    action: 'DISABLE', 
    targetScope: 'GLOBAL',
    argIndex: 0,
    regBitMode: 'FIXED',
    regBitIndex: 0,
    regPolarity: '1_DISABLES'
  });

  const [isSaved, setIsSaved] = useState(false);
  const [showConfigPreview, setShowConfigPreview] = useState(false);

  // Detect Electron Environment
  const [isElectron, setIsElectron] = useState(false);
  
  useEffect(() => {
      const api = getElectronAPI();
      setIsElectron(!!api);
      if (!api) {
          setIssues(MOCK_ISSUES);
      } else {
          // Setup listeners
          api.on('analysis-progress', (_: any, data: { progress: number, message: string }) => {
            setAnalysisProgress(data.progress);
            setAnalysisMessage(data.message);
          });
          return () => {
             if (api.removeAllListeners) api.removeAllListeners('analysis-progress');
          }
      }
  }, []);

  // Handle Monaco Line Highlight in Issue View
  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  useEffect(() => {
      setHighlightedLine(null);
  }, [selectedIssueId]);


  // --- Project Management Functions ---

  const handleOpenProject = async () => {
    const api = getElectronAPI();
    if (!api) {
      alert("此功能需要 Electron 桌面环境。");
      return;
    }

    const path = await api.invoke('open-project-dialog');
    if (path) {
      setProjectPath(path);
      setIssues([]); // Clear old issues
      setSelectedIssueId(null);
      setFileTree([]); 
      setCurrentCodeFile(null);
      
      // Load File Tree
      const tree = await api.invoke('read-project-tree', path);
      setFileTree(tree);
      setView('code'); // Switch to code browser
    }
  };

  const handleFileClick = async (filePath: string) => {
    const api = getElectronAPI();
    if (!api) return;
    const content = await api.invoke('read-file-content', filePath);
    // Simple extraction of file name
    const name = filePath.split(/[\\/]/).pop() || 'unknown';
    setCurrentCodeFile({ name, content });
    setView('code');
  };

  const handleRunAnalysis = async () => {
     const api = getElectronAPI();
     if (!projectPath || !api) return;
     
     setIsAnalyzing(true);
     setAnalysisProgress(0);
     setAnalysisMessage('正在启动引擎...');

     try {
       const resultPath = await api.invoke('run-analysis-engine', projectPath);
       // Analysis Complete
       setIsAnalyzing(false);
       
       // Load results
       const resultJson = await api.invoke('read-file-content', resultPath);
       const data = JSON.parse(resultJson);
       
       if (data.issues) {
         setIssues(data.issues);
         alert(`分析完成！发现 ${data.issues.length} 个缺陷。`);
         setView('issues');
       }
     } catch (e) {
       console.error(e);
       setIsAnalyzing(false);
       alert("分析过程中发生错误。");
     }
  };

  const handleSaveConfig = () => {
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
  };

  const addISR = () => {
    if (!newISR.functionName) return;
    setIsrList([...isrList, { ...newISR, id: Date.now().toString() } as ISRConfig]);
    setNewISR({ priority: 0, functionName: '', description: '', hardwareId: '' });
  };

  const deleteISR = (id: string) => {
    setIsrList(isrList.filter(i => i.id !== id));
    setControlRules(prev => prev.map(r => r.linkedIsrId === id ? { ...r, linkedIsrId: undefined } : r));
  };

  const addRule = () => {
    if (!newRule.identifier) return;
    
    let finalDetail = newRule.targetDetail;
    if (!finalDetail && !newRule.linkedIsrId) {
        if (newRule.pattern === 'ARG_AS_ID') finalDetail = 'Dynamic (Matches HW ID)';
        if (newRule.pattern === 'REG_BIT_MAPPING') {
             if (newRule.regBitMode === 'DYNAMIC') {
                 const logic = newRule.regPolarity === '1_DISABLES' ? 'Active Low' : 'Active High';
                 finalDetail = `Bit N (1 << N) [${logic}]`;
             } else {
                 const logic = newRule.regPolarity === '1_DISABLES' ? '1=Off' : '0=Off';
                 finalDetail = `Bit ${newRule.regBitIndex} (${logic})`;
             }
        }
    }

    setControlRules([...controlRules, { ...newRule, targetDetail: finalDetail, id: Date.now().toString() } as ControlRule]);
    
    setNewRule({ 
        mode: newRule.mode, 
        pattern: newRule.mode === 'REGISTER' ? 'REG_BIT_MAPPING' : 'SIMPLE', 
        action: 'DISABLE', 
        targetScope: 'GLOBAL', 
        identifier: '', 
        matchValue: '',
        argIndex: 0,
        regBitMode: 'FIXED',
        regBitIndex: 0,
        regPolarity: '1_DISABLES',
        targetDetail: '',
        linkedIsrId: undefined
    });
  };

  const deleteRule = (id: string) => {
    setControlRules(controlRules.filter(r => r.id !== id));
  };

  const switchMode = (mode: 'FUNCTION' | 'REGISTER') => {
      if (newRule.mode === mode) return;
      if (mode === 'FUNCTION') {
          setNewRule({...newRule, mode: 'FUNCTION', pattern: 'SIMPLE', identifier: '', targetScope: 'GLOBAL'});
      } else {
          setNewRule({...newRule, mode: 'REGISTER', pattern: 'REG_BIT_MAPPING', identifier: '', regBitIndex: 0, regPolarity: '1_DISABLES', targetScope: 'GLOBAL'});
      }
  };

  // --- Import/Export Logic ---

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        
        if (json.meta && json.issues && Array.isArray(json.issues)) {
             setIssues(json.issues);
             alert(`已导入完整项目数据: ${json.issues.length} 个缺陷`);
             setView('issues');
        } else if (json.runs) {
             // SARIF import logic (simplified)
             alert("SARIF 导入功能在此演示中仅为占位符。");
        }
      } catch (err) {
        console.error(err);
        alert("文件解析失败");
      }
    };
    reader.readAsText(file);
    event.target.value = ''; 
  };

  // Export Logic
  const handleExportFullData = () => {
      const data = {
          meta: { version: "1.0", exportedAt: new Date().toISOString(), tool: "SpecChecker-Int" },
          issues: issues,
          config: { isrList, controlRules }
      };
      downloadJson(data, `specchecker-project-${Date.now()}.json`);
  };

  const downloadJson = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const selectedIssue = useMemo(() => 
    issues.find(i => i.id === selectedIssueId), 
  [issues, selectedIssueId]);

  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      if (filterSeverity !== 'ALL' && issue.severity !== filterSeverity) return false;
      if (filterType !== 'ALL' && issue.type !== filterType) return false;
      return true;
    });
  }, [issues, filterSeverity, filterType]);

  const stats = useMemo(() => {
    const total = issues.length;
    const critical = issues.filter(i => i.severity === Severity.CRITICAL).length;
    const high = issues.filter(i => i.severity === Severity.HIGH).length;
    const medium = issues.filter(i => i.severity === Severity.MEDIUM).length;
    
    const byStatus = [
      { name: '未处理', value: issues.filter(i => i.status === Status.OPEN).length, color: '#0969da' },
      { name: '已确认', value: issues.filter(i => i.status === Status.CONFIRMED).length, color: '#1a7f37' },
      { name: '误报', value: issues.filter(i => i.status === Status.FALSE_POSITIVE).length, color: '#8c959f' },
    ];
    
    return { total, critical, high, medium, byStatus };
  }, [issues]);

  const handleUpdateStatus = (id: string, newStatus: Status) => {
    setIssues(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
  };
  
  const handleEventClick = (event: ThreadEvent) => {
      if (event.line) {
          setHighlightedLine(event.line);
      }
  };

  const getSeverityColor = (sev: Severity) => {
    switch (sev) {
      case Severity.CRITICAL: return 'bg-[#ffebe9] text-[#cf222e] border-[#ff818266]';
      case Severity.HIGH: return 'bg-[#fff8c5] text-[#9a6700] border-[#d4a72c66]';
      case Severity.MEDIUM: return 'bg-[#ddf4ff] text-[#0969da] border-[#54aeff66]';
      case Severity.LOW: return 'bg-[#f6f8fa] text-[#57606a] border-[#d0d7de]';
      default: return 'bg-[#f6f8fa] text-[#24292f]';
    }
  };

  const getTypeIcon = (type: IssueType) => {
    switch(type) {
      case IssueType.DATA_FLOW: return <Network size={16} />; // Replaced GitGraph
      case IssueType.CONCURRENCY: return <Activity size={16} />;
      case IssueType.SECURITY: return <ShieldAlert size={16} />;
      default: return <Bug size={16} />;
    }
  };

  const getTypeName = (type: IssueType) => {
      switch(type) {
        case IssueType.DATA_FLOW: return "数据流";
        case IssueType.CONCURRENCY: return "并发";
        case IssueType.SECURITY: return "安全";
        case IssueType.QUALITY: return "质量";
        default: return type;
      }
  };

  // Helper to render readable rule description
  const renderRuleDescription = (rule: ControlRule) => {
      if (rule.mode === 'FUNCTION') {
          if (rule.pattern === 'SIMPLE') return `调用 ${rule.identifier}()`;
          if (rule.pattern === 'ARG_MATCH') return `当参数[${rule.argIndex}] == ${rule.matchValue}`;
          if (rule.pattern === 'ARG_AS_ID') return `参数[${rule.argIndex}] 对应 ISR HW ID`;
      } else {
          if (rule.pattern === 'REG_BIT_MAPPING') {
             const logic = rule.regPolarity === '1_DISABLES' ? '1=Disable' : '1=Enable';
             const index = rule.regBitMode === 'DYNAMIC' ? 'Dyn (1 << N)' : `Bit ${rule.regBitIndex}`;
             return (
               <span className="flex items-center gap-2">
                 <span className="bg-[#f6f8fa] px-1.5 py-0.5 rounded border border-[#d0d7de] font-mono text-xs">{index}</span>
                 <span>{logic}</span>
               </span>
             );
          }
          if (rule.pattern === 'WRITE_VAL') return `写入值 == ${rule.matchValue}`;
      }
      return rule.pattern;
  };

  const getLinkedIsrName = (rule: ControlRule) => {
      if (rule.pattern === 'ARG_AS_ID') return 'Dynamic (By HW ID)';
      if (rule.mode === 'REGISTER' && rule.regBitMode === 'DYNAMIC') return 'Dynamic (By Bit Index)';
      if (rule.targetScope === 'GLOBAL') return 'Global';
      
      if (rule.linkedIsrId) {
          const isr = isrList.find(i => i.id === rule.linkedIsrId);
          return isr ? (
              <span className="flex items-center gap-1 text-[#0969da] font-medium">
                  <LinkIcon size={12} /> {isr.functionName}
              </span>
          ) : <span className="text-[#cf222e]">Unknown ISR</span>;
      }
      return rule.targetDetail || 'Specific';
  };

  // Helper to strip "12: " line number prefix for Monaco
  const getCleanCode = (rawSnippet: string) => {
      return rawSnippet.split('\n').map(line => line.replace(/^\s*\d+:\s*/, '')).join('\n');
  };

  // Helper to extract line number mapping for decorations
  const getLineMapping = (rawSnippet: string) => {
      const mapping: {realLine: number, origLine: number}[] = [];
      rawSnippet.split('\n').forEach((line, index) => {
          const match = line.match(/^\s*(\d+):/);
          if (match) {
              mapping.push({ realLine: index + 1, origLine: parseInt(match[1]) });
          }
      });
      return mapping;
  };

  return (
    <div className="flex flex-col h-screen bg-[#f6f8fa] text-[#24292f]">
      {/* Inject Style for Monaco Decoration */}
      <style>{`
        .monaco-highlight-line {
          background-color: #ffebe9;
          border-left: 3px solid #cf222e;
        }
      `}</style>
      
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept=".sarif,.json,.csj" 
        className="hidden" 
      />

      {/* Analysis Progress Modal */}
      {isAnalyzing && (
        <div className="fixed inset-0 bg-[#24292f]/60 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl p-6 w-96 border border-[#d0d7de] text-center">
                 <div className="flex justify-center mb-4">
                    <Loader2 className="animate-spin text-[#0969da]" size={40} />
                 </div>
                 <h3 className="text-lg font-bold text-[#24292f] mb-2">正在执行分析引擎</h3>
                 <p className="text-[#57606a] text-sm mb-4 min-h-[1.5rem]">{analysisMessage}</p>
                 
                 <div className="w-full bg-[#eaeef2] rounded-full h-2.5 mb-2">
                    <div 
                        className="bg-[#0969da] h-2.5 rounded-full transition-all duration-300" 
                        style={{ width: `${analysisProgress}%` }}
                    ></div>
                 </div>
                 <div className="text-xs text-[#57606a] text-right">{analysisProgress}%</div>
            </div>
        </div>
      )}

      {/* Top Navigation Bar */}
      <nav className="h-14 bg-[#24292f] text-white flex items-center justify-between px-6 shadow-sm z-30 shrink-0">
         <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-white/90">
              <ShieldAlert size={20} />
              <h1 className="font-semibold text-lg tracking-tight">SpecChecker-Int</h1>
              {isElectron && (
                <span className="px-2 py-0.5 rounded bg-[#0969da] border border-[#0969da] text-[10px] text-white font-medium flex items-center gap-1">
                    <Monitor size={10} /> 客户端
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button 
                onClick={handleOpenProject}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md transition-all text-sm font-medium hover:bg-[#373e47] text-white/90"
              >
                <FolderOpen size={14} />
                打开工程
              </button>

              <button 
                onClick={handleRunAnalysis}
                disabled={!projectPath}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all text-sm font-medium text-white/90 ${
                    projectPath ? 'bg-[#1f883d] hover:bg-[#1a7f37] border border-[rgba(255,255,255,0.1)]' : 'bg-[#373e47] opacity-50 cursor-not-allowed'
                }`}
              >
                {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                运行分析
              </button>
            </div>
         </div>

         <div className="flex items-center gap-4">
             <div className="flex bg-[#373e47] rounded-md p-0.5 gap-0.5">
                <button 
                  onClick={() => setView('dashboard')}
                  className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition-colors ${view === 'dashboard' ? 'bg-[#24292f] text-white shadow-sm' : 'text-gray-300 hover:text-white'}`}
                >
                  <LayoutDashboard size={16} /> 概览
                </button>
                <button 
                  onClick={() => setView('issues')}
                  className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition-colors ${view === 'issues' ? 'bg-[#24292f] text-white shadow-sm' : 'text-gray-300 hover:text-white'}`}
                >
                  <AlertTriangle size={16} /> 缺陷 <span className="bg-[#6e7781] text-white text-[10px] px-1.5 rounded-full">{issues.length}</span>
                </button>
                <button 
                  onClick={() => setView('code')}
                  className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition-colors ${view === 'code' ? 'bg-[#24292f] text-white shadow-sm' : 'text-gray-300 hover:text-white'}`}
                >
                  <Code size={16} /> 代码
                </button>
                <button 
                  onClick={() => setView('settings')}
                  className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition-colors ${view === 'settings' ? 'bg-[#24292f] text-white shadow-sm' : 'text-gray-300 hover:text-white'}`}
                >
                  <Settings size={16} /> 配置
                </button>
                <button 
                  onClick={() => setView('docs')}
                  className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition-colors ${view === 'docs' ? 'bg-[#24292f] text-white shadow-sm' : 'text-gray-300 hover:text-white'}`}
                >
                  <BookOpen size={16} /> 文档
                </button>
             </div>
         </div>
      </nav>

      {/* Main Content Area with Sidebar */}
      <div className="flex flex-1 overflow-hidden">
         
         {/* File Explorer Sidebar - Only show in Code View */}
         {projectPath && view === 'code' && (
           <aside className="w-64 bg-white border-r border-[#d0d7de] flex flex-col shrink-0">
              <div className="p-3 border-b border-[#d0d7de] bg-[#f6f8fa] flex items-center gap-2">
                 <Layers size={14} className="text-[#57606a]" />
                 <span className="text-xs font-semibold text-[#24292f] truncate">{projectPath.split(/[\\/]/).pop()}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                 {fileTree.length === 0 ? (
                    <div className="text-xs text-[#57606a] p-2 text-center">正在加载文件...</div>
                 ) : (
                    fileTree.map(node => (
                      <FileTreeItem key={node.path} node={node} onFileClick={handleFileClick} />
                    ))
                 )}
              </div>
           </aside>
         )}

         {/* Center Content */}
         <main className="flex-1 overflow-hidden bg-[#ffffff] relative flex flex-col">
            
            {/* VIEW: DASHBOARD */}
            {view === 'dashboard' && (
              <div className="p-8 overflow-y-auto h-full bg-[#f6f8fa]">
                <div className="max-w-6xl mx-auto space-y-6">
                    <div className="grid grid-cols-4 gap-4">
                      <div className="bg-white p-4 rounded-md border border-[#d0d7de] shadow-sm">
                        <div className="text-sm text-[#57606a] font-medium">检测缺陷总数</div>
                        <div className="text-3xl font-bold text-[#24292f] mt-2">{stats.total}</div>
                      </div>
                      <div className="bg-white p-4 rounded-md border border-[#ff818266] bg-[#ffebe9] shadow-sm">
                        <div className="text-sm text-[#cf222e] font-medium flex items-center gap-1"><ShieldAlert size={14}/> 严重缺陷 (Critical)</div>
                        <div className="text-3xl font-bold text-[#cf222e] mt-2">{stats.critical}</div>
                      </div>
                      <div className="bg-white p-4 rounded-md border border-[#d4a72c66] bg-[#fff8c5] shadow-sm">
                        <div className="text-sm text-[#9a6700] font-medium flex items-center gap-1"><AlertTriangle size={14}/> 高风险 (High)</div>
                        <div className="text-3xl font-bold text-[#9a6700] mt-2">{stats.high}</div>
                      </div>
                      <div className="bg-white p-4 rounded-md border border-[#54aeff66] bg-[#ddf4ff] shadow-sm">
                         <div className="text-sm text-[#0969da] font-medium flex items-center gap-1"><Bug size={14}/> 中等风险 (Medium)</div>
                        <div className="text-3xl font-bold text-[#0969da] mt-2">{stats.medium}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="bg-white p-6 rounded-md border border-[#d0d7de] shadow-sm min-h-[300px]">
                        <h3 className="text-base font-semibold text-[#24292f] mb-4">缺陷状态分布</h3>
                        <ResponsiveContainer width="100%" height={240}>
                          <PieChart>
                            <Pie
                              data={stats.byStatus}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {stats.byStatus.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} stroke={entry.color} />
                              ))}
                            </Pie>
                            <RechartsTooltip />
                            <Legend verticalAlign="bottom" height={36}/>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                       <div className="bg-white p-6 rounded-md border border-[#d0d7de] shadow-sm">
                        <h3 className="text-base font-semibold text-[#24292f] mb-4">待处理高危缺陷</h3>
                         <div className="space-y-3">
                            {issues.filter(i => i.severity === Severity.CRITICAL || i.severity === Severity.HIGH).slice(0, 5).map(issue => (
                               <div key={issue.id} className="flex items-center justify-between p-3 bg-[#f6f8fa] rounded-md border border-[#d0d7de] hover:bg-[#eaeef2] cursor-pointer" onClick={() => { setSelectedIssueId(issue.id); setView('issues'); }}>
                                  <div className="flex items-center gap-3">
                                      <div className={`w-2 h-2 rounded-full ${issue.severity === Severity.CRITICAL ? 'bg-[#cf222e]' : 'bg-[#d29922]'}`}></div>
                                      <div>
                                          <div className="text-sm font-semibold text-[#24292f]">{issue.title}</div>
                                          <div className="text-xs text-[#57606a]">{issue.file}:{issue.line}</div>
                                      </div>
                                  </div>
                                  <ChevronRight size={16} className="text-[#57606a]" />
                               </div>
                            ))}
                            {issues.length === 0 && <div className="text-sm text-[#57606a] text-center py-4">暂无数据</div>}
                         </div>
                      </div>
                    </div>
                </div>
              </div>
            )}

            {/* VIEW: ISSUES LIST & DETAIL */}
            {view === 'issues' && (
              <div className="flex h-full">
                {/* Issue List Sidebar */}
                <div className="w-1/3 border-r border-[#d0d7de] bg-white flex flex-col h-full">
                   <div className="p-3 border-b border-[#d0d7de] flex gap-2 bg-[#f6f8fa]">
                      <div className="relative flex-1">
                        <Search size={14} className="absolute left-2.5 top-2.5 text-[#57606a]" />
                        <input type="text" placeholder="过滤缺陷..." className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#d0d7de] rounded-md text-sm focus:outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]" />
                      </div>
                      <div className="flex gap-1">
                         <button 
                            onClick={() => setFilterSeverity(prev => prev === 'ALL' ? Severity.CRITICAL : prev === Severity.CRITICAL ? Severity.HIGH : 'ALL')}
                            className="p-1.5 border border-[#d0d7de] rounded-md hover:bg-[#eaeef2] text-[#57606a]" title="严重程度过滤"
                         >
                             <Filter size={16} />
                         </button>
                         <button 
                           onClick={() => setFilterType(prev => prev === 'ALL' ? IssueType.CONCURRENCY : 'ALL')}
                           className="p-1.5 border border-[#d0d7de] rounded-md hover:bg-[#eaeef2] text-[#57606a]" title="类型过滤"
                          >
                             <Layers size={16} />
                         </button>
                         <button className="p-1.5 border border-[#d0d7de] rounded-md hover:bg-[#eaeef2] text-[#57606a]" onClick={handleExportFullData} title="导出 JSON">
                            <Download size={16} />
                         </button>
                         <button className="p-1.5 border border-[#d0d7de] rounded-md hover:bg-[#eaeef2] text-[#57606a]" onClick={handleImportClick} title="导入">
                            <UploadCloud size={16} />
                         </button>
                      </div>
                   </div>
                   
                   <div className="flex-1 overflow-y-auto">
                      {filteredIssues.map(issue => (
                        <div 
                          key={issue.id}
                          onClick={() => setSelectedIssueId(issue.id)}
                          className={`p-4 border-b border-[#d0d7de] cursor-pointer hover:bg-[#f6f8fa] transition-colors ${selectedIssueId === issue.id ? 'bg-[#ddf4ff] border-l-4 border-l-[#0969da]' : 'border-l-4 border-l-transparent'}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                             {/* ALWAYS Show Severity on Left */}
                             <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getSeverityColor(issue.severity)}`}>
                                 {issue.severity}
                             </span>

                             {/* Status Badges on Top Right */}
                             {issue.status === Status.CONFIRMED && (
                                 <div className="flex items-center gap-1 text-[#1a7f37] bg-[#dafbe1] px-1.5 py-0.5 rounded border border-[#4ac26b66]">
                                     <Check size={12} strokeWidth={3} />
                                     <span className="text-[10px] font-bold">已确认</span>
                                 </div>
                             )}
                             {issue.status === Status.FALSE_POSITIVE && (
                                 <div className="flex items-center gap-1 text-[#57606a] bg-[#f6f8fa] px-1.5 py-0.5 rounded border border-[#d0d7de]">
                                     <Ban size={12} strokeWidth={3} />
                                     <span className="text-[10px] font-bold">误报</span>
                                 </div>
                             )}
                             {issue.status === Status.FIXED && (
                                <div className="flex items-center gap-1 text-[#1a7f37]">
                                    <CheckCircle size={14} />
                                    <span className="text-[10px] font-bold">已修复</span>
                                </div>
                             )}
                          </div>
                          
                          <h4 className="text-sm font-semibold text-[#24292f] mb-1 line-clamp-1 mt-1">{issue.title}</h4>
                          <div className="flex items-center gap-2 text-xs text-[#57606a] mb-2">
                             <span className="flex items-center gap-1">{getTypeIcon(issue.type)} {getTypeName(issue.type)}</span>
                          </div>
                          <div className="text-xs font-mono text-[#57606a] bg-[#eaeef2] px-2 py-1 rounded truncate">
                            {issue.file}:{issue.line}
                          </div>
                        </div>
                      ))}
                   </div>
                </div>

                {/* Detailed View */}
                <div className="w-2/3 h-full overflow-y-auto bg-[#ffffff] p-6">
                  {selectedIssue ? (
                    <div className="max-w-4xl mx-auto space-y-6">
                       
                       <div className="flex justify-between items-start border-b border-[#d0d7de] pb-4">
                          <div>
                            <h2 className="text-2xl font-bold text-[#24292f] mb-2">{selectedIssue.title}</h2>
                            <p className="text-[#57606a] text-sm">{selectedIssue.description}</p>
                          </div>
                          <div className="flex gap-2">
                             <button onClick={() => handleUpdateStatus(selectedIssue.id, Status.CONFIRMED)} className="px-3 py-1.5 bg-[#1f883d] text-white text-xs font-bold rounded-md hover:bg-[#1a7f37] border border-[rgba(255,255,255,0.1)] flex items-center gap-1">
                               <Check size={14} /> 确认 (Confirm)
                             </button>
                             <button onClick={() => handleUpdateStatus(selectedIssue.id, Status.FALSE_POSITIVE)} className="px-3 py-1.5 bg-[#f6f8fa] text-[#24292f] border border-[#d0d7de] text-xs font-bold rounded-md hover:bg-[#eaeef2] flex items-center gap-1">
                               <Ban size={14} /> 误报 (Ignore)
                             </button>
                          </div>
                       </div>

                       {/* Visualizations */}
                       {selectedIssue.type === IssueType.DATA_FLOW && selectedIssue.dataFlow && (
                         <DataFlowVisualizer nodes={selectedIssue.dataFlow.nodes} edges={selectedIssue.dataFlow.edges} />
                       )}

                       {selectedIssue.type === IssueType.CONCURRENCY && selectedIssue.concurrency && (
                          <ConcurrencyVisualizer 
                              threads={selectedIssue.concurrency.threads} 
                              events={selectedIssue.concurrency.events} 
                              relations={selectedIssue.concurrency.relations}
                              onEventClick={handleEventClick}
                          />
                       )}

                       {/* Code Editor View (Snippet) */}
                       <div className="bg-white border border-[#d0d7de] rounded-md shadow-sm overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-[#f6f8fa] border-b border-[#d0d7de]">
                             <span className="text-xs font-mono font-semibold text-[#57606a] flex items-center gap-2">
                               <FileCode size={14} /> {selectedIssue.file}
                             </span>
                          </div>
                          <div className="h-[300px]">
                            <MonacoEditor
                                height="100%"
                                defaultLanguage="cpp"
                                value={getCleanCode(selectedIssue.rawCodeSnippet)}
                                theme="light"
                                options={{
                                    readOnly: true,
                                    minimap: { enabled: false },
                                    scrollBeyondLastLine: false,
                                    glyphMargin: true, // Enable glyph margin for icons
                                    lineNumbers: (lineNumber: any) => {
                                         const mapping = getLineMapping(selectedIssue.rawCodeSnippet);
                                         const map = mapping.find(m => m.realLine === lineNumber);
                                         return map ? map.origLine.toString() : lineNumber.toString();
                                    },
                                    renderLineHighlight: 'all',
                                }}
                                onMount={(editor: any, monaco: any) => {
                                    // Highlight the specific defect line
                                    const mapping = getLineMapping(selectedIssue.rawCodeSnippet);
                                    const map = mapping.find(m => m.origLine === selectedIssue.line);
                                    const targetLine = map ? map.realLine : (highlightedLine ? mapping.find(m => m.origLine === highlightedLine)?.realLine : null);
                                    
                                    if (targetLine) {
                                        editor.revealLineInCenter(targetLine);
                                        editor.deltaDecorations([], [{
                                            range: new monaco.Range(targetLine, 1, targetLine, 1),
                                            options: {
                                                isWholeLine: true,
                                                className: 'monaco-highlight-line', // Use injected CSS class
                                                hoverMessage: { value: `**${selectedIssue.title}**\n\n${selectedIssue.description}` }, // Add hover info
                                                glyphMarginClassName: 'bg-[#cf222e] w-2 h-2 rounded-full ml-1', // Simple marker in margin
                                            }
                                        }]);
                                    }
                                }}
                            />
                          </div>
                       </div>

                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-[#57606a]">
                       <div className="w-16 h-16 bg-[#f6f8fa] rounded-full flex items-center justify-center mb-4">
                          <Bug size={32} className="text-[#d0d7de]" />
                       </div>
                       <p className="font-medium">选择左侧缺陷项查看详细信息</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* VIEW: CODE BROWSER (Monaco) */}
            {view === 'code' && (
                <div className="flex flex-col h-full bg-white">
                    {currentCodeFile ? (
                        <>
                            <div className="h-10 border-b border-[#d0d7de] bg-[#f6f8fa] flex items-center px-4 justify-between shrink-0">
                                <div className="flex items-center gap-2 text-sm font-semibold text-[#24292f]">
                                    <FileCode size={16} />
                                    {currentCodeFile.name}
                                </div>
                                <span className="text-xs text-[#57606a]">只读 (Read-only)</span>
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <MonacoEditor
                                    height="100%"
                                    defaultLanguage={currentCodeFile.name.endsWith('.ts') || currentCodeFile.name.endsWith('.tsx') ? 'typescript' : 'cpp'}
                                    value={currentCodeFile.content}
                                    theme="light"
                                    options={{
                                        readOnly: true,
                                        minimap: { enabled: true },
                                        scrollBeyondLastLine: false,
                                    }}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-[#57606a]">
                            <Code size={48} className="text-[#d0d7de] mb-4" />
                            <p>在左侧文件树中选择文件以预览</p>
                            {!projectPath && (
                                <button onClick={handleOpenProject} className="mt-4 px-4 py-2 text-sm bg-[#0969da] text-white rounded hover:bg-[#085dc7]">
                                    打开工程目录
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* VIEW: SETTINGS (Configuration) */}
            {view === 'settings' && (
              <div className="p-8 overflow-y-auto h-full max-w-5xl mx-auto">
                 <div className="flex justify-between items-center mb-8">
                    <div>
                        <h2 className="text-2xl font-bold text-[#24292f]">分析引擎配置</h2>
                        <p className="text-[#57606a] text-sm mt-1">管理中断上下文(ISR)与并发控制规则</p>
                    </div>
                    <div className="flex gap-3">
                         <button className="flex items-center gap-2 px-4 py-2 border border-[#d0d7de] text-[#24292f] rounded-md hover:bg-[#f6f8fa] text-sm font-medium transition-colors"
                            onClick={() => setShowConfigPreview(!showConfigPreview)}
                         >
                            <FileJson size={16} /> {showConfigPreview ? '隐藏 JSON' : '查看配置 JSON'}
                         </button>
                         <button 
                            onClick={handleSaveConfig}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-white text-sm font-medium shadow-sm transition-all ${isSaved ? 'bg-[#1a7f37]' : 'bg-[#0969da] hover:bg-[#085dc7]'}`}
                         >
                            {isSaved ? <CheckCircle size={16} /> : <Save size={16} />}
                            {isSaved ? '已保存' : '保存配置'}
                         </button>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* ISR Configuration */}
                    <div className="bg-white border border-[#d0d7de] rounded-md shadow-sm">
                       <div className="p-4 border-b border-[#d0d7de] bg-[#f6f8fa] flex justify-between items-center">
                          <h3 className="font-bold flex items-center gap-2 text-[#24292f]"><Zap size={18} className="text-[#d29922]" /> 中断上下文 (ISR)</h3>
                          <span className="text-xs bg-[#eaeef2] px-2 py-1 rounded text-[#57606a]">{isrList.length} 已定义</span>
                       </div>
                       
                       <div className="p-4 space-y-4">
                          <div className="flex gap-2 items-end">
                             <div className="flex-1">
                                <label className="block text-xs font-semibold text-[#24292f] mb-1">ISR 函数名</label>
                                <input 
                                  type="text" 
                                  placeholder="例如： TIM2_IRQHandler" 
                                  className="w-full p-2 border border-[#d0d7de] rounded-md text-sm focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] outline-none"
                                  value={newISR.functionName || ''}
                                  onChange={e => setNewISR({...newISR, functionName: e.target.value})}
                                />
                             </div>
                             <div className="w-24">
                                <label className="block text-xs font-semibold text-[#24292f] mb-1">优先级</label>
                                <input 
                                  type="number" 
                                  className="w-full p-2 border border-[#d0d7de] rounded-md text-sm outline-none"
                                  value={newISR.priority}
                                  onChange={e => setNewISR({...newISR, priority: parseInt(e.target.value)})}
                                />
                             </div>
                             <div className="w-24">
                                <label className="block text-xs font-semibold text-[#24292f] mb-1">硬件 ID</label>
                                <input 
                                  type="text" 
                                  placeholder="向量号"
                                  className="w-full p-2 border border-[#d0d7de] rounded-md text-sm outline-none"
                                  value={newISR.hardwareId}
                                  onChange={e => setNewISR({...newISR, hardwareId: e.target.value})}
                                />
                             </div>
                             <button 
                                onClick={addISR}
                                className="p-2 bg-[#24292f] text-white rounded-md hover:bg-[#373e47]"
                             >
                                <Plus size={20} />
                             </button>
                          </div>

                          <div className="space-y-2 mt-4 max-h-[300px] overflow-y-auto pr-2">
                             {isrList.map(isr => (
                               <div key={isr.id} className="flex items-center justify-between p-3 bg-[#f6f8fa] border border-[#d0d7de] rounded-md">
                                  <div>
                                     <div className="font-mono font-bold text-sm text-[#0969da]">{isr.functionName}</div>
                                     <div className="text-xs text-[#57606a] flex gap-2 mt-1">
                                        <span>Pri: {isr.priority}</span>
                                        {isr.hardwareId && <span>HW: {isr.hardwareId}</span>}
                                        {isr.description && <span>- {isr.description}</span>}
                                     </div>
                                  </div>
                                  <button onClick={() => deleteISR(isr.id)} className="text-[#57606a] hover:text-[#cf222e]"><Trash2 size={16} /></button>
                               </div>
                             ))}
                             {isrList.length === 0 && <div className="text-center text-[#57606a] text-sm py-4 italic">暂无定义 ISR</div>}
                          </div>
                       </div>
                    </div>

                    {/* Control Rules Configuration */}
                    <div className="bg-white border border-[#d0d7de] rounded-md shadow-sm">
                       <div className="p-4 border-b border-[#d0d7de] bg-[#f6f8fa] flex justify-between items-center">
                          <h3 className="font-bold flex items-center gap-2 text-[#24292f]"><Cpu size={18} className="text-[#8250df]" /> 控制规则 (Control Rules)</h3>
                          <div className="flex bg-[#eaeef2] rounded p-0.5">
                              <button 
                                  onClick={() => switchMode('FUNCTION')} 
                                  className={`px-2 py-0.5 text-xs rounded font-medium ${newRule.mode === 'FUNCTION' ? 'bg-white shadow-sm text-[#0969da]' : 'text-[#57606a]'}`}
                              >
                                  Function
                              </button>
                              <button 
                                  onClick={() => switchMode('REGISTER')}
                                  className={`px-2 py-0.5 text-xs rounded font-medium ${newRule.mode === 'REGISTER' ? 'bg-white shadow-sm text-[#8250df]' : 'text-[#57606a]'}`}
                              >
                                  Register
                              </button>
                          </div>
                       </div>
                       
                       <div className="p-4 space-y-4">
                          
                          {/* Dynamic Rule Form */}
                          <div className="p-3 bg-[#f6f8fa] rounded-md border border-[#d0d7de] space-y-3">
                              
                              {/* Identifier Input */}
                              <div>
                                  <label className="block text-xs font-semibold text-[#57606a] mb-1">
                                      {newRule.mode === 'FUNCTION' ? '函数名称 (例如：disable_irq)' : '寄存器名称 (例如：IER)'}
                                  </label>
                                  <input 
                                      type="text"
                                      className="w-full p-2 border border-[#d0d7de] rounded-md text-sm outline-none focus:border-[#0969da]"
                                      value={newRule.identifier}
                                      onChange={e => setNewRule({...newRule, identifier: e.target.value})}
                                  />
                              </div>

                              {/* Function Mode Specifics */}
                              {newRule.mode === 'FUNCTION' && (
                                  <div className="grid grid-cols-2 gap-3">
                                      <div>
                                          <label className="block text-xs font-semibold text-[#57606a] mb-1">匹配模式</label>
                                          <select 
                                              className="w-full p-2 border border-[#d0d7de] rounded-md text-sm outline-none"
                                              value={newRule.pattern}
                                              onChange={(e: any) => setNewRule({...newRule, pattern: e.target.value})}
                                          >
                                              <option value="SIMPLE">任意调用</option>
                                              <option value="ARG_MATCH">参数值匹配</option>
                                              <option value="ARG_AS_ID">参数映射到 HW ID</option>
                                          </select>
                                      </div>
                                      {newRule.pattern === 'ARG_MATCH' && (
                                          <div>
                                              <label className="block text-xs font-semibold text-[#57606a] mb-1">参数索引 & 值</label>
                                              <div className="flex gap-1">
                                                  <input type="number" placeholder="Idx" className="w-12 p-2 border border-[#d0d7de] rounded-md text-sm" 
                                                      value={newRule.argIndex} onChange={e => setNewRule({...newRule, argIndex: parseInt(e.target.value)})}
                                                  />
                                                  <input type="text" placeholder="Val" className="flex-1 p-2 border border-[#d0d7de] rounded-md text-sm" 
                                                       value={newRule.matchValue} onChange={e => setNewRule({...newRule, matchValue: e.target.value})}
                                                  />
                                              </div>
                                          </div>
                                      )}
                                      {newRule.pattern === 'ARG_AS_ID' && (
                                           <div>
                                              <label className="block text-xs font-semibold text-[#57606a] mb-1">参数索引</label>
                                              <input type="number" placeholder="Idx" className="w-full p-2 border border-[#d0d7de] rounded-md text-sm" 
                                                      value={newRule.argIndex} onChange={e => setNewRule({...newRule, argIndex: parseInt(e.target.value)})}
                                              />
                                           </div>
                                      )}
                                  </div>
                              )}

                              {/* Register Mode Specifics */}
                              {newRule.mode === 'REGISTER' && (
                                  <div className="grid grid-cols-2 gap-3">
                                      <div>
                                          <label className="block text-xs font-semibold text-[#57606a] mb-1">位逻辑模式</label>
                                          <select 
                                              className="w-full p-2 border border-[#d0d7de] rounded-md text-sm outline-none"
                                              value={newRule.regBitMode}
                                              onChange={(e: any) => setNewRule({...newRule, regBitMode: e.target.value})}
                                          >
                                              <option value="FIXED">固定位索引</option>
                                              <option value="DYNAMIC">动态位 (1 &lt;&lt; N)</option>
                                          </select>
                                      </div>
                                      
                                      {newRule.regBitMode === 'FIXED' && (
                                           <div>
                                              <label className="block text-xs font-semibold text-[#57606a] mb-1">位索引 (0-63)</label>
                                              <input type="number" className="w-full p-2 border border-[#d0d7de] rounded-md text-sm" 
                                                  value={newRule.regBitIndex} onChange={e => setNewRule({...newRule, regBitIndex: parseInt(e.target.value)})}
                                              />
                                          </div>
                                      )}

                                      <div>
                                          <label className="block text-xs font-semibold text-[#57606a] mb-1">极性 (何值禁用?)</label>
                                          <select 
                                              className="w-full p-2 border border-[#d0d7de] rounded-md text-sm outline-none"
                                              value={newRule.regPolarity}
                                              onChange={(e: any) => setNewRule({...newRule, regPolarity: e.target.value})}
                                          >
                                              <option value="1_DISABLES">1 = 禁用 / 屏蔽</option>
                                              <option value="0_DISABLES">0 = 禁用 / 屏蔽</option>
                                          </select>
                                      </div>
                                  </div>
                              )}

                              {/* Action & Scope */}
                              <div className="grid grid-cols-2 gap-3 border-t border-[#d0d7de] pt-3">
                                   <div>
                                       <label className="block text-xs font-semibold text-[#57606a] mb-1">控制效果</label>
                                       <select 
                                          className="w-full p-2 border border-[#d0d7de] rounded-md text-sm outline-none font-bold"
                                          value={newRule.action}
                                          onChange={(e: any) => setNewRule({...newRule, action: e.target.value})}
                                       >
                                          <option value="DISABLE">DISABLE (关中断)</option>
                                          <option value="ENABLE">ENABLE (开中断)</option>
                                       </select>
                                   </div>
                                   <div>
                                       <label className="block text-xs font-semibold text-[#57606a] mb-1">作用范围</label>
                                       <select 
                                          className="w-full p-2 border border-[#d0d7de] rounded-md text-sm outline-none"
                                          value={newRule.targetScope}
                                          onChange={(e: any) => setNewRule({...newRule, targetScope: e.target.value})}
                                       >
                                          <option value="GLOBAL">全局 (Global)</option>
                                          <option value="SPECIFIC">特定 ISR</option>
                                       </select>
                                   </div>
                              </div>

                              {/* Specific ISR Linkage */}
                              {newRule.targetScope === 'SPECIFIC' && newRule.pattern !== 'ARG_AS_ID' && newRule.regBitMode !== 'DYNAMIC' && (
                                   <div>
                                       <label className="block text-xs font-semibold text-[#57606a] mb-1">目标 ISR</label>
                                       <select 
                                          className="w-full p-2 border border-[#d0d7de] rounded-md text-sm outline-none"
                                          value={newRule.linkedIsrId || ''}
                                          onChange={e => setNewRule({...newRule, linkedIsrId: e.target.value})}
                                       >
                                          <option value="">-- 选择 ISR --</option>
                                          {isrList.map(isr => (
                                              <option key={isr.id} value={isr.id}>{isr.functionName}</option>
                                          ))}
                                       </select>
                                   </div>
                              )}

                              <button onClick={addRule} className="w-full py-2 bg-[#24292f] text-white rounded-md hover:bg-[#373e47] flex justify-center items-center gap-2 text-sm font-medium">
                                  <Plus size={16} /> 添加规则
                              </button>
                          </div>

                          {/* Rule List */}
                          <div className="space-y-2 max-h-[400px] overflow-y-auto">
                              {controlRules.map(rule => (
                                  <div key={rule.id} className="flex flex-col p-3 bg-white border border-[#d0d7de] rounded-md shadow-sm">
                                      <div className="flex justify-between items-start mb-2">
                                          <div className="flex items-center gap-2">
                                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${rule.action === 'DISABLE' ? 'bg-[#ffebe9] text-[#cf222e] border-[#ff818266]' : 'bg-[#dafbe1] text-[#1a7f37] border-[#4ac26b66]'}`}>
                                                  {rule.action}
                                              </span>
                                              <span className="font-mono text-sm font-bold text-[#24292f]">{rule.identifier}</span>
                                          </div>
                                          <button onClick={() => deleteRule(rule.id)} className="text-[#57606a] hover:text-[#cf222e]"><Trash2 size={14} /></button>
                                      </div>
                                      <div className="text-xs text-[#57606a] grid grid-cols-2 gap-2">
                                          <div><span className="font-semibold">匹配:</span> {renderRuleDescription(rule)}</div>
                                          <div><span className="font-semibold">目标:</span> {getLinkedIsrName(rule)}</div>
                                      </div>
                                  </div>
                              ))}
                          </div>
                       </div>
                    </div>
                 </div>
                 
                 {showConfigPreview && (
                    <div className="mt-8">
                        <h3 className="text-sm font-bold text-[#57606a] mb-2">JSON 预览 (引擎格式)</h3>
                        <div className="bg-[#f6f8fa] p-4 rounded-md border border-[#d0d7de] font-mono text-xs overflow-auto max-h-64">
                            <pre>{JSON.stringify({ isrs: isrList, rules: controlRules }, null, 2)}</pre>
                        </div>
                    </div>
                 )}
              </div>
            )}

            {/* VIEW: DOCUMENTATION (User & Dev Guide) */}
            {view === 'docs' && (
              <div className="p-8 overflow-y-auto h-full max-w-5xl mx-auto bg-white">
                 <div className="mb-8 border-b border-[#d0d7de] pb-4">
                    <h2 className="text-3xl font-bold text-[#24292f] mb-2">文档中心 (Documentation)</h2>
                    <p className="text-[#57606a]">SpecChecker-Int 用户指南与开发者集成手册</p>
                 </div>

                 <div className="space-y-12">
                    
                    {/* Section 1: User Guide */}
                    <section>
                       <h3 className="text-xl font-bold text-[#24292f] flex items-center gap-2 mb-4">
                          <BookOpen size={24} className="text-[#0969da]" /> 
                          功能介绍 (Features)
                       </h3>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div className="p-4 bg-[#f6f8fa] rounded-lg border border-[#d0d7de]">
                              <h4 className="font-bold flex items-center gap-2 mb-2"><FolderOpen size={16}/> 工程管理</h4>
                              <p className="text-sm text-[#57606a]">支持打开本地源代码目录，自动生成文件树，并提供内置的只读 Monaco 编辑器进行代码浏览。</p>
                           </div>
                           <div className="p-4 bg-[#f6f8fa] rounded-lg border border-[#d0d7de]">
                              <h4 className="font-bold flex items-center gap-2 mb-2"><Play size={16}/> 静态分析</h4>
                              <p className="text-sm text-[#57606a]">一键启动分析引擎，通过进度条实时监控分析状态。分析结果将自动加载到审查面板。</p>
                           </div>
                           <div className="p-4 bg-[#f6f8fa] rounded-lg border border-[#d0d7de]">
                              <h4 className="font-bold flex items-center gap-2 mb-2"><Activity size={16}/> 缺陷可视化</h4>
                              <p className="text-sm text-[#57606a]">提供专业的数据流图 (Data Flow) 和并发时序图 (Concurrency Timeline)，直观展示竞争条件和死锁。</p>
                           </div>
                           <div className="p-4 bg-[#f6f8fa] rounded-lg border border-[#d0d7de]">
                              <h4 className="font-bold flex items-center gap-2 mb-2"><Settings size={16}/> 规则配置</h4>
                              <p className="text-sm text-[#57606a]">支持配置 ISR 上下文信息及复杂的控制规则（如寄存器位映射），定制分析引擎的行为。</p>
                           </div>
                       </div>
                    </section>

                    {/* Section 2: Developer Guide */}
                    <section>
                       <h3 className="text-xl font-bold text-[#24292f] flex items-center gap-2 mb-4">
                          <Terminal size={24} className="text-[#8250df]" /> 
                          开发者指南 (Developer Guide)
                       </h3>
                       <div className="prose prose-sm max-w-none text-[#24292f]">
                          <p>SpecChecker-Int 是基于 Electron + React + TypeScript 构建的现代桌面应用。</p>
                          
                          <h4 className="text-base font-bold mt-4 mb-2">项目结构</h4>
                          <ul className="list-disc pl-5 space-y-1">
                             <li><code className="bg-[#eaeef2] px-1 rounded">main.js</code>: Electron 主进程。处理文件 I/O、系统对话框及引擎调用。</li>
                             <li><code className="bg-[#eaeef2] px-1 rounded">preload.js</code>: 安全桥梁。通过 <code className="bg-[#eaeef2] px-1 rounded">contextBridge</code> 暴露 API 给渲染进程。</li>
                             <li><code className="bg-[#eaeef2] px-1 rounded">App.tsx</code>: React 渲染进程。包含所有 UI 逻辑、可视化组件及状态管理。</li>
                             <li><code className="bg-[#eaeef2] px-1 rounded">types.ts</code>: TypeScript 类型定义，确保前后端数据结构一致。</li>
                          </ul>

                          <h4 className="text-base font-bold mt-4 mb-2">如何修改应用</h4>
                          <p>
                             前端修改主要集中在 <code className="bg-[#eaeef2] px-1 rounded">src/</code> (本示例中为根目录 App.tsx)。
                             后端逻辑（如新增文件操作）需修改 <code className="bg-[#eaeef2] px-1 rounded">main.js</code> 中的 <code className="bg-[#eaeef2] px-1 rounded">ipcMain.handle</code>，并在 <code className="bg-[#eaeef2] px-1 rounded">preload.js</code> 中暴露。
                          </p>
                       </div>
                    </section>

                    {/* Section 3: Integration Guide */}
                    <section>
                       <h3 className="text-xl font-bold text-[#24292f] flex items-center gap-2 mb-4">
                          <Package size={24} className="text-[#cf222e]" /> 
                          分析引擎集成 (Integration)
                       </h3>
                       <div className="bg-[#24292f] text-white p-6 rounded-lg font-mono text-sm overflow-x-auto">
                          <p className="text-[#8b949e] mb-2">// 目前 main.js 使用模拟数据演示分析过程。</p>
                          <p className="text-[#8b949e] mb-4">// 若要集成真实的 CLI 分析工具 (如 cppcheck, clang-tidy 或 自研引擎)，请修改 "run-analysis-engine" 处理器。</p>
                          
                          <div className="mb-4">
                             <span className="text-[#ff7b72]">ipcMain</span>.<span className="text-[#d2a8ff]">handle</span>(<span className="text-[#a5d6ff]">'run-analysis-engine'</span>, <span className="text-[#ff7b72]">async</span> (event, projectPath) => {'{'}
                          </div>
                          
                          <div className="pl-6 text-[#8b949e] mb-2">
                             // 1. 引入 child_process 模块
                          </div>
                          <div className="pl-6 mb-2">
                             <span className="text-[#ff7b72]">const</span> {'{'} spawn {'}'} = <span className="text-[#79c0ff]">require</span>(<span className="text-[#a5d6ff]">'child_process'</span>);
                          </div>

                          <div className="pl-6 text-[#8b949e] mb-2">
                             // 2. 替换模拟循环为真实进程调用
                          </div>
                          <div className="pl-6 mb-2">
                             <span className="text-[#ff7b72]">const</span> engine = <span className="text-[#d2a8ff]">spawn</span>(<span className="text-[#a5d6ff]">'./path/to/engine.exe'</span>, [<span className="text-[#a5d6ff]">'--project'</span>, projectPath, <span className="text-[#a5d6ff]">'--output'</span>, <span className="text-[#a5d6ff]">'results.json'</span>]);
                          </div>

                          <div className="pl-6 mb-2">
                             engine.stdout.<span className="text-[#d2a8ff]">on</span>(<span className="text-[#a5d6ff]">'data'</span>, (data) => {'{'}
                          </div>
                          <div className="pl-12">
                             <span className="text-[#8b949e]">// 解析引擎输出进度，发送给前端</span>
                             <span className="text-[#79c0ff]">event</span>.sender.<span className="text-[#d2a8ff]">send</span>(<span className="text-[#a5d6ff]">'analysis-progress'</span>, {'{'} progress: <span className="text-[#79c0ff]">...</span>, message: <span className="text-[#79c0ff]">data.toString()</span> {'}'});
                          </div>
                          <div className="pl-6 mb-2">{'}'});</div>

                          <div className="pl-6 mb-2">
                             <span className="text-[#ff7b72]">await new</span> <span className="text-[#d2a8ff]">Promise</span>((resolve) => engine.<span className="text-[#d2a8ff]">on</span>(<span className="text-[#a5d6ff]">'close'</span>, resolve));
                          </div>
                          
                          <div className="pl-6 text-[#8b949e] mb-2">
                             // 3. 返回结果文件路径
                          </div>
                          <div className="pl-6">
                             <span className="text-[#ff7b72]">return</span> path.<span className="text-[#d2a8ff]">join</span>(projectPath, <span className="text-[#a5d6ff]">'results.json'</span>);
                          </div>

                          <div>{'}'});</div>
                       </div>
                       
                       <div className="mt-4 p-4 bg-[#fff8c5] border border-[#d4a72c66] rounded-md text-[#9a6700] text-sm">
                          <strong>注意：</strong> 分析引擎必须输出符合 <code>types.ts</code> 中定义的 <code>Issue[]</code> 结构的 JSON 文件。
                          您可以参考根目录下的 <code>example_defects.json</code> 或运行 <code>defect_model_builder.py</code> 来查看标准格式。
                       </div>
                    </section>

                 </div>
              </div>
            )}

         </main>
      </div>
    </div>
  );
};

export default App;
