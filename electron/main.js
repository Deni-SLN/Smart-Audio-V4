import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from 'electron';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleGdrive } from '../server/gdrive-proxy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');

let mainWindow = null;
let tray = null;
let server = null;
let serverPort = 0;
let isQuitting = false;

// MIME types lookup untuk static server internal
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.mp4': 'video/mp4',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf'
};

function serveStaticFile(req, res, filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            // SPA fallback: arahkan request routing ke index.html
            const indexPath = path.join(DIST_DIR, 'index.html');
            if (fs.existsSync(indexPath)) {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                fs.createReadStream(indexPath).pipe(res);
                return;
            }
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }

        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            return serveStaticFile(req, res, path.join(filePath, 'index.html'));
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stat.size,
            'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
        });
        fs.createReadStream(filePath).pipe(res);
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Error: ' + err.message);
    }
}

// Jalankan local HTTP server internal
function startLocalServer() {
    return new Promise((resolve, reject) => {
        server = http.createServer((req, res) => {
            // Tangani API Google Drive streaming & local disk cache
            if (req.url && req.url.startsWith('/api/gdrive')) {
                return handleGdrive(req, res);
            }

            // Sajikan file static dari folder dist
            const parsedUrl = new URL(req.url, 'http://localhost');
            let pathname = decodeURIComponent(parsedUrl.pathname);
            if (pathname === '/') pathname = '/index.html';
            const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
            const targetFile = path.join(DIST_DIR, safePath);

            serveStaticFile(req, res, targetFile);
        });

        // Dengarkan port bebas (0 = otomatis cari port yang tersedia)
        server.listen(0, '127.0.0.1', () => {
            serverPort = server.address().port;
            console.log(`[Electron] Internal server running at http://127.0.0.1:${serverPort}`);
            resolve(serverPort);
        });

        server.on('error', reject);
    });
}

function getAppIcon() {
    const icoPath = path.join(ROOT_DIR, 'public', 'icon.ico');
    const pngPath = path.join(ROOT_DIR, 'public', 'icon-512.png');
    if (process.platform === 'win32' && fs.existsSync(icoPath)) {
        return icoPath;
    }
    return pngPath;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1240,
        height: 820,
        minWidth: 900,
        minHeight: 600,
        title: 'Musik Pintar - Smart Audio Scheduler',
        icon: getAppIcon(),
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    const appUrl = `http://127.0.0.1:${serverPort}`;
    mainWindow.loadURL(appUrl);

    // Buka link eksternal (misal bantuan / google drive) di browser bawaan
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http:') || url.startsWith('https:')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    // Saat tombol 'X' (tutup) ditekan: minimize ke tray agar audio jadwal tetap jalan!
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            if (tray && process.platform === 'win32') {
                tray.displayBalloon({
                    title: 'Musik Pintar Masih Berjalan',
                    content: 'Jadwal musik tetap aktif di latar belakang. Klik ikon untuk membuka kembali.'
                });
            }
        }
    });
}

function createTray() {
    const iconPath = path.join(ROOT_DIR, 'public', process.platform === 'win32' ? 'icon.ico' : 'icon-192.png');
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));

    const isAutoStart = app.getLoginItemSettings().openAtLogin;

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Tampilkan Musik Pintar',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        {
            label: 'Jalankan Otomatis saat Startup',
            type: 'checkbox',
            checked: isAutoStart,
            click: (menuItem) => {
                app.setLoginItemSettings({
                    openAtLogin: menuItem.checked,
                    path: app.getPath('exe')
                });
            }
        },
        { type: 'separator' },
        {
            label: 'Keluar Sepenuhnya',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Musik Pintar - Smart Audio Scheduler');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.focus();
            } else {
                mainWindow.show();
            }
        }
    });
}

// Pastikan hanya 1 instance aplikasi yang berjalan (Single Instance Lock)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        await startLocalServer();
        createWindow();
        createTray();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            } else if (mainWindow) {
                mainWindow.show();
            }
        });
    });
}

app.on('before-quit', () => {
    isQuitting = true;
    if (server) {
        try { server.close(); } catch {}
    }
});
