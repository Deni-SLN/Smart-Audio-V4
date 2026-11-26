import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from 'electron';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let handleGdrive = null;

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

// Jalankan local HTTP server internal pada port tetap agar localStorage & IndexedDB
// tidak pernah hilang saat PC restart atau aplikasi di-shutdown.
const FIXED_PORT = 47831;

function handleLocalDb(req, res) {
    const dbPath = path.join(app.getPath('userData'), 'local-db.json');
    if (req.method === 'GET') {
        try {
            if (!fs.existsSync(dbPath)) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end('{}');
                return;
            }
            const raw = fs.readFileSync(dbPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(raw || '{}');
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    if (req.method === 'POST') {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            try {
                const body = Buffer.concat(chunks).toString('utf8');
                JSON.parse(body); // validasi JSON
                fs.mkdirSync(path.dirname(dbPath), { recursive: true });
                const tmpPath = dbPath + '.tmp';
                fs.writeFileSync(tmpPath, body, 'utf8');
                fs.renameSync(tmpPath, dbPath);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end('{"ok":true}');
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
}

async function startLocalServer() {
    process.env.GDRIVE_CACHE_DIR = path.join(app.getPath('userData'), 'gdrive-cache');
    const mod = await import('../server/gdrive-proxy.js');
    handleGdrive = mod.handleGdrive;

    return new Promise((resolve, reject) => {
        server = http.createServer((req, res) => {
            // Tangani database lokal JSON di userData
            if (req.url && req.url.startsWith('/api/local-db')) {
                return handleLocalDb(req, res);
            }

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

        let retriedFallback = false;
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE' && !retriedFallback) {
                retriedFallback = true;
                console.warn(`[Electron] Port ${FIXED_PORT} sedang dipakai, mencoba port cadangan...`);
                server.listen(0, '127.0.0.1', () => {
                    serverPort = server.address().port;
                    console.log(`[Electron] Internal server running at http://127.0.0.1:${serverPort}`);
                    resolve(serverPort);
                });
            } else {
                reject(err);
            }
        });

        // Gunakan port tetap 47831 agar origin & storage lokal selalu persisten
        server.listen(FIXED_PORT, '127.0.0.1', () => {
            serverPort = server.address().port;
            console.log(`[Electron] Internal server running at http://127.0.0.1:${serverPort}`);
            resolve(serverPort);
        });
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

function getLinuxAutostartPath() {
    const configHome = process.env.XDG_CONFIG_HOME || path.join(app.getPath('home'), '.config');
    return path.join(configHome, 'autostart', 'musik-pintar.desktop');
}

function getAutoStart() {
    if (process.platform === 'linux') {
        return fs.existsSync(getLinuxAutostartPath());
    }
    return !!app.getLoginItemSettings().openAtLogin;
}

function setAutoStart(enabled) {
    try {
        if (process.platform === 'linux') {
            const desktopFile = getLinuxAutostartPath();
            if (enabled) {
                fs.mkdirSync(path.dirname(desktopFile), { recursive: true });
                const execPath = process.env.APPIMAGE || app.getPath('exe');
                const execCmd = app.isPackaged
                    ? `"${execPath}"`
                    : `"${execPath}" "${ROOT_DIR}" --no-sandbox`;
                const content = [
                    '[Desktop Entry]',
                    'Type=Application',
                    'Name=Musik Pintar',
                    'Comment=Smart Audio Scheduler',
                    `Exec=${execCmd}`,
                    `Icon=${path.join(ROOT_DIR, 'public', 'icon-512.png')}`,
                    'Terminal=false',
                    'X-GNOME-Autostart-enabled=true'
                ].join('\n') + '\n';
                fs.writeFileSync(desktopFile, content, 'utf8');
            } else if (fs.existsSync(desktopFile)) {
                fs.unlinkSync(desktopFile);
            }
            return true;
        }
        app.setLoginItemSettings({
            openAtLogin: !!enabled,
            path: app.getPath('exe')
        });
        return true;
    } catch (e) {
        console.warn('[Electron] Gagal mengatur auto-start:', e.message);
        return false;
    }
}

function ensureDefaultAutoStart() {
    const flagFile = path.join(app.getPath('userData'), '.autostart-init');
    if (!fs.existsSync(flagFile)) {
        setAutoStart(true);
        try {
            fs.mkdirSync(path.dirname(flagFile), { recursive: true });
            fs.writeFileSync(flagFile, new Date().toISOString());
        } catch {}
    }
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
            preload: path.join(__dirname, 'preload.cjs'),
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

    const isAutoStart = getAutoStart();

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
                setAutoStart(menuItem.checked);
            }
        },
        { type: 'separator' },
        {
            label: 'Shutdown App (Matikan Sepenuhnya)',
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
        ensureDefaultAutoStart();
        ipcMain.handle('app-shutdown', () => {
            isQuitting = true;
            app.quit();
        });
        ipcMain.handle('get-autostart', () => getAutoStart());
        ipcMain.handle('set-autostart', (_ev, enabled) => setAutoStart(enabled));

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
