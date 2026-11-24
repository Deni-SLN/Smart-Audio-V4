// Proxy streaming Google Drive dengan LOCAL DISK CACHE.
// Menyimpan audio/video Google Drive secara otomatis di server lokal
// agar pemutaran selanjutnya hemat bandwidth 100% dan instan tanpa internet.
// Mendukung HTTP Range (seek) untuk <audio> dan <video>.
//
// Endpoint: GET /api/gdrive?id=<FILE_ID>

import { Readable, PassThrough } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];

const CACHE_DIR = process.env.GDRIVE_CACHE_DIR || path.resolve(process.cwd(), 'data/gdrive-cache');
if (!fs.existsSync(CACHE_DIR)) {
    try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (e) {}
} else {
    // Bersihkan sisa file .tmp yang gagal selesai sebelum restart
    try {
        for (const f of fs.readdirSync(CACHE_DIR)) {
            if (f.endsWith('.tmp')) fs.unlinkSync(path.join(CACHE_DIR, f));
        }
    } catch {}
}

const activeDownloads = new Map();

function getCachePaths(id) {
    return {
        bin: path.join(CACHE_DIR, `${id}.bin`),
        meta: path.join(CACHE_DIR, `${id}.meta.json`),
        tmp: path.join(CACHE_DIR, `${id}.tmp`)
    };
}

function isCached(id) {
    const { bin, meta } = getCachePaths(id);
    if (!fs.existsSync(bin) || !fs.existsSync(meta)) return false;
    try {
        const stat = fs.statSync(bin);
        return stat.size > 0;
    } catch {
        return false;
    }
}

function loadMeta(metaPath) {
    try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
        return { contentType: 'audio/mpeg' };
    }
}

function serveFromDisk(req, res, id) {
    const { bin, meta: metaPath } = getCachePaths(id);
    let stat;
    try {
        stat = fs.statSync(bin);
    } catch {
        return false;
    }

    const totalSize = stat.size;
    const meta = loadMeta(metaPath);
    const contentType = meta.contentType || 'audio/mpeg';
    const range = req.headers.range;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Cache-Status', 'HIT-LOCAL-DISK');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

        if (isNaN(start) || start >= totalSize || end >= totalSize || start > end) {
            res.statusCode = 416; // Range Not Satisfiable
            res.setHeader('Content-Range', `bytes */${totalSize}`);
            res.end();
            return true;
        }

        const chunkSize = (end - start) + 1;
        res.statusCode = 206; // Partial Content
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
        res.setHeader('Content-Length', chunkSize);

        const stream = fs.createReadStream(bin, { start, end });
        stream.on('error', () => { if (!res.writableEnded) res.destroy(); });
        stream.pipe(res);
        return true;
    }

    res.statusCode = 200;
    res.setHeader('Content-Length', totalSize);
    const stream = fs.createReadStream(bin);
    stream.on('error', () => { if (!res.writableEnded) res.destroy(); });
    stream.pipe(res);
    return true;
}

async function downloadAndCache(id) {
    if (activeDownloads.has(id)) {
        return activeDownloads.get(id);
    }

    const promise = (async () => {
        const { bin, meta: metaPath, tmp } = getCachePaths(id);
        const upstream = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
        const headers = { 'User-Agent': UA, Accept: '*/*' };

        const r = await fetch(upstream, { headers, redirect: 'follow' });
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        if (!r.ok || ct.includes('text/html')) {
            throw new Error(`Google Drive upstream error: status ${r.status}`);
        }

        const out = fs.createWriteStream(tmp);
        const nodeStream = Readable.fromWeb(r.body);

        await new Promise((resolve, reject) => {
            nodeStream.pipe(out);
            nodeStream.on('error', (err) => {
                out.destroy();
                try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
                reject(err);
            });
            out.on('finish', () => {
                try {
                    const stat = fs.statSync(tmp);
                    const metaData = {
                        id,
                        contentType: r.headers.get('content-type') || 'audio/mpeg',
                        size: stat.size,
                        cachedAt: new Date().toISOString()
                    };
                    fs.writeFileSync(metaPath, JSON.stringify(metaData, null, 2));
                    fs.renameSync(tmp, bin);
                    resolve(metaData);
                } catch (err) {
                    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
                    reject(err);
                }
            });
            out.on('error', (err) => {
                try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
                reject(err);
            });
        });
    })();

    activeDownloads.set(id, promise);
    try {
        return await promise;
    } finally {
        activeDownloads.delete(id);
    }
}

