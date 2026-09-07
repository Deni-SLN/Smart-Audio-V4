-- ============================================
-- Musik Pintar — Migrasi Broadcast Queue
-- Jalankan di Supabase SQL Editor (aman diulang)
-- Fungsi: kartu Multimedia — playlist audio+video
-- dikirim ke host dalam 1 perintah + lanjut otomatis
-- ============================================

-- 1. Kolom antrian di broadcast_commands
ALTER TABLE broadcast_commands ADD COLUMN IF NOT EXISTS queue JSONB;
ALTER TABLE broadcast_commands ADD COLUMN IF NOT EXISTS queue_index INT DEFAULT 0;

-- 2. Verifikasi
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'broadcast_commands' AND column_name IN ('queue', 'queue_index');
