// main.js - 优化后
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 900,
    title: "极简爆款书单工坊 - 重型产线 v10",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false 
    }
  });

  // 屏蔽菜单栏提升专业感
  Menu.setApplicationMenu(null);

  // 根据环境加载
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  
  if (isDev) {
    win.loadURL('http://localhost:5173'); // 加载 Vite 预览
    // win.webContents.openDevTools(); // 调试时可开启
  } else {
    win.loadFile(path.join(__dirname, 'dist/index.html')); // 加载打包后的文件
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});