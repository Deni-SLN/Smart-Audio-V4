-- ============================================
-- Musik Pintar v3.5 — Migrasi Event + Video
-- Jalankan di Supabase SQL Editor (aman diulang)
-- ============================================

-- 1. Kolom media_kind di tracks (audio = default, lama = audio)
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS media_kind TEXT DEFAULT 'audio';
UPDATE tracks SET media_kind='audio' WHERE media_kind IS NULL;

-- 2. Tabel events (mirip upacaras, isi campur musik + video)
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    track_ids TEXT[] DEFAULT '{}',
    play_once BOOLEAN DEFAULT TRUE,
    owner TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_owner ON events(owner);

-- 3. RLS: enable + policy (ikut pola upacaras)
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "events_all" ON events;
CREATE POLICY "events_all" ON events FOR ALL USING (true);

-- 4. Verifikasi
SELECT 'tracks.media_kind' AS kolom, COUNT(*) FILTER (WHERE media_kind='video') AS video, COUNT(*) FILTER (WHERE media_kind='audio' OR media_kind IS NULL) AS audio FROM tracks;
SELECT 'events' AS tabel, COUNT(*) AS jumlah FROM events;