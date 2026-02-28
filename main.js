const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // 允许跨域调用 Gemini API
    }
  });

  // 修改这里：开发模式加载本地服务器地址
  // 生产模式（打包后）才加载 index.html
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  
  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools(); // 自动打开调试工具，方便看报错
  } else {
    win.loadFile('index.html');
  }
}

app.whenReady().then(createWindow);