import { sb, auth, isAdmin, checkAccess, validateInviteCode, useInviteCode } from './supabase.js';

// Toast System
export function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    info: 'fa-info-circle'
  };
  
  toast.innerHTML = `
    <i class="fas ${icons[type]} text-${type === 'error' ? 'red' : type === 'success' ? 'green' : 'gold'}-500"></i>
    <span class="flex-1">${message}</span>
  `;
  
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Modal System
export const modal = {
  show: (content) => {
    const overlay = document.getElementById('modalOverlay');
    overlay.innerHTML = `<div class="modal">${content}</div>`;
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) modal.hide();
    });
  },
  hide: () => {
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
  }
};

// Render Catalog
export async function renderCatalog() {
  const grid = document.getElementById('courseGrid');
  
  const { data: courses, error } = await sb
    .from('courses')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    grid.innerHTML = '<p class="text-gray-400 col-span-full text-center py-12">Failed to load courses</p>';
    return;
  }
  
  if (courses.length === 0) {
    grid.innerHTML = '<p class="text-gray-400 col-span-full text-center py-12">No courses available yet</p>';
    return;
  }
  
  grid.innerHTML = courses.map(course => `
    <div class="course-card" onclick="handleCourseClick('${course.id}')">
      <div class="flex items-start justify-between mb-4">
        <div>
          <span class="text-xs text-gold uppercase tracking-wider">${course.subject || 'STEM'}</span>
          <h3 class="text-xl font-bold font-syne mt-1">${course.title}</h3>
        </div>
        <i class="fas fa-graduation-cap text-gold/50"></i>
      </div>
      <p class="text-gray-400 text-sm mb-4">${course.description || 'Master this subject with comprehensive video lectures'}</p>
      <div class="flex items-center justify-between">
        <span class="text-xs text-gray-500">
          <i class="fas fa-video mr-1"></i>${course.lecture_count || 0} lectures
        </span>
        <button class="text-gold text-sm font-semibold hover:underline">
          View Course <i class="fas fa-arrow-right ml-1"></i>
        </button>
      </div>
    </div>
  `).join('');
}

// Handle course click
window.handleCourseClick = async (courseId) => {
  const user = await auth.getUser();
  
  if (!user.data.user) {
    showToast('Please login to access courses', 'info');
    return;
  }
  
  const hasAccess = await checkAccess(courseId);
  
  if (hasAccess) {
    window.location.href = `/player.html?id=${courseId}`;
  } else {
    // Show invite code modal
    modal.show(`
      <h3 class="text-2xl font-bold font-syne mb-4">Enter Invite Code</h3>
      <p class="text-gray-400 mb-6">This course requires an invite code for access</p>
      <input type="text" id="inviteCodeInput" placeholder="Enter your code" class="input-field mb-4">
      <div class="flex gap-3">
        <button onclick="submitInviteCode('${courseId}')" class="btn-primary flex-1">Submit</button>
        <button onclick="modal.hide()" class="btn-secondary">Cancel</button>
      </div>
    `);
  }
};

// Submit invite code
window.submitInviteCode = async (courseId) => {
  const code = document.getElementById('inviteCodeInput')?.value;
  if (!code) {
    showToast('Please enter an invite code', 'error');
    return;
  }
  
  try {
    await useInviteCode(code, courseId);
    modal.hide();
    showToast('Access granted! Redirecting...', 'success');
    setTimeout(() => {
      window.location.href = `/player.html?id=${courseId}`;
    }, 1000);
  } catch (error) {
    showToast(error.message, 'error');
  }
};

// Render Admin Panel
export async function renderAdminPanel() {
  await Promise.all([
    renderAdminCourses(),
    renderAdminUsers(),
    renderPendingEnrollments(),
    renderInviteCodes()
  ]);
}

