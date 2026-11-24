const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    isDesktop: true,
    shutdownApp: () => ipcRenderer.invoke('app-shutdown'),
    getAutoStart: () => ipcRenderer.invoke('get-autostart'),
    setAutoStart: (enabled) => ipcRenderer.invoke('set-autostart', !!enabled)
});
