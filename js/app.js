import { sb, auth, isAdmin, checkAccess, validateInviteCode, useInviteCode } from './supabase.js';

// Make functions globally available
window.sb = sb;
window.auth = auth;

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
  
  const colors = {
    success: '#10b981',
    error: '#ef4444',
    info: '#ffd700'
  };
  
  toast.innerHTML = `
    <i class="fas ${icons[type]}" style="color: ${colors[type]}"></i>
    <span class="flex-1">${message}</span>
  `;
  
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

window.showToast = showToast;

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

window.modal = modal;

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
  
  if (!courses || courses.length === 0) {
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
        <span class="text-gold text-sm font-semibold">
          View Course <i class="fas fa-arrow-right ml-1"></i>
        </span>
      </div>
    </div>
  `).join('');
}

// Handle course click
window.handleCourseClick = async (courseId) => {
  const { data: { user } } = await auth.getUser();
  
  if (!user) {
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
      <input type="text" id="inviteCodeInput" placeholder="Enter your code (e.g., STEM-XXXXXX)" class="input-field mb-4" autocomplete="off">
      <div class="flex gap-3">
        <button onclick="submitInviteCode('${courseId}')" class="btn-primary flex-1">Submit</button>
        <button onclick="modal.hide()" class="btn-secondary">Cancel</button>
      </div>
    `);
    
    // Focus input
    setTimeout(() => document.getElementById('inviteCodeInput')?.focus(), 100);
  }
};