async function renderAdminCourses() {
  const container = document.getElementById('adminCoursesList');
  const { data: courses } = await sb.from('courses').select('*');
  
  container.innerHTML = courses.map(course => `
    <div class="bg-charcoal border border-gray-800 rounded-lg p-4">
      <div class="flex justify-between items-start">
        <div>
          <h4 class="font-bold">${course.title}</h4>
          <p class="text-sm text-gray-400">${course.lecture_count || 0} lectures</p>
        </div>
        <div class="flex gap-2">
          <button onclick="editCourse('${course.id}')" class="text-gray-400 hover:text-gold">
            <i class="fas fa-edit"></i>
          </button>
          <button onclick="deleteCourse('${course.id}')" class="text-gray-400 hover:text-red-500">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

async function renderAdminUsers() {
  const container = document.getElementById('adminUsersList');
  const { data: users } = await sb.from('profiles').select('*');
  
  container.innerHTML = users.map(user => `
    <div class="bg-charcoal border border-gray-800 rounded-lg p-4">
      <div class="flex justify-between items-center">
        <div>
          <p class="font-medium">${user.full_name || 'No name'}</p>
          <p class="text-sm text-gray-400">${user.email}</p>
        </div>
        <span class="text-xs px-2 py-1 rounded ${user.role === 'admin' ? 'bg-gold/20 text-gold' : 'bg-gray-800 text-gray-400'}">
          ${user.role}
        </span>
      </div>
    </div>
  `).join('');
}

async function renderPendingEnrollments() {
  const container = document.getElementById('pendingEnrollmentsList');
  const { data: enrollments } = await sb
    .from('enrollments')
    .select('*, profiles(*), courses(*)')
    .eq('status', 'pending');
  
  if (!enrollments?.length) {
    container.innerHTML = '<p class="text-gray-400 text-center py-8">No pending enrollments</p>';
    return;
  }
  
  container.innerHTML = enrollments.map(e => `
    <div class="bg-charcoal border border-gray-800 rounded-lg p-4">
      <div class="flex justify-between items-center">
        <div>
          <p class="font-medium">${e.profiles?.email}</p>
          <p class="text-sm text-gray-400">${e.courses?.title}</p>
        </div>
        <div class="flex gap-2">
          <button onclick="approveEnrollment('${e.id}')" class="text-green-500 hover:text-green-400">
            <i class="fas fa-check"></i>
          </button>
          <button onclick="rejectEnrollment('${e.id}')" class="text-red-500 hover:text-red-400">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

async function renderInviteCodes() {
  const container = document.getElementById('inviteCodesList');
  const { data: codes } = await sb
    .from('invite_codes')
    .select('*, courses(title)')
    .eq('is_active', true);
  
  if (!codes?.length) {
    container.innerHTML = '<p class="text-gray-400 text-center py-8">No active invite codes</p>';
    return;
  }
  
  container.innerHTML = codes.map(code => `
    <div class="bg-charcoal border border-gray-800 rounded-lg p-4">
      <div class="flex justify-between items-center">
        <div>
          <p class="font-mono text-lg font-bold text-gold">${code.code}</p>
          <p class="text-sm text-gray-400">${code.courses?.title} · ${code.usage_count}/${code.max_uses || '∞'} uses</p>
        </div>
        <button onclick="deactivateCode('${code.id}')" class="text-gray-400 hover:text-red-500">
          <i class="fas fa-ban"></i>
        </button>
      </div>
    </div>
  `).join('');
}

// Admin Actions
window.approveEnrollment = async (enrollmentId) => {
  await sb.from('enrollments').update({ status: 'approved' }).eq('id', enrollmentId);
  showToast('Enrollment approved', 'success');
  renderPendingEnrollments();
};

window.rejectEnrollment = async (enrollmentId) => {
  await sb.from('enrollments').update({ status: 'rejected' }).eq('id', enrollmentId);
  showToast('Enrollment rejected', 'info');
  renderPendingEnrollments();
};

window.deactivateCode = async (codeId) => {
  await sb.from('invite_codes').update({ is_active: false }).eq('id', codeId);
  showToast('Invite code deactivated', 'success');
  renderInviteCodes();
};

// Modal Functions
window.showCreateCourseModal = () => {
  modal.show(`
    <h3 class="text-2xl font-bold font-syne mb-4">Create New Course</h3>
    <form onsubmit="createCourse(event)">
      <input type="text" name="title" placeholder="Course Title" class="input-field mb-3" required>
      <input type="text" name="subject" placeholder="Subject (e.g., Physics)" class="input-field mb-3">
      <textarea name="description" placeholder="Description" class="input-field mb-3" rows="3"></textarea>
      <div class="flex gap-3">
        <button type="submit" class="btn-primary flex-1">Create</button>
        <button type="button" onclick="modal.hide()" class="btn-secondary">Cancel</button>
      </div>
    </form>
  `);
};

window.createCourse = async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  
  const { error } = await sb.from('courses').insert({
    ...data,
    created_by: (await auth.getUser()).data.user.id
  });
  
  if (error) {
    showToast(error.message, 'error');
  } else {
    modal.hide();
    showToast('Course created successfully', 'success');
    renderAdminCourses();
  }
};

window.showCreateUserModal = () => {
  modal.show(`
    <h3 class="text-2xl font-bold font-syne mb-4">Create User</h3>
    <form onsubmit="createUser(event)">
      <input type="email" name="email" placeholder="Email address" class="input-field mb-3" required>
      <input type="text" name="full_name" placeholder="Full Name" class="input-field mb-3">
      <select name="role" class="input-field mb-4">
        <option value="student">Student</option>
        <option value="admin">Admin</option>
      </select>
      <p class="text-sm text-gray-400 mb-4">
        <i class="fas fa-info-circle mr-1"></i>
        User will receive a magic link to set up their account
      </p>
      <div class="flex gap-3">
        <button type="submit" class="btn-primary flex-1">Create & Send Invite</button>
        <button type="button" onclick="modal.hide()" class="btn-secondary">Cancel</button>
      </div>
    </form>
  `);
};

window.createUser = async (e) => {
  e.preventDefault();
  const form = e.target;
  const { email, full_name, role } = Object.fromEntries(new FormData(form));
  
  // Send magic link
  const { error } = await auth.signIn(email);
  
  if (error) {
    showToast(error.message, 'error');
  } else {
    // Profile will be created via database trigger
    modal.hide();
    showToast(`Magic link sent to ${email}`, 'success');
    setTimeout(() => renderAdminUsers(), 1000);
  }
};

window.showGenerateInviteModal = () => {
  modal.show(`
    <h3 class="text-2xl font-bold font-syne mb-4">Generate Invite Code</h3>
    <form onsubmit="generateInviteCode(event)">
      <select name="course_id" class="input-field mb-3" required>
        <option value="">Select Course</option>
      </select>
      <input type="number" name="max_uses" placeholder="Max Uses (leave empty for unlimited)" class="input-field mb-3">
      <input type="number" name="validity_days" placeholder="Valid for (days)" value="30" class="input-field mb-4">
      <div class="flex gap-3">
        <button type="submit" class="btn-primary flex-1">Generate</button>
        <button type="button" onclick="modal.hide()" class="btn-secondary">Cancel</button>
      </div>
    </form>
  `);
  
  // Populate courses dropdown
  setTimeout(async () => {
    const select = document.querySelector('select[name="course_id"]');
    const { data: courses } = await sb.from('courses').select('id,title');
    select.innerHTML += courses.map(c => `<option value="${c.id}">${c.title}</option>`).join('');
  }, 100);
};

window.generateInviteCode = async (e) => {
  e.preventDefault();
  const form = e.target;
  const { course_id, max_uses, validity_days } = Object.fromEntries(new FormData(form));
  
  const code = 'STEM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const expires_at = new Date();
  expires_at.setDate(expires_at.getDate() + parseInt(validity_days));
  
  const { error } = await sb.from('invite_codes').insert({
    code,
    course_id,
    max_uses: max_uses ? parseInt(max_uses) : null,
    expires_at: expires_at.toISOString(),
    created_by: (await auth.getUser()).data.user.id
  });
  
  if (error) {
    showToast(error.message, 'error');
  } else {
    modal.hide();
    showToast(`Code generated: ${code}`, 'success');
    renderInviteCodes();
  }
};
