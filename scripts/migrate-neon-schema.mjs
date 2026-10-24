import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.VITE_DATABASE_URL);

const statements = [
`CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email TEXT,
    username TEXT UNIQUE,
    name TEXT DEFAULT '',
    role TEXT DEFAULT 'user',
    storage_limit INT DEFAULT 500,
    force_change_password BOOLEAN DEFAULT FALSE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
)`,
`CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    src TEXT DEFAULT '',
    type TEXT NOT NULL DEFAULT 'offline',
    duration FLOAT DEFAULT 0,
    size TEXT DEFAULT '0 MB',
    volume INT DEFAULT 100,
    owner TEXT NOT NULL,
    media_kind TEXT DEFAULT 'audio',
    created_at TIMESTAMPTZ DEFAULT NOW()
)`,
`CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    track_ids TEXT[] DEFAULT '{}',
    owner TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
)`,
`CREATE TABLE IF NOT EXISTS upacaras (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    track_ids TEXT[] DEFAULT '{}',
    play_once BOOLEAN DEFAULT TRUE,
    owner TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
)`,
`CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    track_ids TEXT[] DEFAULT '{}',
    play_once BOOLEAN DEFAULT TRUE,
    owner TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
)`,
`CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    days INT[] DEFAULT '{1,2,3,4,5}',
    loop BOOLEAN DEFAULT TRUE,
    source_type TEXT DEFAULT 'single',
    source_id TEXT,
    indonesia_raya BOOLEAN DEFAULT FALSE,
    volume INT DEFAULT 100,
    enabled BOOLEAN DEFAULT TRUE,
    owner TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
)`,
`CREATE TABLE IF NOT EXISTS site_config (
    id INT PRIMARY KEY,
    lat DOUBLE PRECISION DEFAULT -6.2088,
    lng DOUBLE PRECISION DEFAULT 106.8456,
    time_offset INT DEFAULT 0,
    prayer_offsets JSONB DEFAULT '{"Imsak":0,"Subuh":0,"Terbit":0,"Dzuhur":0,"Ashar":0,"Maghrib":0,"Isya":0}',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID
)`,
`INSERT INTO site_config (id, lat, lng) VALUES (1, -6.2088, 106.8456) ON CONFLICT (id) DO NOTHING`,
`CREATE TABLE IF NOT EXISTS broadcast_hosts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_code VARCHAR(6),
    device_key TEXT,
    owner_id UUID,
    host_name TEXT DEFAULT '',
    status TEXT DEFAULT 'connecting',
    media_status TEXT DEFAULT 'stopped',
    media_type TEXT,
    media_url TEXT,
    volume INT DEFAULT 70,
    muted BOOLEAN DEFAULT FALSE,
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
)`,
`CREATE TABLE IF NOT EXISTS broadcast_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID REFERENCES broadcast_hosts(id) ON DELETE CASCADE,
    command TEXT NOT NULL,
    media_type TEXT,
    media_url TEXT,
    volume INT,
    seek_to FLOAT,
    start_at TIMESTAMPTZ,
    queue JSONB,
    queue_index INT DEFAULT 0,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
)`,
`CREATE TABLE IF NOT EXISTS broadcast_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID,
    host_id UUID REFERENCES broadcast_hosts(id) ON DELETE CASCADE,
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,
    status TEXT DEFAULT 'active'
)`,
`CREATE INDEX IF NOT EXISTS idx_tracks_owner ON tracks(owner)`,
`CREATE INDEX IF NOT EXISTS idx_playlists_owner ON playlists(owner)`,
`CREATE INDEX IF NOT EXISTS idx_upacaras_owner ON upacaras(owner)`,
`CREATE INDEX IF NOT EXISTS idx_events_owner ON events(owner)`,
`CREATE INDEX IF NOT EXISTS idx_schedules_owner ON schedules(owner)`,
`CREATE UNIQUE INDEX IF NOT EXISTS idx_bc_hosts_device ON broadcast_hosts(device_key) WHERE device_key IS NOT NULL`,
`CREATE INDEX IF NOT EXISTS idx_bc_hosts_owner ON broadcast_hosts(owner_id)`,
`CREATE INDEX IF NOT EXISTS idx_bc_cmds_host ON broadcast_commands(host_id)`,
`CREATE INDEX IF NOT EXISTS idx_bc_sessions_host ON broadcast_sessions(host_id)`,
`CREATE INDEX IF NOT EXISTS idx_site_config_id ON site_config(id)`,
`ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'`,
`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS media_kind TEXT DEFAULT 'audio'`,
`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS volume INT DEFAULT 100`,
`ALTER TABLE broadcast_hosts ADD COLUMN IF NOT EXISTS device_key TEXT`,
`ALTER TABLE broadcast_commands ADD COLUMN IF NOT EXISTS queue JSONB`,
`ALTER TABLE broadcast_commands ADD COLUMN IF NOT EXISTS queue_index INT DEFAULT 0`,
];

// RLS + policies
const rlsTables = ['tracks','playlists','upacaras','events','schedules','users','broadcast_hosts','broadcast_commands','broadcast_sessions','site_config'];
for (const t of rlsTables) {
  statements.push(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
}
const policies = [
  ['tracks','tracks_all'],
  ['playlists','playlists_all'],
  ['upacaras','upacaras_all'],
  ['events','events_all'],
  ['schedules','schedules_all'],
  ['users','users_all'],
  ['broadcast_hosts','broadcast_hosts_all'],
  ['broadcast_commands','broadcast_commands_all'],
  ['broadcast_sessions','broadcast_sessions_all'],
  ['site_config','site_config_all'],
];
for (const [t,p] of policies) {
  statements.push(`DROP POLICY IF EXISTS "${p}" ON ${t}`);
  statements.push(`CREATE POLICY "${p}" ON ${t} FOR ALL USING (true) WITH CHECK (true)`);
}

let ok=0, fail=0;
for (const s of statements) {
  try {
    await sql.query(s);
    ok++;
  } catch (e) {
    fail++;
    console.error('FAIL:', e.message, '\nSQL:', s.slice(0,120));
  }
}
console.log(`Done: ${ok} ok, ${fail} failed`);
