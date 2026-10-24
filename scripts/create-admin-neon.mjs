import { createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';

const authUrl = process.env.VITE_NEON_AUTH_BASE_URL || process.env.NEON_AUTH_BASE_URL;
const dataApiUrl = process.env.VITE_NEON_DATA_API_URL;
const client = createClient({
  auth: { adapter: SupabaseAuthAdapter({ fetchOptions: { headers: { Origin: 'http://localhost:5173' } } }), url: authUrl },
  dataApi: { url: dataApiUrl },
});

const [email, password, username, name, role='admin'] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node create-admin-neon.mjs <email> <password> [username] [name] [role]');
  process.exit(1);
}

try {
  const { data: signUpData, error: signUpError } = await client.auth.signUp({ email, password });
  if (signUpError) throw signUpError;
  const user = signUpData?.user;
  if (!user) throw new Error('No user returned from signUp');
  console.log('Auth user created:', user.id, user.email);

  const profile = {
    id: user.id,
    email,
    username: username || email.split('@')[0],
    name: name || username || email.split('@')[0],
    role,
    storage_limit: 500,
    force_change_password: false,
    settings: {},
  };
  const { data, error } = await client.from('users').upsert(profile, { onConflict: 'id' }).select().single();
  if (error) throw error;
  console.log('Profile upserted:', data);
} catch (e) {
  console.error('Failed:', e.message || e);
  process.exit(1);
}
