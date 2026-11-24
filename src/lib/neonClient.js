import { createClient, BetterAuthVanillaAdapter } from '@neondatabase/neon-js';
import { neonSql } from './neon.js';

const authUrl = import.meta.env.VITE_NEON_AUTH_BASE_URL || import.meta.env.NEON_AUTH_BASE_URL;
const dataApiUrl = import.meta.env.VITE_NEON_DATA_API_URL;

let client = null;

export function getNeonClient() {
    if (client) return client;
    if (!authUrl || !dataApiUrl) return null;
    client = createClient({
        auth: { adapter: new BetterAuthVanillaAdapter(), url: authUrl },
        dataApi: { url: dataApiUrl },
    });
    return client;
}

export function isDesktopApp() {
    return typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
}

export function isNeonConfigured() {
    if (isDesktopApp()) return false;
    return !!(authUrl && dataApiUrl);
}

// (no Supabase aliases)

// ========== AUTH ==========
export async function authSignUp(email, password) {
    const sb = getNeonClient();
    if (!sb) return null;
    const { data, error } = await sb.auth.signUp.email({ email, password, name: email.split('@')[0] });
    if (error) throw error;
    return data;
}

export async function authSignIn(email, password) {
    const sb = getNeonClient();
    if (!sb) return null;
    const { data, error } = await sb.auth.signIn.email({ email, password });
    if (error) throw error;
    return data;
}

export async function authSignOut() {
    const sb = getNeonClient();
    if (!sb) return;
    await sb.auth.signOut();
}

export async function authUpdatePassword(newPassword) {
    const sb = getNeonClient();
    if (!sb) return;
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) throw error;
}

export async function authGetUser() {
    const sb = getNeonClient();
    if (!sb) return null;
    const session = await sb.auth.getSession();
    return session?.user || null;
}

// ========== USERS PROFILE ==========
export async function fetchUserProfile(userId) {
    try {
        const sb = getNeonClient();
        if (sb) {
            const { data } = await sb.from('users').select('*').eq('id', userId).single();
            if (data) return data;
        }
    } catch (e) {
        console.warn('fetchUserProfile via client failed, fallback to neonSql:', e);
    }
    if (neonSql) {
        try {
            const rows = await neonSql`SELECT * FROM users WHERE id = ${userId}::uuid LIMIT 1`;
            if (rows && rows[0]) return rows[0];
        } catch (e) {
            console.error('fetchUserProfile via neonSql failed:', e);
        }
    }
    return null;
}

export async function upsertUserProfile(profile) {
    try {
        const sb = getNeonClient();
        if (sb) {
            const { data, error } = await sb.from('users').upsert(profile, { onConflict: 'id' }).select().single();
            if (data && !error) return data;
        }
    } catch (e) {
        console.warn('upsertUserProfile via client failed, fallback to neonSql:', e);
    }
    if (neonSql) {
        try {
            const rows = await neonSql`
                INSERT INTO users (id, email, username, name, role, storage_limit, force_change_password)
                VALUES (${profile.id}::uuid, ${profile.email}, ${profile.username}, ${profile.name}, ${profile.role || 'user'}, ${profile.storage_limit || 0}, ${!!profile.force_change_password})
                ON CONFLICT (id) DO UPDATE SET
                    email = EXCLUDED.email,
                    username = EXCLUDED.username,
                    name = EXCLUDED.name,
                    role = EXCLUDED.role
                RETURNING *
            `;
            if (rows && rows[0]) return rows[0];
        } catch (e) {
            console.error('upsertUserProfile via neonSql failed:', e);
        }
    }
    return profile;
}

export async function fetchAllUsers() {
    try {
        const sb = getNeonClient();
        if (sb) {
            const { data, error } = await sb.from('users').select('*').order('created_at', { ascending: false });
            if (data && !error) return data;
        }
    } catch (e) {}
    if (neonSql) {
        try {
            const rows = await neonSql`SELECT * FROM users ORDER BY created_at DESC`;
            return rows || [];
        } catch (e) {
            console.error('fetchAllUsers via neonSql failed:', e);
        }
    }
    return [];
}

