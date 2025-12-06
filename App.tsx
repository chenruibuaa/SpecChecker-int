
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  ShieldAlert, 
  FileCode, 
  GitGraph, 
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
  Monitor
} from 'lucide-react';
import { MOCK_ISSUES } from './constants';
import { Issue, Severity, Status, IssueType, ThreadEvent } from './types';
import DataFlowVisualizer from './components/DataFlowVisualizer';
import ConcurrencyVisualizer from './components/ConcurrencyVisualizer';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';

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

const App: React.FC = () => {
  const [issues, setIssues] = useState<Issue[]>(MOCK_ISSUES);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<Severity | 'ALL'>('ALL');
  const [filterType, setFilterType] = useState<IssueType | 'ALL'>('ALL');
  const [view, setView] = useState<'dashboard' | 'issues' | 'settings'>('dashboard');
  const [showConfigPreview, setShowConfigPreview] = useState(false);
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Configuration State ---
  const [isrList, setIsrList] = useState<ISRConfig[]>([
    { id: '1', functionName: 'SysTick_Handler', priority: 15, hardwareId: '-1', description: 'System Tick Timer' },
    { id: '2', functionName: 'USART1_IRQHandler', priority: 1, hardwareId: '37', description: 'High priority serial comms' },
    { id: '3', functionName: 'DMA1_Channel1_IRQHandler', priority: 0, hardwareId: '11', description: 'Critical data transfer' },
  ]);

  const [controlRules, setControlRules] = useState<ControlRule[]>([
    { 
      id: '1', mode: 'FUNCTION', identifier: 'disableisr', 
      pattern: 'ARG_MATCH', argIndex: 0, matchValue: '-1',
      action: 'DISABLE', targetScope: 'GLOBAL' 
    },
    { 
      id: '2', mode: 'REGISTER', identifier: 'PRIMASK',
      pattern: 'REG_BIT_MAPPING', regBitMode: 'FIXED', regBitIndex: 0, regPolarity: '1_DISABLES',
      action: 'DISABLE', targetScope: 'GLOBAL', targetDetail: 'CPU Mask Bit'
    },
    {
      id: '3', mode: 'FUNCTION', identifier: 'HAL_UART_DisableIT',
      pattern: 'SIMPLE',
      action: 'DISABLE', targetScope: 'SPECIFIC', linkedIsrId: '2' 
    },
    { 
      id: '4', mode: 'REGISTER', identifier: 'IE', 
      pattern: 'REG_BIT_MAPPING', regBitMode: 'FIXED', regBitIndex: 7, regPolarity: '0_DISABLES',
      action: 'DISABLE', targetScope: 'SPECIFIC', targetDetail: 'UART Enable Bit', linkedIsrId: '2'
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

  // Detect Electron Environment
  const isElectron = useMemo(() => {
    return typeof navigator === 'object' && /Electron/i.test(navigator.userAgent);
  }, []);

  // Scroll to highlighted line
  useEffect(() => {
    if (highlightedLine !== null) {
      const element = document.getElementById(`code-line-${highlightedLine}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightedLine, selectedIssueId]);

  useEffect(() => {
      setHighlightedLine(null);
  }, [selectedIssueId]);

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
        
        // 1. Detect Custom SpecChecker Format (Full Fidelity)
        if (json.meta && json.issues && Array.isArray(json.issues)) {
             setIssues(json.issues);
             if (json.config) {
                 // Optionally restore config
             }
             alert(`已导入完整项目数据: ${json.issues.length} 个缺陷`);
             setView('issues');
        } 
        // 2. Detect SARIF Format
        else if (json.runs) {
            const importedIssues: Issue[] = [];
            json.runs.forEach((run: any) => {
                if (run.results) {
                run.results.forEach((result: any, index: number) => {
                    const location = result.locations?.[0]?.physicalLocation;
                    let severity = Severity.LOW;
                    if (result.level === 'error') severity = Severity.CRITICAL;
                    else if (result.level === 'warning') severity = Severity.MEDIUM;
                    else if (result.level === 'note') severity = Severity.LOW;
                    
                    importedIssues.push({
                        id: result.ruleId || `sarif-${Date.now()}-${index}`,
                        title: result.message?.text || result.ruleId || 'Untitled Issue',
                        description: result.message?.text || 'No description provided.',
                        severity: severity,
                        type: IssueType.QUALITY,
                        status: Status.OPEN,
                        file: location?.artifactLocation?.uri || 'unknown',
                        line: location?.region?.startLine || 0,
                        rawCodeSnippet: location?.contextRegion?.snippet?.text || 
                                    location?.region?.snippet?.text || 
                                    '// Code snippet not available in SARIF source.',
                    });
                });
                }
            });
            if (importedIssues.length > 0) {
                setIssues(importedIssues);
                alert(`已从 SARIF 导入 ${importedIssues.length} 个缺陷。注意：可视化详情可能已丢失。`);
                setView('issues');
            } else {
                alert("导入的文件中未发现缺陷数据。");
            }
        } else {
            alert("未知的文件格式。请使用 SARIF 或 SpecChecker 专有格式 (.csj, .json)。");
        }
      } catch (err) {
        console.error(err);
        alert("文件解析失败，请确保格式正确。");
      }
    };
    reader.readAsText(file);
    event.target.value = ''; 
  };

  // Export Full Project State (Custom Format)
  const handleExportFullData = () => {
      const data = {
          meta: {
              version: "1.0",
              exportedAt: new Date().toISOString(),
              tool: "SpecChecker-Int"
          },
          issues: issues, // Contains all visualization data
          config: {
              isrList,
              controlRules
          }
      };
      downloadJson(data, `specchecker-project-${Date.now()}.json`);
  };

  // Export SARIF (Standard Format)
  const handleExportSarif = () => {
    const sarifOutput = {
      version: "2.1.0",
      $schema: "https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0-rtm.5.json",
      runs: [
        {
          tool: {
            driver: {
              name: "SpecChecker-Int",
              version: "2.4.0",
              rules: []
            }
          },
          results: issues.map(issue => ({
            ruleId: issue.id,
            level: issue.severity === Severity.CRITICAL || issue.severity === Severity.HIGH ? 'error' : 
                   issue.severity === Severity.MEDIUM ? 'warning' : 'note',
            message: {
              text: issue.description
            },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: issue.file
                  },
                  region: {
                    startLine: issue.line,
                    snippet: {
                      text: issue.rawCodeSnippet
                    }
                  }
                }
              }
            ],
            properties: {
              title: issue.title,
              status: issue.status,
              type: issue.type
            }
          }))
        }
      ]
    };
    downloadJson(sarifOutput, `specchecker-report-${Date.now()}.sarif`);
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
      { name: 'Open', value: issues.filter(i => i.status === Status.OPEN).length, color: '#0969da' },
      { name: 'Confirmed', value: issues.filter(i => i.status === Status.CONFIRMED).length, color: '#1a7f37' },
      { name: 'False Positive', value: issues.filter(i => i.status === Status.FALSE_POSITIVE).length, color: '#8c959f' },
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

  const getLineNumber = (lineText: string): number | null => {
      const match = lineText.match(/^\s*(\d+):/);
      return match ? parseInt(match[1]) : null;
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
      case IssueType.DATA_FLOW: return <GitGraph size={16} />;
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
          // Optimized Register Display
          if (rule.pattern === 'REG_BIT_MAPPING') {
             const logic = rule.regPolarity === '1_DISABLES' 
                ? '1=Disable' 
                : '1=Enable';
                
             const index = rule.regBitMode === 'DYNAMIC' 
                ? 'Dyn (1 << N)' 
                : `Bit ${rule.regBitIndex}`;

             return (
               <span className="flex items-center gap-2">
                 <span className="bg-[#f6f8fa] px-1.5 py-0.5 rounded border border-[#d0d7de] font-mono text-xs">{index}</span>
                 <span>{logic}</span>
               </span>
             );
          }
          if (rule.pattern === 'WRITE_VAL') return `写入值 == ${rule.matchValue}`;
          if (rule.pattern === 'BITWISE_MASK') return `Mask: ${rule.matchValue}`;
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

  const generateEngineConfig = () => {
    // ... same generation logic ...
    const config = {
      meta: { project: "Backend-Core-v2.4", version: "1.2", note: "Auto-generated" },
      interrupt_vectors: isrList.map(isr => ({
        symbol: isr.functionName,
        hw_id: isNaN(Number(isr.hardwareId)) ? isr.hardwareId : Number(isr.hardwareId),
        priority: isr.priority
      })),
      control_rules: controlRules.map(rule => {
        let trigger: any = { type: rule.mode === 'FUNCTION' ? 'call' : 'write', symbol: rule.identifier };
        let match: any = {};
        if (rule.pattern === 'SIMPLE') match = { type: 'always' };
        else if (rule.pattern === 'ARG_MATCH') match = { type: 'arg_eq', index: rule.argIndex, value: rule.matchValue };
        else if (rule.pattern === 'ARG_AS_ID') match = { type: 'arg_is_id', index: rule.argIndex };
        else if (rule.pattern === 'REG_BIT_MAPPING') match = { type: 'bit_logic', bit_index: rule.regBitMode === 'DYNAMIC' ? 'dynamic_shift' : rule.regBitIndex, disable_value: rule.regPolarity === '1_DISABLES' ? 1 : 0 };
        else if (rule.pattern === 'WRITE_VAL') match = { type: 'val_eq', value: rule.matchValue };
        trigger.match = match;
        let effect: any = { action: rule.action ? rule.action.toLowerCase() : 'disable', scope: (rule.pattern === 'ARG_AS_ID' || (rule.mode === 'REGISTER' && rule.regBitMode === 'DYNAMIC')) ? 'dynamic' : rule.targetScope.toLowerCase() };
        if (effect.scope === 'specific' && rule.linkedIsrId) {
           const linkedIsr = isrList.find(i => i.id === rule.linkedIsrId);
           if (linkedIsr) effect.target_hw_id = isNaN(Number(linkedIsr.hardwareId)) ? linkedIsr.hardwareId : Number(linkedIsr.hardwareId);
        } 
        return { trigger, effect };
      })
    };
    return JSON.stringify(config, null, 2);
  };

  return (
    <div className="flex flex-col h-screen bg-[#f6f8fa] text-[#24292f]">
      
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept=".sarif,.json,.csj" 
        className="hidden" 
      />

      {/* Top Navigation Bar - GitHub Header Style */}
      <nav className="h-14 bg-[#24292f] text-white flex items-center justify-between px-6 shadow-sm z-30 shrink-0">
         <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-white/90">
              <ShieldAlert size={20} />
              <h1 className="font-semibold text-lg tracking-tight">SpecChecker-Int</h1>
              {isElectron && (
                <span className="px-2 py-0.5 rounded bg-[#0969da] border border-[#0969da] text-[10px] text-white font-medium flex items-center gap-1">
                    <Monitor size={10} /> Desktop Client
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button 
                onClick={() => setView('dashboard')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all text-sm font-medium ${view === 'dashboard' ? 'bg-[#373e47] text-white' : 'hover:text-white/80 text-white/70'}`}
              >
                <LayoutDashboard size={14} />
                仪表盘
              </button>
              
              <button 
                 onClick={() => setView('issues')}
                 className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all text-sm font-medium ${view === 'issues' ? 'bg-[#373e47] text-white' : 'hover:text-white/80 text-white/70'}`}
              >
                <FileCode size={14} />
                缺陷列表
              </button>

              <button 
                 onClick={() => setView('settings')}
                 className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all text-sm font-medium ${view === 'settings' ? 'bg-[#373e47] text-white' : 'hover:text-white/80 text-white/70'}`}
              >
                <Settings size={14} />
                配置
              </button>
            </div>
         </div>

         <div className="flex items-center gap-4">
             <div className="hidden md:block text-right">
                <p className="text-xs font-semibold text-white/90">Backend-Core-v2.4</p>
             </div>
             <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                <span className="font-bold text-xs text-white">JS</span>
             </div>
         </div>
      </nav>

      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 flex flex-col relative bg-[#f6f8fa] overflow-hidden">
          
          {/* Sub Header (Contextual Actions) */}
          {(view === 'dashboard' || view === 'issues') && (
              <div className="bg-white border-b border-[#d0d7de] px-6 py-3 shadow-sm z-10 flex justify-between items-center shrink-0">
                <h2 className="text-base font-semibold text-[#24292f]">
                  {view === 'dashboard' ? '项目概览' : '缺陷审计'}
                </h2>
                <div className="flex items-center gap-2">
                   <button 
                      onClick={handleImportClick}
                      className="flex items-center gap-2 px-3 py-1.5 bg-[#f6f8fa] border border-[#d0d7de] text-[#24292f] rounded-md text-xs font-medium hover:bg-[#f3f4f6] transition-colors"
                   >
                      <UploadCloud size={14} />
                      导入数据
                   </button>
                   <div className="h-4 w-px bg-[#d0d7de]"></div>
                   <button 
                      onClick={handleExportSarif}
                      className="flex items-center gap-2 px-3 py-1.5 bg-[#f6f8fa] border border-[#d0d7de] text-[#24292f] rounded-md text-xs font-medium hover:bg-[#f3f4f6] transition-colors"
                      title="导出标准 SARIF 格式 (兼容性)"
                   >
                      <FileJson size={14} />
                      导出 SARIF
                   </button>
                    <button 
                      onClick={handleExportFullData}
                      className="flex items-center gap-2 px-3 py-1.5 bg-[#0969da] text-white border border-[#0969da] rounded-md text-xs font-medium hover:bg-[#0860ca] transition-colors shadow-sm"
                      title="导出完整项目数据 (包含可视化)"
                   >
                      <Database size={14} />
                      导出全量数据 (.json)
                   </button>
                </div>
              </div>
          )}

          {/* DASHBOARD VIEW */}
          {view === 'dashboard' && (
            <div className="p-8 overflow-y-auto h-full">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-md border border-[#d0d7de] shadow-sm">
                    <div className="text-[#57606a] text-xs font-semibold mb-1">总缺陷数</div>
                    <div className="text-2xl font-light text-[#24292f]">{stats.total}</div>
                </div>
                <div className="bg-white p-6 rounded-md border border-[#d0d7de] shadow-sm relative overflow-hidden">
                    <div className="text-[#cf222e] text-xs font-semibold mb-1">Critical</div>
                    <div className="text-2xl font-light text-[#cf222e]">{stats.critical}</div>
                </div>
                <div className="bg-white p-6 rounded-md border border-[#d0d7de] shadow-sm">
                    <div className="text-[#9a6700] text-xs font-semibold mb-1">High</div>
                    <div className="text-2xl font-light text-[#9a6700]">{stats.high}</div>
                </div>
                <div className="bg-white p-6 rounded-md border border-[#d0d7de] shadow-sm">
                    <div className="text-[#0969da] text-xs font-semibold mb-1">Medium</div>
                    <div className="text-2xl font-light text-[#0969da]">{stats.medium}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white p-6 rounded-md border border-[#d0d7de] shadow-sm">
                      <h3 className="text-sm font-semibold text-[#24292f] mb-4">状态分布</h3>
                      <div className="h-64">
                         <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={stats.byStatus}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={2}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {stats.byStatus.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <RechartsTooltip contentStyle={{ borderRadius: '6px', border: '1px solid #d0d7de' }} />
                                <Legend />
                            </PieChart>
                         </ResponsiveContainer>
                      </div>
                  </div>
                  <div className="bg-white p-6 rounded-md border border-[#d0d7de] shadow-sm">
                      <h3 className="text-sm font-semibold text-[#24292f] mb-4">待处理高危问题</h3>
                      <div className="space-y-2">
                          {issues.filter(i => i.severity === Severity.CRITICAL || i.severity === Severity.HIGH).slice(0, 4).map(issue => (
                              <div key={issue.id} className="p-3 bg-[#f6f8fa] rounded-md border border-[#d0d7de] flex items-start gap-3 cursor-pointer hover:bg-[#eaeef2]" onClick={() => { setSelectedIssueId(issue.id); setView('issues'); }}>
                                  <div className={`mt-0.5 p-1 rounded-sm ${issue.severity === Severity.CRITICAL ? 'text-[#cf222e]' : 'text-[#9a6700]'}`}>
                                      {getTypeIcon(issue.type)}
                                  </div>
                                  <div>
                                      <div className="font-semibold text-[#24292f] text-sm hover:text-[#0969da]">{issue.title}</div>
                                      <div className="text-xs text-[#57606a] mt-0.5 font-mono">{issue.file}:{issue.line}</div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
            </div>
          )}

          {/* ISSUES VIEW */}
          {view === 'issues' && (
            <div className="flex h-full overflow-hidden">
              <div className="w-[35%] min-w-[350px] bg-white border-r border-[#d0d7de] flex flex-col">
                <div className="p-3 border-b border-[#d0d7de] bg-[#f6f8fa] flex flex-col gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#57606a]" size={14} />
                        <input type="text" placeholder="Filter..." className="w-full pl-8 pr-3 py-1.5 text-sm border border-[#d0d7de] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent bg-white" />
                    </div>
                    
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <select 
                                className="w-full px-2 py-1.5 text-xs border border-[#d0d7de] rounded-md bg-white text-[#24292f] font-medium focus:ring-1 focus:ring-[#0969da]"
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value as any)}
                            >
                                <option value="ALL">All Types</option>
                                <option value={IssueType.DATA_FLOW}>Data Flow</option>
                                <option value={IssueType.CONCURRENCY}>Concurrency</option>
                                <option value={IssueType.SECURITY}>Security</option>
                            </select>
                        </div>
                        <div className="w-28">
                             <select 
                                className="w-full px-2 py-1.5 text-xs border border-[#d0d7de] rounded-md bg-white text-[#24292f] font-medium focus:ring-1 focus:ring-[#0969da]"
                                value={filterSeverity}
                                onChange={(e) => setFilterSeverity(e.target.value as any)}
                            >
                                <option value="ALL">Severity</option>
                                <option value={Severity.CRITICAL}>Critical</option>
                                <option value={Severity.HIGH}>High</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {filteredIssues.length === 0 ? (
                        <div className="p-8 text-center text-[#57606a] text-sm">No issues found.</div>
                    ) : (
                        filteredIssues.map(issue => (
                            <div 
                                key={issue.id} 
                                onClick={() => setSelectedIssueId(issue.id)}
                                className={`p-4 border-b border-[#d0d7de] cursor-pointer hover:bg-[#f6f8fa] transition-colors ${selectedIssueId === issue.id ? 'bg-[#f1f8ff] border-l-4 border-l-[#0969da]' : 'border-l-4 border-l-transparent'}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <div className="flex items-center gap-2">
                                         <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${getSeverityColor(issue.severity)}`}>
                                            {issue.severity}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-[#57606a] uppercase font-semibold">{issue.status}</span>
                                </div>
                                <h4 className="font-semibold text-[#24292f] text-sm mb-1 leading-tight">{issue.title}</h4>
                                <div className="flex items-center gap-2 text-xs text-[#57606a] mb-2 truncate">
                                    <FileCode size={12} />
                                    <span className="font-mono text-[#57606a] truncate max-w-[180px]">{issue.file}:{issue.line}</span>
                                </div>
                                <div>
                                    <span className="inline-flex items-center gap-1 text-[10px] text-[#57606a] bg-[#f6f8fa] px-1.5 py-0.5 rounded border border-[#d0d7de]">
                                        {getTypeIcon(issue.type)} {getTypeName(issue.type)}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
              </div>

              {/* Detail View */}
              <div className="flex-1 bg-white flex flex-col h-full overflow-hidden">
                {selectedIssue ? (
                    <div className="flex-1 overflow-y-auto p-8">
                        <div className="bg-white rounded-md border border-[#d0d7de] p-6 mb-6">
                            <div className="flex justify-between items-start">
                                <div className="flex-1 mr-4">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h2 className="text-xl font-semibold text-[#24292f]">{selectedIssue.title}</h2>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${getSeverityColor(selectedIssue.severity)}`}>
                                            {selectedIssue.severity}
                                        </span>
                                    </div>
                                    <p className="text-[#24292f] text-sm mb-4 leading-relaxed">{selectedIssue.description}</p>
                                    <div className="flex flex-wrap items-center gap-4 text-xs text-[#57606a] bg-[#f6f8fa] p-2 rounded border border-[#d0d7de]">
                                        <span className="flex items-center gap-1">
                                            <FileCode size={14} />
                                            <span className="font-mono font-semibold">{selectedIssue.file}:{selectedIssue.line}</span>
                                        </span>
                                        <div className="w-px h-3 bg-[#d0d7de]"></div>
                                        <span className="flex items-center gap-1">
                                            <Bug size={14} />
                                            ID: {selectedIssue.id}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2 shrink-0">
                                    {selectedIssue.status !== Status.CONFIRMED && (
                                        <button 
                                            onClick={() => handleUpdateStatus(selectedIssue.id, Status.CONFIRMED)}
                                            className="flex items-center justify-center gap-2 px-3 py-1.5 bg-[#1a7f37] text-white rounded-md hover:bg-[#156a2d] transition-colors border border-transparent font-medium text-xs w-28 shadow-sm"
                                        >
                                            <CheckCircle size={14} />
                                            确认问题
                                        </button>
                                    )}
                                     {selectedIssue.status !== Status.FALSE_POSITIVE && (
                                        <button 
                                            onClick={() => handleUpdateStatus(selectedIssue.id, Status.FALSE_POSITIVE)}
                                            className="flex items-center justify-center gap-2 px-3 py-1.5 bg-[#f6f8fa] text-[#24292f] border border-[#d0d7de] rounded-md hover:bg-[#f3f4f6] transition-colors font-medium text-xs w-28 shadow-sm"
                                        >
                                            <XCircle size={14} />
                                            误报/忽略
                                        </button>
                                     )}
                                </div>
                            </div>
                        </div>

                        {selectedIssue.type === IssueType.DATA_FLOW && selectedIssue.dataFlow && (
                            <div className="mb-6">
                                <DataFlowVisualizer nodes={selectedIssue.dataFlow.nodes} edges={selectedIssue.dataFlow.edges} />
                            </div>
                        )}

                        {selectedIssue.type === IssueType.CONCURRENCY && selectedIssue.concurrency && (
                             <div className="mb-6">
                                <ConcurrencyVisualizer 
                                    threads={selectedIssue.concurrency.threads} 
                                    events={selectedIssue.concurrency.events} 
                                    relations={selectedIssue.concurrency.relations}
                                    onEventClick={handleEventClick}
                                />
                                <div className="text-xs text-[#57606a] text-center mt-2 flex items-center justify-center gap-1">
                                    <Activity size={12}/> 
                                    提示: 点击上方时序图中的事件可跳转至下方对应代码行。
                                </div>
                            </div>
                        )}

                        {/* GitHub-style Code Viewer (Light) */}
                        <div className="bg-white rounded-md border border-[#d0d7de] overflow-hidden">
                            <div className="px-4 py-2 bg-[#f6f8fa] border-b border-[#d0d7de] flex justify-between items-center">
                                <span className="text-[#24292f] text-xs font-mono flex items-center gap-2 font-semibold">
                                    <FileCode size={12}/>
                                    {selectedIssue.file}
                                </span>
                                <span className="text-[10px] text-[#57606a] uppercase font-bold tracking-wider">Read-only</span>
                            </div>
                            <div className="p-0 overflow-x-auto code-scroll bg-white">
                                <div className="font-mono text-sm leading-6">
                                    {selectedIssue.rawCodeSnippet.split('\n').map((line, idx) => {
                                        const lineNumber = getLineNumber(line);
                                        const isActive = lineNumber === highlightedLine;
                                        // Simple syntax highlighting simulation for light theme
                                        const isHighlight = line.includes('//') && (line.includes('VULNERABILITY') || line.includes('HARDCODED') || line.includes('Deadlock'));
                                        
                                        return (
                                            <div 
                                                key={idx} 
                                                id={lineNumber ? `code-line-${lineNumber}` : undefined}
                                                className={`
                                                    flex px-4 hover:bg-[#f6f8fa]
                                                    ${isHighlight ? 'bg-[#ffebe9]' : ''}
                                                    ${isActive ? 'bg-[#ddf4ff] transition-colors duration-500' : ''}
                                                `}
                                            >
                                               <span className="inline-block w-8 mr-4 text-right text-[#6e7781] select-none text-xs leading-6 border-r border-[#d0d7de] pr-2">{lineNumber || ''}</span>
                                               <span className={`
                                                    ${isHighlight ? 'text-[#cf222e] font-semibold' : 'text-[#24292f]'}
                                               `}>
                                                   {/* Basic Tokenizing for color */}
                                                   {line.replace(/^\s*\d+:\s*/, '')} 
                                               </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>

                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-[#57606a]">
                        <Search size={48} className="text-[#d0d7de] mb-4" />
                        <p className="font-semibold text-[#24292f]">Select an issue to view details</p>
                    </div>
                )}
              </div>
            </div>
          )}

          {/* SETTINGS VIEW */}
          {view === 'settings' && (
             <div className="p-8 h-full overflow-y-auto">
                <div className="max-w-6xl mx-auto space-y-8 pb-10">
                    <div className="flex justify-between items-center bg-white p-6 rounded-md border border-[#d0d7de] shadow-sm">
                         <div>
                            <h2 className="text-lg font-bold text-[#24292f]">静态分析高级配置</h2>
                            <p className="text-[#57606a] text-sm mt-1">配置中断入口与操作规则。</p>
                         </div>
                         <div className="flex gap-2">
                             <button 
                                onClick={() => setShowConfigPreview(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-[#f6f8fa] border border-[#d0d7de] text-[#24292f] rounded-md shadow-sm font-medium hover:bg-[#f3f4f6] transition-all text-xs"
                             >
                                <Code size={14} />
                                预览 JSON
                             </button>
                             <button 
                                onClick={handleSaveConfig}
                                className={`flex items-center gap-2 px-6 py-2 rounded-md shadow-sm font-medium transition-all text-xs ${isSaved ? 'bg-[#1a7f37] text-white' : 'bg-[#0969da] text-white hover:bg-[#0860ca]'}`}
                             >
                                {isSaved ? <CheckCircle size={14} /> : <Save size={14} />}
                                {isSaved ? '已保存' : '保存更改'}
                             </button>
                         </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                        <div className="bg-white rounded-md border border-[#d0d7de] shadow-sm flex flex-col h-full">
                            <div className="p-4 border-b border-[#d0d7de] bg-[#f6f8fa] rounded-t-md">
                                <h3 className="font-semibold text-[#24292f] text-sm flex items-center gap-2"><Zap size={16}/> 中断入口 (ISR)</h3>
                            </div>
                            
                            <div className="flex-1 p-0 overflow-hidden">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-[#f6f8fa] text-[#57606a] font-medium border-b border-[#d0d7de]">
                                        <tr>
                                            <th className="px-4 py-2">函数名称</th>
                                            <th className="px-4 py-2">HW ID</th>
                                            <th className="px-4 py-2">优先级</th>
                                            <th className="px-4 py-2"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#d0d7de]">
                                        {isrList.map((isr) => (
                                            <tr key={isr.id} className="hover:bg-[#f6f8fa]">
                                                <td className="px-4 py-2 font-mono text-[#24292f] text-xs">{isr.functionName}</td>
                                                <td className="px-4 py-2 text-xs">{isr.hardwareId}</td>
                                                <td className="px-4 py-2"><span className="bg-[#ddf4ff] text-[#0969da] px-1.5 py-0.5 rounded text-xs font-semibold">{isr.priority}</span></td>
                                                <td className="px-4 py-2 text-right">
                                                    <button onClick={() => deleteISR(isr.id)} className="text-[#57606a] hover:text-[#cf222e]"><Trash2 size={14} /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                             <div className="p-4 border-t border-[#d0d7de] bg-[#f6f8fa]">
                                 <div className="flex gap-2">
                                     <input className="flex-1 text-xs border border-[#d0d7de] rounded px-2 py-1.5" placeholder="Name" value={newISR.functionName || ''} onChange={e => setNewISR({...newISR, functionName: e.target.value})} />
                                     <input className="w-20 text-xs border border-[#d0d7de] rounded px-2 py-1.5" placeholder="HW ID" value={newISR.hardwareId || ''} onChange={e => setNewISR({...newISR, hardwareId: e.target.value})} />
                                     <input type="number" className="w-16 text-xs border border-[#d0d7de] rounded px-2 py-1.5" placeholder="Prio" value={newISR.priority} onChange={e => setNewISR({...newISR, priority: parseInt(e.target.value)})} />
                                     <button onClick={addISR} className="bg-[#f6f8fa] border border-[#d0d7de] px-3 rounded text-[#24292f] hover:bg-[#eef1f4]"><Plus size={14}/></button>
                                 </div>
                             </div>
                        </div>

                        <div className="bg-white rounded-md border border-[#d0d7de] shadow-sm flex flex-col h-full">
                            <div className="p-4 border-b border-[#d0d7de] bg-[#f6f8fa] rounded-t-md">
                                <h3 className="font-semibold text-[#24292f] text-sm flex items-center gap-2"><Layers size={16}/> 控制规则</h3>
                            </div>
                             <div className="flex-1 p-0 overflow-hidden">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-[#f6f8fa] text-[#57606a] font-medium border-b border-[#d0d7de]">
                                        <tr>
                                            <th className="px-4 py-2">ID</th>
                                            <th className="px-4 py-2">逻辑</th>
                                            <th className="px-4 py-2">目标</th>
                                            <th className="px-4 py-2"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#d0d7de]">
                                        {controlRules.map((rule) => (
                                            <tr key={rule.id} className="hover:bg-[#f6f8fa]">
                                                <td className="px-4 py-2 font-mono text-[#24292f] text-xs font-bold">{rule.identifier}</td>
                                                <td className="px-4 py-2 text-xs">{renderRuleDescription(rule)}</td>
                                                <td className="px-4 py-2 text-xs">{getLinkedIsrName(rule)}</td>
                                                <td className="px-4 py-2 text-right">
                                                    <button onClick={() => deleteRule(rule.id)} className="text-[#57606a] hover:text-[#cf222e]"><Trash2 size={14} /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            
                            <div className="p-4 border-t border-[#d0d7de] bg-[#f6f8fa] space-y-3">
                                {/* Mode Selection */}
                                <div className="flex gap-2 p-1 bg-white border border-[#d0d7de] rounded-md">
                                    <button 
                                        onClick={() => switchMode('FUNCTION')} 
                                        className={`flex-1 text-xs py-1.5 rounded-sm font-medium transition-colors ${newRule.mode === 'FUNCTION' ? 'bg-[#ddf4ff] text-[#0969da]' : 'text-[#57606a] hover:bg-[#f6f8fa]'}`}
                                    >
                                        Function Call
                                    </button>
                                    <button 
                                        onClick={() => switchMode('REGISTER')} 
                                        className={`flex-1 text-xs py-1.5 rounded-sm font-medium transition-colors ${newRule.mode === 'REGISTER' ? 'bg-[#ddf4ff] text-[#0969da]' : 'text-[#57606a] hover:bg-[#f6f8fa]'}`}
                                    >
                                        Register Write
                                    </button>
                                </div>

                                {/* Identifier */}
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-[#57606a] mb-1 block">
                                        {newRule.mode === 'FUNCTION' ? 'Function Name' : 'Register Name'}
                                    </label>
                                    <input 
                                        type="text" 
                                        placeholder={newRule.mode === 'FUNCTION' ? 'e.g. NVIC_DisableIRQ' : 'e.g. TIM2_IER'} 
                                        className="w-full text-xs border border-[#d0d7de] rounded px-2 py-1.5 bg-white" 
                                        value={newRule.identifier || ''} 
                                        onChange={e => setNewRule({...newRule, identifier: e.target.value})} 
                                    />
                                </div>

                                {/* Function Specific Configs */}
                                {newRule.mode === 'FUNCTION' && (
                                    <div className="space-y-3">
                                         <div className="grid grid-cols-2 gap-2">
                                             <div>
                                                <label className="text-[10px] uppercase font-bold text-[#57606a] mb-1 block">Pattern</label>
                                                <select 
                                                    className="w-full text-xs border border-[#d0d7de] rounded px-2 py-1.5 bg-white"
                                                    value={newRule.pattern}
                                                    onChange={e => setNewRule({...newRule, pattern: e.target.value as any})}
                                                >
                                                    <option value="SIMPLE">Always Trigger</option>
                                                    <option value="ARG_MATCH">Match Argument</option>
                                                    <option value="ARG_AS_ID">Arg is HW ID</option>
                                                </select>
                                             </div>
                                             <div>
                                                <label className="text-[10px] uppercase font-bold text-[#57606a] mb-1 block">Effect Action</label>
                                                <select 
                                                    className="w-full text-xs border border-[#d0d7de] rounded px-2 py-1.5 bg-white"
                                                    value={newRule.action}
                                                    onChange={e => setNewRule({...newRule, action: e.target.value as any})}
                                                >
                                                    <option value="DISABLE">Disable ISR</option>
                                                    <option value="ENABLE">Enable ISR</option>
                                                </select>
                                             </div>
                                         </div>

                                         {(newRule.pattern === 'ARG_MATCH' || newRule.pattern === 'ARG_AS_ID') && (
                                             <div className="flex gap-2">
                                                <div className="w-1/3">
                                                    <label className="text-[10px] uppercase font-bold text-[#57606a] mb-1 block">Arg Index</label>
                                                    <input 
                                                        type="number" 
                                                        className="w-full text-xs border border-[#d0d7de] rounded px-2 py-1.5 bg-white" 
                                                        value={newRule.argIndex} 
                                                        onChange={e => setNewRule({...newRule, argIndex: parseInt(e.target.value)})} 
                                                    />
                                                </div>
                                                {newRule.pattern === 'ARG_MATCH' && (
                                                    <div className="flex-1">
                                                        <label className="text-[10px] uppercase font-bold text-[#57606a] mb-1 block">Value to Match</label>
                                                         <input 
                                                            type="text" 
                                                            className="w-full text-xs border border-[#d0d7de] rounded px-2 py-1.5 bg-white" 
                                                            placeholder="e.g. 0xFFFF"
                                                            value={newRule.matchValue || ''} 
                                                            onChange={e => setNewRule({...newRule, matchValue: e.target.value})} 
                                                        />
                                                    </div>
                                                )}
                                             </div>
                                         )}
                                    </div>
                                )}

                                {/* Register Specific Configs */}
                                {newRule.mode === 'REGISTER' && (
                                    <div className="space-y-3">
                                         <div className="grid grid-cols-2 gap-2">
                                             <div>
                                                <label className="text-[10px] uppercase font-bold text-[#57606a] mb-1 block">Pattern</label>
                                                <select 
                                                    className="w-full text-xs border border-[#d0d7de] rounded px-2 py-1.5 bg-white"
                                                    value={newRule.pattern}
                                                    onChange={e => setNewRule({...newRule, pattern: e.target.value as any})}
                                                >
                                                    <option value="REG_BIT_MAPPING">Bit Mapping</option>
                                                    <option value="WRITE_VAL">Write Specific Value</option>
                                                </select>
                                             </div>
                                             <div>
                                                <label className="text-[10px] uppercase font-bold text-[#57606a] mb-1 block">Effect Action</label>
                                                <select 
                                                    className="w-full text-xs border border-[#d0d7de] rounded px-2 py-1.5 bg-white"
                                                    value={newRule.action}
                                                    onChange={e => setNewRule({...newRule, action: e.target.value as any})}
                                                >
                                                    <option value="DISABLE">Disable ISR</option>
                                                    <option value="ENABLE">Enable ISR</option>
                                                </select>
                                             </div>
                                         </div>

                                         {newRule.pattern === 'REG_BIT_MAPPING' && (
                                             <div className="space-y-2 p-2 bg-white border border-[#d0d7de] rounded-md">
                                                 <div className="flex items-center gap-2">
                                                     <label className="text-xs font-semibold text-[#24292f]">Bit Mode:</label>
                                                     <div className="flex gap-2">
                                                         <label className="flex items-center gap-1 text-xs">
                                                             <input 
                                                                type="radio" 
                                                                name="bitmode" 
                                                                checked={newRule.regBitMode === 'FIXED'} 
                                                                onChange={() => setNewRule({...newRule, regBitMode: 'FIXED'})}
                                                             /> Fixed Index
                                                         </label>
                                                         <label className="flex items-center gap-1 text-xs">
                                                             <input 
                                                                type="radio" 
                                                                name="bitmode" 
                                                                checked={newRule.regBitMode === 'DYNAMIC'} 
                                                                onChange={() => setNewRule({...newRule, regBitMode: 'DYNAMIC'})}
                                                             /> Dynamic (1 &lt;&lt; N)
                                                         </label>
                                                     </div>
                                                 </div>
                                                 
                                                 {newRule.regBitMode === 'FIXED' && (
                                                     <div>
                                                        <label className="text-[10px] uppercase font-bold text-[#57606a] mb-1 block">Bit Index (0-63)</label>
                                                        <input 
                                                            type="number" 
                                                            className="w-full text-xs border border-[#d0d7de] rounded px-2 py-1.5 bg-white" 
                                                            value={newRule.regBitIndex} 
                                                            onChange={e => setNewRule({...newRule, regBitIndex: parseInt(e.target.value)})} 
                                                        />
                                                     </div>
                                                 )}

                                                 <div>
                                                    <label className="text-[10px] uppercase font-bold text-[#57606a] mb-1 block">Polarity (Logic)</label>
                                                    <select 
                                                        className="w-full text-xs border border-[#d0d7de] rounded px-2 py-1.5 bg-white"
                                                        value={newRule.regPolarity}
                                                        onChange={e => setNewRule({...newRule, regPolarity: e.target.value as any})}
                                                    >
                                                        <option value="1_DISABLES">Active Low (1 = Disable/Mask)</option>
                                                        <option value="0_DISABLES">Active High (1 = Enable/Unmask)</option>
                                                    </select>
                                                 </div>
                                             </div>
                                         )}
                                    </div>
                                )}

                                {/* Scope */}
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-[#57606a] mb-1 block">Target Scope</label>
                                    <select 
                                        className="w-full text-xs border border-[#d0d7de] rounded px-2 py-1.5 bg-white"
                                        value={newRule.targetScope}
                                        onChange={e => setNewRule({...newRule, targetScope: e.target.value as any})}
                                    >
                                        <option value="GLOBAL">Global (All ISRs)</option>
                                        <option value="SPECIFIC">Specific ISR</option>
                                    </select>
                                </div>

                                {newRule.targetScope === 'SPECIFIC' && (
                                     <div>
                                        <label className="text-[10px] uppercase font-bold text-[#57606a] mb-1 block">Linked ISR</label>
                                        <select 
                                            className="w-full text-xs border border-[#d0d7de] rounded px-2 py-1.5 bg-white"
                                            value={newRule.linkedIsrId || ''}
                                            onChange={e => setNewRule({...newRule, linkedIsrId: e.target.value})}
                                        >
                                            <option value="">-- Select ISR --</option>
                                            {isrList.map(isr => (
                                                <option key={isr.id} value={isr.id}>{isr.functionName} (ID: {isr.hardwareId})</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <button onClick={addRule} className="w-full bg-[#0969da] text-white rounded py-2 text-xs font-bold hover:bg-[#0860ca] shadow-sm mt-2">
                                    Add Control Rule
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
             </div>
          )}

          {showConfigPreview && (
            <div className="fixed inset-0 bg-[#24292f]/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
                <div className="bg-white rounded-md shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden border border-[#d0d7de]">
                    <div className="p-4 border-b border-[#d0d7de] flex justify-between items-center bg-[#f6f8fa]">
                        <h3 className="text-sm font-bold text-[#24292f]">Config Preview</h3>
                        <button onClick={() => setShowConfigPreview(false)}><X size={18} className="text-[#57606a]"/></button>
                    </div>
                    <div className="flex-1 bg-[#ffffff] p-6 overflow-auto code-scroll">
                        <pre className="font-mono text-sm text-[#24292f]">
                            {generateEngineConfig()}
                        </pre>
                    </div>
                </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;