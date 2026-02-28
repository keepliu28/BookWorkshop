import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// 渲染进程只负责把 App 挂载到 index.html 的 root 节点上
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)