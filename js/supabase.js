// Supabase Configuration
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://dzjpzqdvmglaqqrfhndm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fM_Rm7g-wYdHpGn_8qelxw_rtKB3Lb4';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// Auth Helpers
export const auth = {
  getUser: () => sb.auth.getUser(),
  signIn: (email) => sb.auth.signInWithOtp({ 
    email,
    options: {
      emailRedirectTo: window.location.origin
    }
  }),
  signOut: () => sb.auth.signOut(),
  onAuthChange: (cb) => sb.auth.onAuthStateChange(cb)
};

// Check if current user is admin
export async function isAdmin() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return false;
  
  const { data: profile } = await sb
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  
  return profile?.role === 'admin';
}

// Get current user profile
export async function getCurrentUser() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  
  const { data: profile } = await sb
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  
  return { ...user, ...profile };
}

// Check course access (with cache)
const accessCache = new Map();

export async function checkAccess(courseId) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return false;
  
  // Admin always has access
  if (await isAdmin()) return true;
  
  // Check cache
  const cacheKey = `${user.id}_${courseId}`;
  const cached = accessCache.get(cacheKey);
  if (cached && cached.exp > Date.now()) {
    return cached.status;
  }
  
  // Check enrollment
  const { data: enrollment } = await sb
    .from('enrollments')
    .select('status')
    .eq('user_id', user.id)
    .eq('course_id', courseId)
    .maybeSingle();
  
  const hasAccess = enrollment?.status === 'approved';
  
  // Cache for 5 minutes
  accessCache.set(cacheKey, {
    status: hasAccess,
    exp: Date.now() + 5 * 60 * 1000
  });
  
  return hasAccess;
}

// Validate invite code
export async function validateInviteCode(code, courseId) {
  const { data, error } = await sb
    .from('invite_codes')
    .select('*')
    .eq('code', code.toUpperCase())
    .eq('course_id', courseId)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .single();
  
  if (error) return null;
  
  // Check max uses
  if (data.max_uses && data.usage_count >= data.max_uses) {
    return null;
  }
  
  return data;
}

// Use invite code
export async function useInviteCode(code, courseId) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('Not logged in');
  
  // Validate code
  const invite = await validateInviteCode(code, courseId);
  if (!invite) throw new Error('Invalid or expired invite code');
  
  // Create enrollment
  const { error: enrollError } = await sb
    .from('enrollments')
    .upsert({
      user_id: user.id,
      course_id: courseId,
      status: 'approved',
      invite_code_used: code.toUpperCase()
    });
  
  if (enrollError) throw enrollError;
  
  // Increment usage count
  await sb
    .from('invite_codes')
    .update({ usage_count: invite.usage_count + 1 })
    .eq('id', invite.id);
  
  // Clear cache
  accessCache.delete(`${user.id}_${courseId}`);
  
  return true;
}
