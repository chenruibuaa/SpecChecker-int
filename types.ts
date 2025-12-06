
export enum Severity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum IssueType {
  DATA_FLOW = 'DATA_FLOW',
  CONCURRENCY = 'CONCURRENCY',
  SECURITY = 'SECURITY',
  QUALITY = 'QUALITY',
}

export enum Status {
  OPEN = 'OPEN',
  CONFIRMED = 'CONFIRMED',
  FALSE_POSITIVE = 'FALSE_POSITIVE',
  FIXED = 'FIXED',
}

export interface CodeLocation {
  file: string;
  line: number;
  code: string;
}

// For File Explorer
export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

// For Data Flow Visualization
export interface DataFlowNode {
  id: string;
  label: string;
  location: CodeLocation;
  type: 'source' | 'propagate' | 'sink';
}

export interface DataFlowEdge {
  source: string;
  target: string;
  label?: string;
}

// For Concurrency Visualization
export interface ThreadEvent {
  id: string;
  threadId: string;
  timestamp: number;
  action: 'lock' | 'unlock' | 'read' | 'write' | 'wait' | 'notify';
  resource?: string;
  description: string;
  line?: number; // Added line number for code mapping
}

export interface Thread {
  id: string;
  name: string;
  type?: 'main' | 'isr';
}

export interface ConcurrencyRelation {
  sourceId: string;
  targetId: string;
  type: 'conflict' | 'order';
  description?: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  type: IssueType;
  status: Status;
  file: string;
  line: number;
  // Details for visualizations
  dataFlow?: {
    nodes: DataFlowNode[];
    edges: DataFlowEdge[];
  };
  concurrency?: {
    threads: Thread[];
    events: ThreadEvent[];
    relations?: ConcurrencyRelation[];
  };
  rawCodeSnippet: string; // Simplified for this demo
}