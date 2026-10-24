// Proxy streaming Google Drive -> browser.
// Google Drive menolak (403 / CORP same-site) request audio langsung dari browser
// di domain lain, tapi mengizinkan request dari server. Proxy ini mengambil file
// di sisi server lalu men-stream balik ke browser dari origin yang sama,
// lengkap dengan dukungan Range (seek) — jadi <audio>/<video> bisa memutarnya.
//
// Endpoint: GET /api/gdrive?id=<FILE_ID>
import { Readable } from 'node:stream';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];

export async function handleGdrive(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const id = (url.searchParams.get('id') || '').trim();
    if (!/^[\w-]{10,}$/.test(id)) {
        res.statusCode = 400;
        res.end('Parameter id tidak valid');
        return;
    }

    // confirm=t melewati halaman "virus scan warning" untuk file > 100MB
    const upstream = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
    const headers = { 'User-Agent': UA, Accept: '*/*' };
    if (req.headers.range) headers.Range = req.headers.range;

    const ctrl = new AbortController();
    req.on('close', () => ctrl.abort());

    try {
        const r = await fetch(upstream, { headers, redirect: 'follow', signal: ctrl.signal });
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        if (!r.ok || ct.includes('text/html')) {
            res.statusCode = r.ok ? 404 : r.status;
            res.end('File Google Drive tidak bisa diakses. Pastikan akses berbagi: "Siapa saja yang memiliki link".');
            return;
        }
        res.statusCode = r.status; // 200 atau 206
        for (const h of PASS_HEADERS) {
            const v = r.headers.get(h);
            if (v) res.setHeader(h, v);
        }
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res);
    } catch (e) {
        if (ctrl.signal.aborted) return;
        res.statusCode = 502;
        res.end('Gagal mengambil file dari Google Drive');
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
