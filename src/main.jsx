const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  // 1. 创建浏览器窗口
  const mainWindow = new BrowserWindow({
    width: 1300,
    height: 900,
    title: "极简爆款书单工坊 - 重型产线 v10",
    icon: path.join(__dirname, 'public/icon.ico'), // 如果有图标请放在此处
    webPreferences: {
      nodeIntegration: true,    // 允许在渲染进程使用 Node 逻辑
      contextIsolation: false,  // 简化开发流程
      webSecurity: false        // 允许跨域请求 Gemini API
    }
  });

  // main.js 中
  mainWindow.loadURL('http://localhost:5173');

  // 2. 加载入口文件
  // 开发环境下通常指向 Vite 的端口，打包后指向 index.html
  mainWindow.loadFile('index.html');

  // 3. 屏蔽默认菜单栏，提升专业感
  Menu.setApplicationMenu(null);

  // 4. (可选) 自动开启开发者工具，方便您观察 API 状态
  // mainWindow.webContents.openDevTools();
}

// 当 Electron 完成初始化时调用
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 关闭所有窗口时退出程序
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});