// Submit invite code
window.submitInviteCode = async (courseId) => {
  const input = document.getElementById('inviteCodeInput');
  const code = input?.value.trim();
  
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

// ============================================
// ADMIN PANEL FUNCTIONS
// ============================================

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
  const { data: courses } = await sb.from('courses').select('*').order('created_at', { ascending: false });
  
  if (!courses || courses.length === 0) {
    container.innerHTML = '<p class="text-gray-400 text-center py-8">No courses yet. Click "Add Course" to create one.</p>';
    return;
  }
  
  container.innerHTML = courses.map(course => `
    <div class="bg-charcoal border border-gray-800 rounded-lg p-4">
      <div class="flex justify-between items-start">
        <div class="flex-1">
          <h4 class="font-bold text-lg">${course.title}</h4>
          <p class="text-sm text-gray-400">${course.subject || 'No subject'} · ${course.lecture_count || 0} lectures</p>
          ${course.description ? `<p class="text-sm text-gray-500 mt-1">${course.description.substring(0, 100)}...</p>` : ''}
        </div>
        <div class="flex gap-2 ml-4">
          <button onclick="manageLectures('${course.id}')" class="text-gold hover:text-gold/80 px-3 py-1 rounded border border-gold/30 text-sm">
            <i class="fas fa-video mr-1"></i>Lectures
          </button>
          <button onclick="editCourse('${course.id}')" class="text-gray-400 hover:text-white px-3 py-1 rounded border border-gray-700 text-sm">
            <i class="fas fa-edit"></i>
          </button>
          <button onclick="deleteCourse('${course.id}')" class="text-gray-400 hover:text-red-500 px-3 py-1 rounded border border-gray-700 text-sm">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

async function renderAdminUsers() {
  const container = document.getElementById('adminUsersList');
  const { data: users } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
  
  if (!users || users.length === 0) {
    container.innerHTML = '<p class="text-gray-400 text-center py-8">No users found</p>';
    return;
  }
  
  container.innerHTML = users.map(user => `
    <div class="bg-charcoal border border-gray-800 rounded-lg p-4">
      <div class="flex justify-between items-center">
        <div>
          <p class="font-medium">${user.full_name || 'No name'}</p>
          <p class="text-sm text-gray-400">${user.email}</p>
        </div>
        <span class="text-xs px-3 py-1 rounded-full ${user.role === 'admin' ? 'bg-gold/20 text-gold border border-gold/30' : 'bg-gray-800 text-gray-400'}">
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
    .select('*, profiles(email, full_name), courses(title)')
    .eq('status', 'pending');
  
  if (!enrollments || enrollments.length === 0) {
    container.innerHTML = '<p class="text-gray-400 text-center py-8">No pending enrollments</p>';
    return;
  }
  
  container.innerHTML = enrollments.map(e => `
    <div class="bg-charcoal border border-gray-800 rounded-lg p-4">
      <div class="flex justify-between items-center">
        <div>
          <p class="font-medium">${e.profiles?.full_name || e.profiles?.email}</p>
          <p class="text-sm text-gray-400">${e.courses?.title}</p>
          <p class="text-xs text-gray-500 mt-1">Requested: ${new Date(e.enrolled_at).toLocaleDateString()}</p>
        </div>
        <div class="flex gap-2">
          <button onclick="approveEnrollment('${e.id}')" class="bg-green-600/20 text-green-500 hover:bg-green-600 px-3 py-1 rounded text-sm">
            <i class="fas fa-check mr-1"></i>Approve
          </button>
          <button onclick="rejectEnrollment('${e.id}')" class="bg-red-600/20 text-red-500 hover:bg-red-600 px-3 py-1 rounded text-sm">
            <i class="fas fa-times mr-1"></i>Reject
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
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  
  if (!codes || codes.length === 0) {
    container.innerHTML = '<p class="text-gray-400 text-center py-8">No active invite codes. Generate one to give students access.</p>';
    return;
  }
  
  container.innerHTML = codes.map(code => {
    const isExpired = new Date(code.expires_at) < new Date();
    const usageText = code.max_uses ? `${code.usage_count}/${code.max_uses}` : `${code.usage_count}/∞`;
    
    return `
      <div class="bg-charcoal border ${isExpired ? 'border-red-500/30' : 'border-gray-800'} rounded-lg p-4">
        <div class="flex justify-between items-center">
          <div>
            <p class="font-mono text-xl font-bold ${isExpired ? 'text-gray-500' : 'text-gold'}">${code.code}</p>
            <p class="text-sm text-gray-400">${code.courses?.title}</p>
            <p class="text-xs text-gray-500 mt-1">
              <i class="fas fa-users mr-1"></i>${usageText} uses
              <i class="fas fa-calendar ml-3 mr-1"></i>Expires: ${new Date(code.expires_at).toLocaleDateString()}
            </p>
          </div>
          <button onclick="deactivateCode('${code.id}')" class="text-gray-400 hover:text-red-500 px-3 py-1 rounded border border-gray-700 text-sm">
            <i class="fas fa-ban mr-1"></i>Deactivate
          </button>
        </div>
      </div>
    `;
  }).join('');
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

window.deleteCourse = async (courseId) => {
  if (!confirm('Are you sure? This will delete all lectures and enrollments for this course.')) return;
  
  const { error } = await sb.from('courses').delete().eq('id', courseId);
  if (error) {
    showToast(error.message, 'error');
  } else {
    showToast('Course deleted', 'success');
    renderAdminCourses();
    renderCatalog();
  }
};

// Modal Functions
window.showCreateCourseModal = () => {
  modal.show(`
    <h3 class="text-2xl font-bold font-syne mb-4">Create New Course</h3>
    <form onsubmit="createCourse(event)">
      <input type="text" name="title" placeholder="Course Title" class="input-field mb-3" required>
      <input type="text" name="subject" placeholder="Subject (e.g., Physics, Chemistry, Math)" class="input-field mb-3">
      <textarea name="description" placeholder="Description" class="input-field mb-3" rows="3"></textarea>
      <div class="flex gap-3">
        <button type="submit" class="btn-primary flex-1">Create Course</button>
        <button type="button" onclick="modal.hide()" class="btn-secondary">Cancel</button>
      </div>
    </form>
  `);
};

window.createCourse = async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  
  const { data: { user } } = await auth.getUser();
  
  const { error } = await sb.from('courses').insert({
    ...data,
    created_by: user.id,
    lecture_count: 0
  });
  
  if (error) {
    showToast(error.message, 'error');
  } else {
    modal.hide();
    showToast('Course created successfully', 'success');
    renderAdminCourses();
    renderCatalog();
  }
};

window.showCreateUserModal = () => {
  modal.show(`
    <h3 class="text-2xl font-bold font-syne mb-4">Create User</h3>
    <form onsubmit="createUser(event)">
      <input type="email" name="email" placeholder="Email address" class="input-field mb-3" required>
      <input type="text" name="full_name" placeholder="Full Name (optional)" class="input-field mb-3">
      <select name="role" class="input-field mb-4">
        <option value="student">Student</option>
        <option value="admin">Admin</option>
      </select>
      <p class="text-sm text-gray-400 mb-4">
        <i class="fas fa-info-circle mr-1"></i>
        User will receive a magic link to set up their account
      </p>
      <div class="flex gap-3">
        <button type="submit" class="btn-primary flex-1">Send Magic Link</button>
        <button type="button" onclick="modal.hide()" class="btn-secondary">Cancel</button>
      </div>
    </form>
  `);
};

window.createUser = async (e) => {
  e.preventDefault();
  const form = e.target;
  const { email, full_name, role } = Object.fromEntries(new FormData(form));
  
  const { error } = await auth.signIn(email);
  
  if (error) {
    showToast(error.message, 'error');
  } else {
    modal.hide();
    showToast(`Magic link sent to ${email}`, 'success');
    setTimeout(() => renderAdminUsers(), 2000);
  }
};

window.showGenerateInviteModal = async () => {
  const { data: courses } = await sb.from('courses').select('id,title').order('title');
  
  modal.show(`
    <h3 class="text-2xl font-bold font-syne mb-4">Generate Invite Code</h3>
    <form onsubmit="generateInviteCode(event)">
      <select name="course_id" class="input-field mb-3" required>
        <option value="">Select Course</option>
        ${courses?.map(c => `<option value="${c.id}">${c.title}</option>`).join('') || ''}
      </select>
      <input type="number" name="max_uses" placeholder="Max Uses (leave empty for unlimited)" class="input-field mb-3" min="1">
      <input type="number" name="validity_days" placeholder="Valid for (days)" value="30" class="input-field mb-4" min="1">
      <div class="flex gap-3">
        <button type="submit" class="btn-primary flex-1">Generate Code</button>
        <button type="button" onclick="modal.hide()" class="btn-secondary">Cancel</button>
      </div>
    </form>
  `);
};

window.generateInviteCode = async (e) => {
  e.preventDefault();
  const form = e.target;
  const { course_id, max_uses, validity_days } = Object.fromEntries(new FormData(form));
  
  const code = 'STEM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const expires_at = new Date();
  expires_at.setDate(expires_at.getDate() + parseInt(validity_days || 30));
  
  const { data: { user } } = await auth.getUser();
  
  const { error } = await sb.from('invite_codes').insert({
    code,
    course_id,
    max_uses: max_uses ? parseInt(max_uses) : null,
    expires_at: expires_at.toISOString(),
    created_by: user.id
  });
  
  if (error) {
    showToast(error.message, 'error');
  } else {
    modal.hide();
    showToast(`Code generated: ${code}`, 'success');
    renderInviteCodes();
  }
};

// ============================================
// LECTURE MANAGEMENT
// ============================================

window.manageLectures = async (courseId) => {
  const { data: course } = await sb
    .from('courses')
    .select('title')
    .eq('id', courseId)
    .single();
  
  document.getElementById('lectureModalTitle').textContent = `Manage Lectures: ${course.title}`;
  document.getElementById('currentCourseId').value = courseId;
  document.getElementById('lectureModal').classList.remove('hidden');
  document.getElementById('lectureModal').classList.add('flex');
  
  await loadLectures(courseId);
};

window.closeLectureModal = () => {
  document.getElementById('lectureModal').classList.add('hidden');
  document.getElementById('lectureModal').classList.remove('flex');
};

async function loadLectures(courseId) {
  const container = document.getElementById('lecturesList');
  
  const { data: lectures, error } = await sb
    .from('lectures')
    .select('*')
    .eq('course_id', courseId)
    .order('order_index', { ascending: true });
  
  if (error) {
    container.innerHTML = '<p class="text-gray-400">Failed to load lectures</p>';
    return;
  }
  
  if (!lectures || lectures.length === 0) {
    container.innerHTML = '<p class="text-gray-400 text-center py-4">No lectures yet. Add your first lecture above.</p>';
    return;
  }
  
  container.innerHTML = lectures.map(lec => `
    <div class="bg-navy-light border border-gray-800 rounded-lg p-4">
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0">
          <img src="https://img.youtube.com/vi/${lec.youtube_embed_id}/default.jpg" 
               class="w-24 h-16 object-cover rounded">
        </div>
        <div class="flex-1">
          <div class="flex justify-between items-start">
            <div>
              <h5 class="font-bold">${lec.order_index || 1}. ${lec.title}</h5>
              <p class="text-xs text-gray-400 font-mono">YT ID: ${lec.youtube_embed_id}</p>
              ${lec.description ? `<p class="text-sm text-gray-500 mt-1">${lec.description}</p>` : ''}
            </div>
            <div class="flex gap-2">
              <button onclick="deleteLecture('${lec.id}', '${courseId}')" class="text-gray-400 hover:text-red-500">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

// Handle add lecture form
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('addLectureForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const courseId = document.getElementById('currentCourseId').value;
      const title = document.getElementById('lectureTitle').value;
      const youtubeId = document.getElementById('youtubeId').value;
      const description = document.getElementById('lectureDesc').value;
      const orderIndex = parseInt(document.getElementById('lectureOrder').value) || 1;
      
      const { error } = await sb.from('lectures').insert({
        course_id: courseId,
        title,
        youtube_embed_id: youtubeId,
        description: description || null,
        order_index: orderIndex
      });
      
      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Lecture added successfully', 'success');
        form.reset();
        document.getElementById('lectureOrder').value = orderIndex + 1;
        document.getElementById('currentCourseId').value = courseId;
        await loadLectures(courseId);
        await updateCourseLectureCount(courseId);
      }
    });
  }
});

