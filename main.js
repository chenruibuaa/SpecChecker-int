
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: "SpecChecker-Int",
    webPreferences: {
      // Use app.getAppPath() to ensure correct path in both dev and packaged environments
      preload: path.join(app.getAppPath(), 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Disable sandbox to ensure preload has full access
      webSecurity: false
    }
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

// --- IPC Handlers for Project Management ---

// 1. Open Project Folder
ipcMain.handle('open-project-dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// 2. Read File Tree (Recursive)
const readDirRecursive = (dirPath) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    // Sort directories first, then files
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    return entries.map(entry => {
      const fullPath = path.join(dirPath, entry.name);
      // Skip node_modules and hidden files for cleanliness in demo
      if (entry.name.startsWith('.') || entry.name === 'node_modules') return null;
      
      return {
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        children: entry.isDirectory() ? readDirRecursive(fullPath) : undefined
      };
    }).filter(Boolean);
  } catch (e) {
    console.error(`Error reading dir ${dirPath}:`, e);
    return [];
  }
};

ipcMain.handle('read-project-tree', async (event, projectPath) => {
  try {
    return readDirRecursive(projectPath);
  } catch (error) {
    console.error("Failed to read directory:", error);
    return [];
  }
});

// 3. Read File Content
ipcMain.handle('read-file-content', async (event, filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    return `Error reading file: ${error.message}`;
  }
});

// 4. Simulate Analysis Engine
ipcMain.handle('run-analysis-engine', async (event, projectPath) => {
  const sender = event.sender;
  
  // Simulate steps
  const steps = [
    { progress: 10, message: "正在初始化引擎..." },
    { progress: 30, message: "解析源代码 (AST 生成中)..." },
    { progress: 50, message: "构建控制流图 (CFG)..." },
    { progress: 70, message: "分析并发与数据流..." },
    { progress: 90, message: "验证中断控制规则..." },
    { progress: 100, message: "正在生成报告..." }
  ];

  for (const step of steps) {
    // Artificial delay to simulate work
    await new Promise(resolve => setTimeout(resolve, 800)); 
    sender.send('analysis-progress', step);
  }

  // Generate the result file in the project root
  const resultsPath = path.join(projectPath, 'spec_checker_results.json');
  
  // Mock Data (Engine Output) that matches the Issue interface
  const mockEngineOutput = {
    meta: {
      project: path.basename(projectPath),
      version: "1.0",
      tool: "SpecChecker-Int Engine",
      generatedAt: new Date().toISOString()
    },
    issues: [
       {
        id: "eng-001",
        title: "中断重入违规",
        description: "ISR 'TIM2_IRQHandler' 调用了不可重入函数 'printf' 且未加锁。",
        severity: "CRITICAL",
        type: "CONCURRENCY",
        status: "OPEN",
        file: "drivers/timer.c",
        line: 45,
        rawCodeSnippet: "40: void TIM2_IRQHandler() {\n41:     // Critical: calling stdio in ISR\n42:     status = READ_REG(TIM2->SR);\n43:     if (status & UPDATE) {\n44:         // VULNERABILITY\n45:         printf(\"Timer Update\\n\");\n46:     }\n47: }",
        concurrency: {
          threads: [{id: "t1", name: "TIM2_ISR", type: "isr"}],
          events: [{id: "e1", threadId: "t1", timestamp: 10, action: "read", resource: "stdout", description: "Re-entrant call", line: 45}]
        }
       },
       {
        id: "eng-002",
        title: "未初始化内存访问",
        description: "变量 'config_buffer' 在初始化路径完成前被访问。",
        severity: "HIGH",
        type: "QUALITY",
        status: "OPEN",
        file: "app/config_loader.c",
        line: 88,
        rawCodeSnippet: "85:     char* config_buffer;\n86:     if (load_from_flash()) {\n87:         config_buffer = get_flash_ptr();\n88:     } \n89:     // If if-branch not taken, buffer is random\n90:     parse(config_buffer);",
       },
       {
        id: "eng-003",
        title: "共享变量数据竞争",
        description: "全局变量 'system_state' 被主循环和 ISR 修改，缺乏原子性保护。",
        severity: "CRITICAL",
        type: "CONCURRENCY",
        status: "OPEN",
        file: "main.c",
        line: 120,
        rawCodeSnippet: "118: void main_loop() {\n119:    // RMW Race\n120:    system_state |= 0x01;\n121: }",
        concurrency: {
           threads: [
             {id: "m", name: "Main", type: "main"},
             {id: "i", name: "ISR", type: "isr"}
           ],
           events: [
             {id: "e1", threadId: "m", timestamp: 10, action: "read", resource: "sys_state", description: "Read old val", line: 120},
             {id: "e2", threadId: "i", timestamp: 12, action: "write", resource: "sys_state", description: "ISR updates val", line: 120},
             {id: "e3", threadId: "m", timestamp: 15, action: "write", resource: "sys_state", description: "Main overwrites (Lost Update)", line: 120}
           ],
           relations: [
             {sourceId: "e2", targetId: "e3", type: "conflict", description: "Lost Update"}
           ]
        }
       },
       {
         id: "eng-004",
         title: "缓冲区溢出",
         description: "在 UART 处理程序中写入超过 'rx_buffer' 结尾。",
         severity: "HIGH",
         type: "SECURITY",
         status: "OPEN",
         file: "drivers/uart.c",
         line: 72,
         rawCodeSnippet: "70: void UART_Rx() {\n71:    if (idx < 256) \n72:       rx_buffer[idx++] = UDR;\n73: }"
       }
    ]
  };

  fs.writeFileSync(resultsPath, JSON.stringify(mockEngineOutput, null, 2));

  return resultsPath;
});


app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
