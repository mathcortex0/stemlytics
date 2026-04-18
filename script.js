// Supabase Configuration
const SUPABASE_URL = 'https://rgodtsufwbnkyikbkynx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_tzB6Iv0Zsj5C8mA5dazqiA_-ceEYk_S';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global state
let currentUser = null;
let selectedCourseForEnrollment = null;

// Initialize
window.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    setupEventListeners();
    
    const path = window.location.pathname;
    if (path.includes('index.html') || path === '/' || path === '/index.html') {
        loadCourses();
    } else if (path.includes('player.html')) {
        loadUserContentTree();
    } else if (path.includes('admin.html')) {
        await checkAdminAccess();
        loadAdminData();
        setupAdminEventListeners();
    }
});

async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user;
    
    const userEmailSpans = document.querySelectorAll('#userEmail, #userEmailPlayer');
    const loginBtns = document.querySelectorAll('#loginBtn');
    const logoutBtns = document.querySelectorAll('#logoutBtn, #logoutBtnPlayer, #adminLogoutBtn');
    const adminLink = document.getElementById('adminLink');
    
    if (user) {
        userEmailSpans.forEach(el => {
            if (el) {
                el.textContent = user.email;
                el.style.display = 'inline';
            }
        });
        loginBtns.forEach(btn => { if (btn) btn.style.display = 'none'; });
        logoutBtns.forEach(btn => { if (btn) btn.style.display = 'inline-block'; });
        
        // Check if admin (you can change this email)
        const isAdmin = user.email === 'admin@nexora.com';
        if (adminLink && isAdmin) adminLink.style.display = 'inline';
    } else {
        userEmailSpans.forEach(el => { if (el) el.style.display = 'none'; });
        loginBtns.forEach(btn => { if (btn) btn.style.display = 'inline-block'; });
        logoutBtns.forEach(btn => { if (btn) btn.style.display = 'none'; });
        if (adminLink) adminLink.style.display = 'none';
    }
}

function setupEventListeners() {
    // Login
    document.querySelectorAll('#loginBtn').forEach(btn => {
        btn?.addEventListener('click', async () => {
            const email = prompt('Enter your email address:');
            if (email) {
                const { error } = await supabase.auth.signInWithOtp({ email });
                if (error) alert('Error: ' + error.message);
                else alert('Check your email for the login link!');
            }
        });
    });
    
    // Logout
    document.querySelectorAll('#logoutBtn, #logoutBtnPlayer, #adminLogoutBtn').forEach(btn => {
        btn?.addEventListener('click', async () => {
            await supabase.auth.signOut();
            window.location.href = 'index.html';
        });
    });
    
    // Cancel access code panel
    const cancelBtn = document.getElementById('cancelAccessBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            document.getElementById('accessCodePanel').style.display = 'none';
            document.getElementById('codeError').textContent = '';
        });
    }
    
    // Submit access code
    const submitBtn = document.getElementById('submitAccessBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
            await verifyAndEnroll();
        });
    }
}