window.deleteLecture = async (lectureId, courseId) => {
  if (!confirm('Delete this lecture?')) return;
  
  const { error } = await sb.from('lectures').delete().eq('id', lectureId);
  
  if (error) {
    showToast(error.message, 'error');
  } else {
    showToast('Lecture deleted', 'success');
    await loadLectures(courseId);
    await updateCourseLectureCount(courseId);
  }
};

async function updateCourseLectureCount(courseId) {
  const { count } = await sb
    .from('lectures')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', courseId);
  
  await sb.from('courses')
    .update({ lecture_count: count || 0 })
    .eq('id', courseId);
  
  renderAdminCourses();
  renderCatalog();
}

// ============================================
// INITIALIZATION
// ============================================

// Auth State Observer
auth.onAuthChange(async (event, session) => {
  const authSection = document.getElementById('authSection');
  const adminView = document.getElementById('adminView');
  const catalogView = document.getElementById('catalogView');
  
  if (session?.user) {
    const user = session.user;
    const admin = await isAdmin();
    
    authSection.innerHTML = `
      <span class="text-sm text-gray-400 hidden sm:inline">${user.email}</span>
      ${admin ? '<span class="text-xs bg-gold/20 text-gold px-2 py-1 rounded-full border border-gold/30">Admin</span>' : ''}
      <button onclick="auth.signOut()" class="text-gray-400 hover:text-white transition">
        <i class="fas fa-sign-out-alt"></i>
      </button>
    `;

    if (admin) {
      adminView.classList.remove('hidden');
      catalogView.classList.add('hidden');
      await renderAdminPanel();
    } else {
      adminView.classList.add('hidden');
      catalogView.classList.remove('hidden');
      await renderCatalog();
    }
  } else {
    authSection.innerHTML = `
      <input type="email" id="loginEmail" placeholder="Your email" 
             class="bg-charcoal border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-gold outline-none w-48 sm:w-64">
      <button onclick="handleLogin()" class="bg-gold text-navy px-4 py-1.5 rounded-lg font-bold text-sm hover:bg-gold/90">
        Login
      </button>
    `;
    adminView.classList.add('hidden');
    catalogView.classList.remove('hidden');
    await renderCatalog();
  }
});

// Global Login Handler
window.handleLogin = async () => {
  const email = document.getElementById('loginEmail')?.value;
  if (!email) {
    showToast('Please enter your email', 'error');
    return;
  }
  
  const { error } = await auth.signIn(email);
  if (error) {
    showToast(error.message, 'error');
  } else {
    showToast('Magic link sent! Check your email', 'success');
    document.getElementById('loginEmail').value = '';
  }
};

// Tab switching for admin panel
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.admin-tab');
  if (tab) {
    const tabName = tab.dataset.tab;
    
    document.querySelectorAll('.admin-tab').forEach(t => {
      t.classList.remove('active', 'text-gold', 'border-b-2', 'border-gold');
      t.classList.add('text-gray-400');
    });
    tab.classList.add('active', 'text-gold', 'border-b-2', 'border-gold');
    
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(`${tabName}Tab`).classList.remove('hidden');
  }
});

// Initial render
renderCatalog();