export async function updateUserProfile(userId, updates) {
    try {
        const sb = getNeonClient();
        if (sb) {
            const { error } = await sb.from('users').update(updates).eq('id', userId);
            if (!error) return true;
        }
    } catch (e) {}
    if (neonSql) {
        try {
            if (updates.role) {
                await neonSql`UPDATE users SET role = ${updates.role} WHERE id = ${userId}::uuid`;
            }
            if (typeof updates.storage_limit === 'number') {
                await neonSql`UPDATE users SET storage_limit = ${updates.storage_limit} WHERE id = ${userId}::uuid`;
            }
            if (typeof updates.force_change_password === 'boolean') {
                await neonSql`UPDATE users SET force_change_password = ${updates.force_change_password} WHERE id = ${userId}::uuid`;
            }
            return true;
        } catch (e) {
            console.error('updateUserProfile via neonSql failed:', e);
        }
    }
    return false;
}

export async function deleteUserProfile(userId) {
    try {
        const sb = getNeonClient();
        if (sb) {
            const { error } = await sb.from('users').delete().eq('id', userId);
            if (!error) return true;
        }
    } catch (e) {}
    if (neonSql) {
        try {
            await neonSql`DELETE FROM users WHERE id = ${userId}::uuid`;
            return true;
        } catch (e) {
            console.error('deleteUserProfile via neonSql failed:', e);
        }
    }
    return false;
}

export async function saveUserSettings(userId, settings) {
    try {
        const sb = getNeonClient();
        if (sb) {
            const { error } = await sb.from('users').update({ settings }).eq('id', userId);
            if (!error) return true;
        }
    } catch (e) {}
    if (neonSql) {
        try {
            await neonSql`UPDATE users SET settings = ${JSON.stringify(settings)}::jsonb WHERE id = ${userId}::uuid`;
            return true;
        } catch (e) {}
    }
    return false;
}

export async function loadUserSettings(userId) {
    try {
        const sb = getNeonClient();
        if (sb) {
            const { data } = await sb.from('users').select('settings').eq('id', userId).single();
            if (data?.settings) return data.settings;
        }
    } catch (e) {}
    if (neonSql) {
        try {
            const rows = await neonSql`SELECT settings FROM users WHERE id = ${userId}::uuid LIMIT 1`;
            return rows?.[0]?.settings || null;
        } catch (e) {}
    }
    return null;
}

// ========== SITE CONFIG ==========
export async function loadSiteConfig() {
    try {
        const sb = getNeonClient();
        if (sb) {
            const { data, error } = await sb.from('site_config').select('*').eq('id', 1).single();
            if (data && !error) return data;
        }
    } catch (e) {}
    if (neonSql) {
        try {
            const rows = await neonSql`SELECT * FROM site_config WHERE id = 1 LIMIT 1`;
            return rows?.[0] || null;
        } catch (e) {}
    }
    return null;
}

export async function saveSiteConfig(patch) {
    try {
        const sb = getNeonClient();
        if (sb) {
            const payload = { id: 1, ...patch, updated_at: new Date().toISOString() };
            const { error } = await sb.from('site_config').upsert(payload, { onConflict: 'id' });
            if (!error) return true;
        }
    } catch (e) {}
    if (neonSql) {
        try {
            const existing = await neonSql`SELECT * FROM site_config WHERE id = 1 LIMIT 1`;
            if (existing && existing.length > 0) {
                if (typeof patch.lat === 'number') await neonSql`UPDATE site_config SET lat = ${patch.lat}, updated_at = NOW() WHERE id = 1`;
                if (typeof patch.lng === 'number') await neonSql`UPDATE site_config SET lng = ${patch.lng}, updated_at = NOW() WHERE id = 1`;
                if (typeof patch.time_offset === 'number') await neonSql`UPDATE site_config SET time_offset = ${patch.time_offset}, updated_at = NOW() WHERE id = 1`;
                if (patch.prayer_offsets) await neonSql`UPDATE site_config SET prayer_offsets = ${JSON.stringify(patch.prayer_offsets)}::jsonb, updated_at = NOW() WHERE id = 1`;
            } else {
                await neonSql`
                    INSERT INTO site_config (id, lat, lng, time_offset, prayer_offsets, updated_at)
                    VALUES (1, ${patch.lat || null}, ${patch.lng || null}, ${patch.time_offset || 0}, ${JSON.stringify(patch.prayer_offsets || {})}::jsonb, NOW())
                `;
            }
            return true;
        } catch (e) {}
    }
    return false;
}