async function loadCourses() {
    const { data: courses, error } = await supabase
        .from('courses')
        .select('*')
        .eq('is_published', true);
    
    const container = document.getElementById('coursesContainer');
    if (error || !courses?.length) {
        container.innerHTML = '<div class="loading">No courses available yet.</div>';
        return;
    }
    
    container.innerHTML = courses.map(course => `
        <div class="card">
            <div class="card-content">
                <h3>${escapeHtml(course.title)}</h3>
                <p>${escapeHtml(course.description || 'Comprehensive learning program')}</p>
                <button class="btn-primary enroll-btn" data-course-id="${course.id}" data-course-title="${escapeHtml(course.title)}">Enroll Now</button>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll('.enroll-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!currentUser) {
                alert('Please login first! Click Login and enter your email.');
                return;
            }
            const courseId = btn.dataset.courseId;
            selectedCourseForEnrollment = courseId;
            document.getElementById('selectedCourseId').value = courseId;
            document.getElementById('accessCodePanel').style.display = 'block';
            document.getElementById('codeError').textContent = '';
            document.getElementById('accessCodeInput').value = '';
            
            document.getElementById('accessCodePanel').scrollIntoView({ behavior: 'smooth' });
        });
    });
}

async function verifyAndEnroll() {
    const accessCode = document.getElementById('accessCodeInput').value.trim();
    const courseId = document.getElementById('selectedCourseId').value;
    const errorDiv = document.getElementById('codeError');
    
    if (!accessCode) {
        errorDiv.textContent = 'Please enter your access code';
        return;
    }
    
    if (!courseId) {
        errorDiv.textContent = 'Invalid course selection';
        return;
    }
    
    // Check if code exists and is unused
    const { data: codeData, error: codeError } = await supabase
        .from('access_codes')
        .select('*')
        .eq('code', accessCode)
        .eq('course_id', courseId)
        .eq('is_used', false)
        .single();
    
    if (codeError || !codeData) {
        errorDiv.textContent = 'Invalid or already used access code. Please contact admin.';
        return;
    }
    
    // Check if user already has access
    const { data: existingAccess } = await supabase
        .from('user_access')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('course_id', courseId)
        .single();
    
    if (existingAccess) {
        errorDiv.textContent = 'You already have access to this course!';
        return;
    }
    
    // Mark code as used
    const { error: updateError } = await supabase
        .from('access_codes')
        .update({ is_used: true, used_by: currentUser.id, used_at: new Date() })
        .eq('id', codeData.id);
    
    if (updateError) {
        errorDiv.textContent = 'Error processing code. Please try again.';
        return;
    }
    
    // Grant access
    const { error: accessError } = await supabase
        .from('user_access')
        .insert({
            user_id: currentUser.id,
            course_id: courseId,
            access_code_id: codeData.id
        });
    
    if (accessError) {
        errorDiv.textContent = 'Error granting access. Contact admin.';
        return;
    }
    
    alert('✅ Access granted! You can now access the course content.');
    document.getElementById('accessCodePanel').style.display = 'none';
    document.getElementById('codeError').textContent = '';
}

// Convert YouTube URL to embed URL
function getYouTubeEmbedUrl(url) {
    if (!url) return null;
    
    // Check if it's already an embed URL
    if (url.includes('youtube.com/embed/')) return url;
    
    // Extract video ID
    let videoId = null;
    
    // Format: https://youtu.be/VIDEO_ID
    if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1]?.split('?')[0];
    }
    // Format: https://www.youtube.com/watch?v=VIDEO_ID
    else if (url.includes('youtube.com/watch')) {
        const urlParams = new URLSearchParams(url.split('?')[1]);
        videoId = urlParams.get('v');
    }
    // Format: https://www.youtube.com/embed/VIDEO_ID
    else if (url.includes('youtube.com/embed/')) {
        videoId = url.split('embed/')[1]?.split('?')[0];
    }
    // Just the video ID itself
    else if (url.length === 11 && !url.includes('http')) {
        videoId = url;
    }
    
    if (videoId) {
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
    }
    
    return url; // Return as is if not a YouTube URL
}

async function loadUserContentTree() {
    if (!currentUser) {
        document.getElementById('contentTree').innerHTML = '<div class="loading">Please login to view your courses.</div>';
        return;
    }
    
    const { data: userCourses, error: accessError } = await supabase
        .from('user_access')
        .select('course_id, courses(*)')
        .eq('user_id', currentUser.id);
    
    if (accessError || !userCourses?.length) {
        document.getElementById('contentTree').innerHTML = '<div class="loading">You don\'t have access to any courses yet. Enroll first using an access code!</div>';
        return;
    }
    
    let html = '';
    
    for (const uc of userCourses) {
        const course = uc.courses;
        html += `<div class="tree-node"><strong>📘 ${escapeHtml(course.title)}</strong>`;
        
        const { data: subjects } = await supabase
            .from('subjects')
            .select('*')
            .eq('course_id', course.id);
        
        if (subjects && subjects.length > 0) {
            for (const subject of subjects) {
                html += `<div class="subject-node">📖 ${escapeHtml(subject.name)}`;
                
                const { data: papers } = await supabase
                    .from('papers')
                    .select('*')
                    .eq('subject_id', subject.id);
                
                if (papers && papers.length > 0) {
                    for (const paper of papers) {
                        html += `<div class="paper-node">📄 ${escapeHtml(paper.name)}`;
                        
                        const { data: chapters } = await supabase
                            .from('chapters')
                            .select('*')
                            .eq('paper_id', paper.id);
                        
                        if (chapters && chapters.length > 0) {
                            for (const chapter of chapters) {
                                html += `<div class="chapter-node">📑 ${escapeHtml(chapter.title)}`;
                                
                                const { data: lectures } = await supabase
                                    .from('lectures')
                                    .select('*')
                                    .eq('chapter_id', chapter.id);
                                
                                if (lectures && lectures.length > 0) {
                                    for (const lecture of lectures) {
                                        html += `<div class="lecture-item" data-video="${escapeHtml(lecture.video_url)}" data-title="${escapeHtml(lecture.title)}">🎬 ${escapeHtml(lecture.title)}</div>`;
                                    }
                                }
                                html += `</div>`;
                            }
                        }
                        html += `</div>`;
                    }
                } else {
                    const { data: chapters } = await supabase
                        .from('chapters')
                        .select('*')
                        .eq('subject_id', subject.id)
                        .is('paper_id', null);
                    
                    if (chapters && chapters.length > 0) {
                        for (const chapter of chapters) {
                            html += `<div class="chapter-node">📑 ${escapeHtml(chapter.title)}`;
                            
                            const { data: lectures } = await supabase
                                .from('lectures')
                                .select('*')
                                .eq('chapter_id', chapter.id);
                            
                            if (lectures && lectures.length > 0) {
                                for (const lecture of lectures) {
                                    html += `<div class="lecture-item" data-video="${escapeHtml(lecture.video_url)}" data-title="${escapeHtml(lecture.title)}">🎬 ${escapeHtml(lecture.title)}</div>`;
                                }
                            }
                            html += `</div>`;
                        }
                    }
                }
                html += `</div>`;
            }
        }
        html += `</div>`;
    }
    
    document.getElementById('contentTree').innerHTML = html;
    
    // Add click handlers for lectures with YouTube support
    document.querySelectorAll('.lecture-item').forEach(el => {
        el.addEventListener('click', () => {
            const videoUrl = el.dataset.video;
            const title = el.dataset.title;
            const embedUrl = getYouTubeEmbedUrl(videoUrl);
            
            let videoHtml = '';
            if (embedUrl && embedUrl.includes('youtube.com/embed/')) {
                videoHtml = `
                    <h3>${escapeHtml(title)}</h3>
                    <div class="video-wrapper">
                        <iframe src="${embedUrl}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                    </div>
                `;
            } else if (videoUrl) {
                videoHtml = `
                    <h3>${escapeHtml(title)}</h3>
                    <video controls width="100%">
                        <source src="${videoUrl}" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                `;
            } else {
                videoHtml = `<div class="lecture-placeholder"><h3>${escapeHtml(title)}</h3><p>No video URL provided.</p></div>`;
            }
            
            document.getElementById('videoContainer').innerHTML = videoHtml;
        });
    });
}

// Admin Functions
async function checkAdminAccess() {
    if (!currentUser) {
        alert('Please login first');
        window.location.href = 'index.html';
        return;
    }
    
    const isAdmin = currentUser.email === 'admin@nexora.com';
    if (!isAdmin) {
        alert('Admin access only. Redirecting to home.');
        window.location.href = 'index.html';
    }
}

async function loadAdminData() {
    const { data: courses } = await supabase.from('courses').select('*');
    const select = document.getElementById('adminCourseSelect');
    if (select && courses) {
        select.innerHTML = '<option value="">-- Select Course --</option>' + 
            courses.map(c => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('');
        select.onchange = () => {
            const courseId = select.value;
            if (courseId) {
                loadRequests(courseId);
                loadApprovedUsers(courseId);
                loadAccessCodes(courseId);
                loadCourseStructure(courseId);
                loadSubjectsForSelects(courseId);
            }
        };
    }
}

function setupAdminEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(`${tab}Tab`).classList.add('active');
            btn.classList.add('active');
        });
    });
    
    // Generate codes
    const generateBtn = document.getElementById('generateCodesBtn');
    if (generateBtn) {
        generateBtn.addEventListener('click', async () => {
            const courseId = document.getElementById('adminCourseSelect').value;
            const numCodes = parseInt(document.getElementById('numCodes').value);
            
            if (!courseId) {
                alert('Please select a course first');
                return;
            }
            
            if (isNaN(numCodes) || numCodes < 1 || numCodes > 100) {
                alert('Please enter a valid number (1-100)');
                return;
            }
            
            const codes = [];
            for (let i = 0; i < numCodes; i++) {
                codes.push({ course_id: courseId, code: generateAccessCode(), is_used: false });
            }
            
            const { error } = await supabase.from('access_codes').insert(codes);
            if (error) {
                alert('Error generating codes: ' + error.message);
            } else {
                alert(`Generated ${numCodes} access codes successfully!`);
                loadAccessCodes(courseId);
            }
        });
    }
    
    // Add Subject
    const addSubjectBtn = document.getElementById('addSubjectBtn');
    if (addSubjectBtn) {
        addSubjectBtn.addEventListener('click', async () => {
            const courseId = document.getElementById('adminCourseSelect').value;
            const name = document.getElementById('newSubjectName').value.trim();
            
            if (!courseId) { alert('Select a course'); return; }
            if (!name) { alert('Enter subject name'); return; }
            
            const { error } = await supabase.from('subjects').insert({ course_id: courseId, name });
            if (error) alert('Error: ' + error.message);
            else {
                alert('Subject added!');
                document.getElementById('newSubjectName').value = '';
                loadCourseStructure(courseId);
                loadSubjectsForSelects(courseId);
            }
        });
    }
    
    // Add Paper
    const addPaperBtn = document.getElementById('addPaperBtn');
    if (addPaperBtn) {
        addPaperBtn.addEventListener('click', async () => {
            const subjectId = document.getElementById('paperSubjectSelect').value;
            const name = document.getElementById('newPaperName').value.trim();
            
            if (!subjectId) { alert('Select a subject'); return; }
            if (!name) { alert('Enter paper name'); return; }
            
            const { error } = await supabase.from('papers').insert({ subject_id: subjectId, name });
            if (error) alert('Error: ' + error.message);
            else {
                alert('Paper added!');
                document.getElementById('newPaperName').value = '';
                loadCourseStructure(document.getElementById('adminCourseSelect').value);
                loadSubjectsForSelects(document.getElementById('adminCourseSelect').value);
            }
        });
    }
    
    // Add Chapter
    const addChapterBtn = document.getElementById('addChapterBtn');
    if (addChapterBtn) {
        addChapterBtn.addEventListener('click', async () => {
            const parentValue = document.getElementById('chapterParentSelect').value;
            const title = document.getElementById('newChapterName').value.trim();
            
            if (!parentValue) { alert('Select a subject or paper'); return; }
            if (!title) { alert('Enter chapter title'); return; }
            
            const [type, id] = parentValue.split('_');
            let data = { title };
            if (type === 'subject') data.subject_id = id;
            else if (type === 'paper') data.paper_id = id;
            
            const { error } = await supabase.from('chapters').insert(data);
            if (error) alert('Error: ' + error.message);
            else {
                alert('Chapter added!');
                document.getElementById('newChapterName').value = '';
                loadCourseStructure(document.getElementById('adminCourseSelect').value);
            }
        });
    }
    
    // Add Lecture with YouTube support
    const addLectureBtn = document.getElementById('addLectureBtn');
    if (addLectureBtn) {
        addLectureBtn.addEventListener('click', async () => {
            const chapterId = document.getElementById('lectureChapterSelect').value;
            const title = document.getElementById('newLectureTitle').value.trim();
            let videoUrl = document.getElementById('newLectureUrl').value.trim();
            
            if (!chapterId) { alert('Select a chapter'); return; }
            if (!title) { alert('Enter lecture title'); return; }
            if (!videoUrl) { alert('Enter YouTube URL or Video ID'); return; }
            
            // Store the raw YouTube URL or ID
            const { error } = await supabase.from('lectures').insert({ 
                chapter_id: chapterId, 
                title: title, 
                video_url: videoUrl 
            });
            
            if (error) alert('Error: ' + error.message);
            else {
                alert('Lecture added successfully!');
                document.getElementById('newLectureTitle').value = '';
                document.getElementById('newLectureUrl').value = '';
                loadCourseStructure(document.getElementById('adminCourseSelect').value);
            }
        });
    }
}

async function loadRequests(courseId) {
    const { data: requests } = await supabase
        .from('enroll_requests')
        .select('*, users:user_id(email)')
        .eq('course_id', courseId)
        .eq('status', 'pending');
    
    const { data: allRequests } = await supabase
        .from('enroll_requests')
        .select('status')
        .eq('course_id', courseId);
    
    const total = allRequests?.length || 0;
    const approved = allRequests?.filter(r => r.status === 'approved')?.length || 0;
    
    document.getElementById('totalRequests').textContent = total;
    document.getElementById('pendingRequests').textContent = requests?.length || 0;
    document.getElementById('approvedRequests').textContent = approved;
    
    const pendingDiv = document.getElementById('pendingRequestsList');
    if (!requests?.length) {
        pendingDiv.innerHTML = '<div class="loading">No pending requests</div>';
        return;
    }
    
    pendingDiv.innerHTML = requests.map(req => `
        <div class="request-item">
            <div><strong>${escapeHtml(req.users?.email || req.user_id)}</strong></div>
            <div><span class="code-badge">Code: ${escapeHtml(req.access_code)}</span></div>
            <div>
                <button class="btn-success" onclick="approveRequest('${req.id}', '${courseId}', '${req.user_id}')">Approve</button>
                <button class="btn-danger" onclick="rejectRequest('${req.id}')">Reject</button>
            </div>
        </div>
    `).join('');
}

async function loadApprovedUsers(courseId) {
    const { data: users } = await supabase
        .from('user_access')
        .select('*, users:user_id(email)')
        .eq('course_id', courseId);
    
    const container = document.getElementById('approvedUsersList');
    if (!users?.length) {
        container.innerHTML = '<div class="loading">No approved users</div>';
        return;
    }
    
    container.innerHTML = users.map(user => `
        <div class="user-item">
            <div>${escapeHtml(user.users?.email || user.user_id)}</div>
            <button class="btn-danger" onclick="removeAccess('${user.id}', '${courseId}')">Remove Access</button>
        </div>
    `).join('');
}

async function loadAccessCodes(courseId) {
    const { data: unusedCodes } = await supabase
        .from('access_codes')
        .select('*')
        .eq('course_id', courseId)
        .eq('is_used', false);
    
    const { data: usedCodes } = await supabase
        .from('access_codes')
        .select('*')
        .eq('course_id', courseId)
        .eq('is_used', true);
    
    const unusedDiv = document.getElementById('accessCodesList');
    const usedDiv = document.getElementById('usedCodesList');
    
    if (!unusedCodes?.length) {
        unusedDiv.innerHTML = '<div class="loading">No unused codes available. Generate some!</div>';
    } else {
        unusedDiv.innerHTML = unusedCodes.map(code => `
            <div class="code-item">
                <span>🔑 ${escapeHtml(code.code)}</span>
                <span style="color: #10b981;">✓ Available</span>
            </div>
        `).join('');
    }
    
    if (!usedCodes?.length) {
        usedDiv.innerHTML = '<div class="loading">No used codes yet</div>';
    } else {
        usedDiv.innerHTML = usedCodes.map(code => `
            <div class="code-item">
                <span>🔒 ${escapeHtml(code.code)}</span>
                <span style="color: #ef4444;">✗ Used</span>
            </div>
        `).join('');
    }
}

async function loadCourseStructure(courseId) {
    const { data: subjects } = await supabase.from('subjects').select('*').eq('course_id', courseId);
    const container = document.getElementById('courseStructureView');
    
    if (!subjects?.length) {
        container.innerHTML = '<div class="loading">No subjects yet. Add your first subject!</div>';
        return;
    }
    
    let html = '';
    for (const subject of subjects) {
        html += `<div><strong>📖 ${escapeHtml(subject.name)}</strong>`;
        
        const { data: papers } = await supabase.from('papers').select('*').eq('subject_id', subject.id);
        if (papers?.length) {
            for (const paper of papers) {
                html += `<div style="margin-left: 20px;">📄 ${escapeHtml(paper.name)}`;
                const { data: chapters } = await supabase.from('chapters').select('*').eq('paper_id', paper.id);
                for (const chapter of chapters || []) {
                    html += `<div style="margin-left: 20px;">📑 ${escapeHtml(chapter.title)}`;
                    const { data: lectures } = await supabase.from('lectures').select('*').eq('chapter_id', chapter.id);
                    for (const lecture of lectures || []) {
                        html += `<div style="margin-left: 20px;">🎬 ${escapeHtml(lecture.title)} <span style="color:#666; font-size:12px;">(${escapeHtml(lecture.video_url?.substring(0, 50))}...)</span></div>`;
                    }
                    html += `</div>`;
                }
                html += `</div>`;
            }
        } else {
            const { data: chapters } = await supabase.from('chapters').select('*').eq('subject_id', subject.id).is('paper_id', null);
            for (const chapter of chapters || []) {
                html += `<div style="margin-left: 20px;">📑 ${escapeHtml(chapter.title)}`;
                const { data: lectures } = await supabase.from('lectures').select('*').eq('chapter_id', chapter.id);
                for (const lecture of lectures || []) {
                    html += `<div style="margin-left: 20px;">🎬 ${escapeHtml(lecture.title)}</div>`;
                }
                html += `</div>`;
            }
        }
        html += `</div><hr>`;
    }
    
    container.innerHTML = html;
}

async function loadSubjectsForSelects(courseId) {
    const { data: subjects } = await supabase.from('subjects').select('*').eq('course_id', courseId);
    
    const paperSelect = document.getElementById('paperSubjectSelect');
    if (paperSelect && subjects) {
        paperSelect.innerHTML = '<option value="">Select Subject</option>' + 
            subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    }
    
    const chapterSelect = document.getElementById('chapterParentSelect');
    if (chapterSelect && subjects) {
        let options = '<option value="">Select Subject or Paper</option>';
        for (const subject of subjects) {
            options += `<option value="subject_${subject.id}">📖 ${escapeHtml(subject.name)}</option>`;
            const { data: papers } = await supabase.from('papers').select('*').eq('subject_id', subject.id);
            for (const paper of papers || []) {
                options += `<option value="paper_${paper.id}">  └ 📄 ${escapeHtml(paper.name)} (in ${escapeHtml(subject.name)})</option>`;
            }
        }
        chapterSelect.innerHTML = options;
    }
    
    const lectureSelect = document.getElementById('lectureChapterSelect');
    if (lectureSelect) {
        const { data: chapters } = await supabase.from('chapters').select('*, subjects(name), papers(name)');
        if (chapters) {
            lectureSelect.innerHTML = '<option value="">Select Chapter</option>' + 
                chapters.map(c => `<option value="${c.id}">📑 ${escapeHtml(c.title)}</option>`).join('');
        }
    }
}

// Helper functions
window.approveRequest = async (requestId, courseId, userId) => {
    await supabase.from('enroll_requests').update({ status: 'approved' }).eq('id', requestId);
    
    const { data: existing } = await supabase.from('user_access').select('*').eq('user_id', userId).eq('course_id', courseId);
    if (!existing?.length) {
        await supabase.from('user_access').insert({ user_id: userId, course_id: courseId });
    }
    
    alert('Request approved! User can now access the course.');
    loadRequests(courseId);
    loadApprovedUsers(courseId);
};

window.rejectRequest = async (requestId) => {
    await supabase.from('enroll_requests').update({ status: 'rejected' }).eq('id', requestId);
    alert('Request rejected');
    loadRequests(document.getElementById('adminCourseSelect').value);
};

window.removeAccess = async (accessId, courseId) => {
    if (confirm('Remove access for this user?')) {
        await supabase.from('user_access').delete().eq('id', accessId);
        alert('Access removed');
        loadApprovedUsers(courseId);
    }
};

function generateAccessCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}