export async function handleGdrive(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const action = url.searchParams.get('action');

    // API: Cek status cache di server
    if (action === 'cache-status') {
        try {
            const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.meta.json'));
            let totalBytes = 0;
            const items = files.map(mf => {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, mf), 'utf8'));
                    totalBytes += (data.size || 0);
                    return data;
                } catch { return null; }
            }).filter(Boolean);

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                totalFiles: items.length,
                totalSizeMB: (totalBytes / (1024 * 1024)).toFixed(2),
                items
            }));
            return;
        } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
            return;
        }
    }

    const id = (url.searchParams.get('id') || '').trim();
    if (!/^[\w-]{10,}$/.test(id)) {
        res.statusCode = 400;
        res.end('Parameter id tidak valid');
        return;
    }

    // API: Preload / simpan ke lokal di background
    if (action === 'preload') {
        if (isCached(id)) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ status: 'cached', id }));
            return;
        }
        downloadAndCache(id).catch(err => {
            console.warn(`[GDrive Preload] Gagal download ${id}:`, err.message);
        });
        res.statusCode = 202;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'downloading', id }));
        return;
    }

    // 1. Cek apakah file sudah tersimpan di disk lokal
    if (isCached(id)) {
        serveFromDisk(req, res, id);
        return;
    }

    // 2. Jika sedang di-download oleh request lain, tunggu hingga selesai lalu sajikan dari disk
    if (activeDownloads.has(id)) {
        try {
            await activeDownloads.get(id);
            if (isCached(id)) {
                serveFromDisk(req, res, id);
                return;
            }
        } catch {}
    }

    // 3. Download dan simpan ke lokal sekaligus streaming ke browser
    const { tmp } = getCachePaths(id);
    const upstream = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
    const headers = { 'User-Agent': UA, Accept: '*/*' };

    let resolveDl, rejectDl;
    const dlPromise = new Promise((resP, rejP) => { resolveDl = resP; rejectDl = rejP; });
    dlPromise.catch(() => {});
    activeDownloads.set(id, dlPromise);

    try {
        const r = await fetch(upstream, { headers, redirect: 'follow' });
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        if (!r.ok || ct.includes('text/html')) {
            activeDownloads.delete(id);
            rejectDl(new Error(`Upstream ${r.status}`));
            res.statusCode = r.ok ? 404 : r.status;
            res.end('File Google Drive tidak bisa diakses. Pastikan akses berbagi: "Siapa saja yang memiliki link".');
            return;
        }

        res.statusCode = 200;
        for (const h of PASS_HEADERS) {
            const v = r.headers.get(h);
            if (v && h !== 'content-range') res.setHeader(h, v);
        }
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('X-Cache-Status', 'MISS-STREAMING-AND-SAVING');

        const out = fs.createWriteStream(tmp);
        const nodeStream = Readable.fromWeb(r.body);
        const clientPass = new PassThrough();

        nodeStream.pipe(out);
        nodeStream.pipe(clientPass);
        clientPass.pipe(res);

        out.on('finish', () => {
            try {
                const { bin, meta: metaPath } = getCachePaths(id);
                const stat = fs.statSync(tmp);
                const metaData = {
                    id,
                    contentType: r.headers.get('content-type') || 'audio/mpeg',
                    size: stat.size,
                    cachedAt: new Date().toISOString()
                };
                fs.writeFileSync(metaPath, JSON.stringify(metaData, null, 2));
                fs.renameSync(tmp, bin);
                console.log(`[GDrive Cache] Berhasil dicache ke lokal: ${id} (${(stat.size / (1024*1024)).toFixed(2)} MB)`);
                activeDownloads.delete(id);
                resolveDl(metaData);
            } catch (err) {
                try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
                activeDownloads.delete(id);
                rejectDl(err);
            }
        });

        const failDownload = (err) => {
            out.destroy();
            try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
            activeDownloads.delete(id);
            rejectDl(err);
            if (!res.writableEnded) res.destroy();
        };

        nodeStream.on('error', failDownload);
        out.on('error', failDownload);

        req.on('close', () => {
            clientPass.destroy();
        });

    } catch (e) {
        try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
        activeDownloads.delete(id);
        rejectDl(e);
        if (!res.writableEnded) {
            res.statusCode = 502;
            res.end('Gagal mengambil file dari Google Drive');
        }
    }
}

// Plugin Vite: aktif di `npm run dev` dan `npm run preview`
export function gdriveProxyPlugin() {
    const mw = (req, res, next) => {
        if (req.url && req.url.startsWith('/api/gdrive')) return handleGdrive(req, res);
        next();
    };
    return {
        name: 'gdrive-proxy',
        configureServer(server) { server.middlewares.use(mw); },
        configurePreviewServer(server) { server.middlewares.use(mw); },
    };
}
