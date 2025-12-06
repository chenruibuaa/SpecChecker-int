
import { Issue, Severity, IssueType, Status } from './types';

export const MOCK_ISSUES: Issue[] = [
  {
    id: 'issue-001',
    title: 'SQL 注入漏洞',
    description: '用户输入的数据未经过滤直接拼接到 SQL 查询语句中，导致潜在的 SQL 注入风险。',
    severity: Severity.CRITICAL,
    type: IssueType.DATA_FLOW,
    status: Status.OPEN,
    file: 'backend/auth/login.ts',
    line: 45,
    rawCodeSnippet: `
    40:   const handleLogin = async (req: Request, res: Response) => {
    41:     const username = req.body.username;
    42:     const password = req.body.password;
    43:     
    44:     // VULNERABILITY DETECTED
    45:     const query = "SELECT * FROM users WHERE user = '" + username + "'";
    46:     
    47:     const result = await db.execute(query);
    48:     if (result.length > 0) {
    49:       // ...
    `,
    dataFlow: {
      nodes: [
        { id: 'n1', label: 'req.body.username', location: { file: 'login.ts', line: 41, code: 'const username = req.body.username;' }, type: 'source' },
        { id: 'n2', label: 'username (var)', location: { file: 'login.ts', line: 45, code: 'const query = ... + username + ...' }, type: 'propagate' },
        { id: 'n3', label: 'query (string)', location: { file: 'login.ts', line: 45, code: 'const query = ...' }, type: 'propagate' },
        { id: 'n4', label: 'db.execute(query)', location: { file: 'login.ts', line: 47, code: 'await db.execute(query)' }, type: 'sink' },
      ],
      edges: [
        { source: 'n1', target: 'n2', label: 'assignment' },
        { source: 'n2', target: 'n3', label: 'concatenation' },
        { source: 'n3', target: 'n4', label: 'execution' },
      ],
    },
  },
  {
    id: 'issue-002',
    title: '潜在的死锁风险 (Deadlock)',
    description: '检测到循环等待条件。线程 T1 和 T2 以相反的顺序获取锁 LockA 和 LockB。',
    severity: Severity.HIGH,
    type: IssueType.CONCURRENCY,
    status: Status.OPEN,
    file: 'core/scheduler.ts',
    line: 120,
    rawCodeSnippet: `
    115: class ResourceManager {
    116:   transfer(from: Account, to: Account, amount: number) {
    117:     // Thread 1 might lock 'from' then 'to'
    118:     // Thread 2 might lock 'to' then 'from'
    119:     synchronized(from) {
    120:       synchronized(to) {
    121:          from.debit(amount);
    122:          to.credit(amount);
    123:       }
    124:     }
    125:   }
    `,
    concurrency: {
      threads: [
        { id: 't1', name: 'Thread-Worker-1' },
        { id: 't2', name: 'Thread-Worker-2' },
      ],
      events: [
        { id: 'e1', threadId: 't1', timestamp: 10, action: 'lock', resource: 'Resource A', description: 'Acquires Lock A', line: 119 },
        { id: 'e2', threadId: 't2', timestamp: 15, action: 'lock', resource: 'Resource B', description: 'Acquires Lock B', line: 119 },
        { id: 'e3', threadId: 't1', timestamp: 20, action: 'wait', resource: 'Resource B', description: 'Waits for Lock B', line: 120 },
        { id: 'e4', threadId: 't2', timestamp: 25, action: 'wait', resource: 'Resource A', description: 'Waits for Lock A (Deadlock)', line: 120 },
      ],
      relations: [
         { sourceId: 'e3', targetId: 'e2', type: 'conflict', description: 'Waiting for B held by T2' },
         { sourceId: 'e4', targetId: 'e1', type: 'conflict', description: 'Waiting for A held by T1' }
      ]
    },
  },
  {
    id: 'issue-003',
    title: '硬编码密钥',
    description: 'AWS Access Key ID 似乎硬编码在源文件中。',
    severity: Severity.HIGH,
    type: IssueType.SECURITY,
    status: Status.CONFIRMED,
    file: 'config/aws.ts',
    line: 12,
    rawCodeSnippet: `
    10: export const awsConfig = {
    11:   region: 'us-east-1',
    12:   accessKeyId: 'AKIAIOSFODNN7EXAMPLE', // HARDCODED SECRET
    13:   secretAccessKey: process.env.AWS_SECRET_KEY,
    14: };
    `,
  },
  {
    id: 'issue-004',
    title: '未处理的 Promise Rejection',
    description: '异步操作缺少 catch 块，可能导致程序崩溃或状态不一致。',
    severity: Severity.MEDIUM,
    type: IssueType.QUALITY,
    status: Status.FALSE_POSITIVE,
    file: 'services/api.ts',
    line: 88,
    rawCodeSnippet: `
    85:   public fetchData() {
    86:     // This promise chain is missing a catch
    87:     fetch('/api/data')
    88:       .then(res => res.json())
    89:       .then(data => this.process(data));
    90:   }
    `,
  },
    {
    id: 'issue-005',
    title: '跨站脚本攻击 (XSS)',
    description: '用户提供的输入未经清理直接渲染到 DOM 中。',
    severity: Severity.HIGH,
    type: IssueType.DATA_FLOW,
    status: Status.OPEN,
    file: 'frontend/components/Comment.tsx',
    line: 22,
    rawCodeSnippet: `
    20:   return (
    21:     <div className="comment">
    22:       <div dangerouslySetInnerHTML={{ __html: props.content }} />
    23:     </div>
    24:   );
    `,
     dataFlow: {
      nodes: [
        { id: 'x1', label: 'props.content', location: { file: 'Comment.tsx', line: 20, code: 'props.content' }, type: 'source' },
        { id: 'x2', label: 'dangerouslySetInnerHTML', location: { file: 'Comment.tsx', line: 22, code: '<div dangerouslySetInnerHTML... />' }, type: 'sink' },
      ],
      edges: [
        { source: 'x1', target: 'x2', label: 'direct rendering' },
      ],
    },
  },
  {
    id: 'issue-006',
    title: '数据竞争 (Race Condition) - 单变量',
    description: '主循环与中断服务程序(ISR)竞争访问共享变量 `g_counter`。ISR 在主循环 "Read-Modify-Write" 过程中间插入执行，导致更新丢失。',
    severity: Severity.CRITICAL,
    type: IssueType.CONCURRENCY,
    status: Status.OPEN,
    file: 'firmware/timer.c',
    line: 85,
    rawCodeSnippet: `
    80: volatile int g_counter = 0;
    81: 
    82: void main_loop() {
    83:    // Critical Section: Non-atomic increment
    84:    // load R0, [g_counter]
    85:    g_counter++;
    86:    // store R0, [g_counter]
    87: }
    88:
    89: void TIM2_IRQHandler() {
    90:    g_counter++; // ISR also updates it
    91: }
    `,
    concurrency: {
      threads: [
        { id: 't_main', name: 'Main Loop', type: 'main' },
        { id: 't_isr', name: 'ISR (TIM2)', type: 'isr' },
      ],
      events: [
        { id: 'e1', threadId: 't_main', timestamp: 10, action: 'read', resource: 'g_counter', description: 'Main reads value 0', line: 85 },
        { id: 'e2', threadId: 't_isr', timestamp: 12, action: 'read', resource: 'g_counter', description: 'ISR Interrupts! Reads 0', line: 90 },
        { id: 'e3', threadId: 't_isr', timestamp: 14, action: 'write', resource: 'g_counter', description: 'ISR Writes 1', line: 90 },
        { id: 'e4', threadId: 't_main', timestamp: 16, action: 'write', resource: 'g_counter', description: 'Main Writes 1 (Overwrites ISR update!)', line: 85 },
      ],
      relations: [
        { sourceId: 'e3', targetId: 'e4', type: 'conflict', description: 'Lost Update: Main overwrites ISR changes' }
      ]
    },
  },
  {
    id: 'issue-007',
    title: '原子性违规 - 多变量不一致',
    description: '中断 ISR 读取了部分更新的全局状态。变量 `sys_state` 和 `sys_timestamp` 应保持一致，但在主循环更新期间被 ISR 打断。',
    severity: Severity.HIGH,
    type: IssueType.CONCURRENCY,
    status: Status.OPEN,
    file: 'firmware/sensor.c',
    line: 110,
    rawCodeSnippet: `
    105: void update_system_state(int new_state) {
    106:     // Non-atomic update of coupled variables
    107:     sys_state = new_state;
    108:     // <--- ISR fires here
    109:     sys_timestamp = get_time();
    110: }
    111:
    112: void USART1_IRQHandler() {
    113:     // Reads inconsistent state!
    114:     log(sys_state, sys_timestamp); 
    115: }
    `,
    concurrency: {
      threads: [
        { id: 't_main', name: 'Main Loop', type: 'main' },
        { id: 't_isr', name: 'ISR (USART)', type: 'isr' },
      ],
      events: [
        { id: 'e1', threadId: 't_main', timestamp: 10, action: 'write', resource: 'sys_state', description: 'Main sets state = READY', line: 107 },
        { id: 'e2', threadId: 't_isr', timestamp: 12, action: 'read', resource: 'sys_state', description: 'ISR reads state = READY', line: 114 },
        { id: 'e3', threadId: 't_isr', timestamp: 14, action: 'read', resource: 'sys_timestamp', description: 'ISR reads OLD timestamp (Mismatch)', line: 114 },
        { id: 'e4', threadId: 't_main', timestamp: 16, action: 'write', resource: 'sys_timestamp', description: 'Main updates timestamp', line: 109 },
      ],
      relations: [
        { sourceId: 'e1', targetId: 'e2', type: 'order', description: 'Read new value' },
        { sourceId: 'e4', targetId: 'e3', type: 'conflict', description: 'Atomicity Violation: Read happened before update' }
      ]
    },
  }
];