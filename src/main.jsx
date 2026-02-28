// src/main.jsx - 修复后
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx' // 确保 App.jsx 存在

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)