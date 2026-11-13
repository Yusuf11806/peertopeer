let currentAuthMode = 'login';
let currentUser = null;
let profileSelectedSchedule = [];
let activeChatPeerId = null;

const SUPPORT_EMAIL = 'yusuf.daniel@binus.ac.id';
const homePage = document.getElementById('homePage');
const authPage = document.getElementById('authPage');
const dashboardPage = document.getElementById('dashboardPage');
const authForm = document.getElementById('authForm');
const profileForm = document.getElementById('profileForm');
const buddyList = document.getElementById('buddyList');
const filterSubject = document.getElementById('filterSubject');
const chatWidget = document.getElementById('chatWidget');
const chatWidgetBody = document.getElementById('chatWidgetBody');
const chatWidgetForm = document.getElementById('chatWidgetForm');
const chatWidgetInput = document.getElementById('chatWidgetInput');
const chatWidgetTargetName = document.getElementById('chatWidgetTargetName');
const chatLauncher = document.getElementById('chatLauncher');
const chatBackButton = document.getElementById('chatBackButton');

const LOCAL_DATA_KEY = 'p2p_local_data';
const LOCAL_SESSION_KEY = 'p2p_local_user';
const LOCAL_ADMIN_EMAIL = 'yusuf.daniel@binus.ac.id';
const COURSE_CATEGORIES = [
    'Computing / IT', 'Business', 'Design / Arts',
    'Engineering', 'Humanities', 'Hospitality', 'General / Other'
];
let mentorCourseRowSequence = 0;

function categoryForCourse(course) {
    const name = String(course || '').toLowerCase();
    if (/hospitality|tourism|hotel|restaurant|kitchen|pastry|bakery|bar operation|culinary|gastronomy|catering|steward|mixology|coffee art|housekeeping|front office/.test(name)) return COURSE_CATEGORIES[5];
    if (/design|graphic|art review|typography|photograph|drawing|illustration|animation|media|visual|interior|furniture|aesthetic|color|colour|3d art/.test(name)) return COURSE_CATEGORIES[2];
    if (/psychology|international relations|world history|social science|politic|diplomacy|security studies|global governance|regionalism|migration|anthropology|law issue|conflict and peace|indonesian|english professional|academic writing/.test(name)) return COURSE_CATEGORIES[4];
    if (/engineering|calculus|physics|chemistry|geology|hydrology|statics|statistics method|manufacturing|supply chain|ergonomic|anthropometry|material knowledge/.test(name)) return COURSE_CATEGORIES[3];
    if (/business|management|marketing|accounting|finance|entrepreneur|econom|taxation|retail|logistic|leadership|innovation|venture|project hatchery|organization|strategy|sustainability reporting/.test(name)) return COURSE_CATEGORIES[1];
    if (/programming|computer|data|algorithm|software|network|cloud|artificial intelligence|database|web|cyber|information system|operating system|security|technology|system administration|computing|internet of things|machine learning|statistics|mathematics|mobile application/.test(name)) return COURSE_CATEGORIES[0];
    return COURSE_CATEGORIES[6];
}

function setCourseCategoryOptions(select, includeAll = false) {
    select.replaceChildren();
    const first = document.createElement('option');
    first.value = includeAll ? '' : '';
    first.textContent = includeAll ? 'All course categories' : 'Choose a category';
    select.append(first);
    COURSE_CATEGORIES.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        select.append(option);
    });
}

function populateCourseDatalist(category, listId) {
    const list = document.getElementById(listId);
    const all = [...document.querySelectorAll('#binusCourseOptions option')].map(option => option.value).filter(Boolean);
    list.replaceChildren();
    all.filter(course => !category || categoryForCourse(course) === category).forEach(course => {
        const option = document.createElement('option');
        option.value = course;
        list.append(option);
    });
}

function initializeCourseCategories() {
    const profileCategory = document.getElementById('profCourseCategory');
    const filterCategory = document.getElementById('filterCourseCategory');
    setCourseCategoryOptions(profileCategory);
    setCourseCategoryOptions(filterCategory, true);
    filterCategory.addEventListener('change', () => {
        const input = document.getElementById('filterSubject');
        input.value = '';
        input.disabled = !filterCategory.value;
        populateCourseDatalist(filterCategory.value, 'filterCourseOptions');
        refreshStudents().catch(showError);
    });
    profileCategory.addEventListener('change', () => {
        const input = document.getElementById('profSubject');
        input.value = '';
        input.disabled = !profileCategory.value;
        populateCourseDatalist(profileCategory.value, 'profileCourseOptions');
    });
    populateCourseDatalist('', 'profileCourseOptions');
    populateCourseDatalist('', 'filterCourseOptions');
}

initializeCourseCategories();

function readLocalData() {
    try {
        const data = JSON.parse(localStorage.getItem(LOCAL_DATA_KEY) || '{}');
        return {
            users: Array.isArray(data.users) ? data.users : [],
            assignments: Array.isArray(data.assignments) ? data.assignments : [],
            messages: Array.isArray(data.messages) ? data.messages : [],
            dailyUpdates: Array.isArray(data.dailyUpdates) ? data.dailyUpdates : []
        };
    } catch {
        return { users: [], assignments: [], messages: [] };
    }
}

function writeLocalData(data) {
    localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
}

function localPublicUser(user, data = readLocalData(), includeAssignedMentor = true) {
    if (!user) return null;
    const assignment = data.assignments.find(item => item.studentId === user.id);
    return {
        id: user.id, email: user.email, nim: user.nim,
        isMentor: Boolean(user.isMentor), isAdmin: Boolean(user.isAdmin),
        mentorCourses: Array.isArray(user.mentorCourses) ? user.mentorCourses : [],
        hasProfile: Boolean(user.hasProfile), profile: user.profile || null,
        assignedMentor: includeAssignedMentor && assignment
            ? localPublicUser(data.users.find(item => item.id === assignment.mentorId), data, false)
            : null
    };
}

function encodeBase64(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

async function hashLocalPassword(password, salt) {
    if (!globalThis.crypto?.subtle || !globalThis.isSecureContext) {
        throw new Error('Password security is unavailable on this page. Run Peer2Peer through localhost or HTTPS instead of opening the HTML file directly.');
    }
    const saltBytes = salt ? Uint8Array.from(atob(salt), character => character.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 120000, hash: 'SHA-256' }, key, 256);
    return { salt: encodeBase64(saltBytes), hash: encodeBase64(hash) };
}

function localCurrentUser(data = readLocalData()) {
    const id = Number(localStorage.getItem(LOCAL_SESSION_KEY));
    return data.users.find(user => user.id === id) || null;
}

function localRequireUser(data) {
    const user = localCurrentUser(data);
    if (!user) throw new Error('Please sign in to continue.');
    return user;
}

function localRequireAdmin(data) {
    const user = localRequireUser(data);
    if (!user.isAdmin) throw new Error('Admin access is required.');
    return user;
}

async function api(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const url = new URL(`/api/${path.replace(/^\//, '')}`, window.location.origin);
    let body = {};
    try { body = options.body ? JSON.parse(options.body) : {}; } catch { body = {}; }
    const data = readLocalData();
    const profileUser = user => ({ ...user, profile: user.profile || null });

    if (url.pathname === '/api/auth/me' && method === 'GET') {
        const user = localCurrentUser(data);
        if (!user) throw new Error('Please sign in to continue.');
        return { user: localPublicUser(user, data) };
    }
    if (url.pathname === '/api/auth/logout' && method === 'POST') {
        localStorage.removeItem(LOCAL_SESSION_KEY);
        return { ok: true };
    }
    if (url.pathname === '/api/auth/register' && method === 'POST') {
        const email = String(body.email || '').trim().toLowerCase();
        const nim = String(body.nim || '').trim().toUpperCase();
        const password = String(body.password || '');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || nim.length < 3 || nim.length > 32) throw new Error('Enter a valid email and BINUS NIM.');
        if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) throw new Error('Password must be at least 8 characters and include an uppercase letter and a number.');
        if (data.users.some(user => user.email === email || user.nim === nim)) throw new Error('That email or NIM is already registered.');
        const passwordData = await hashLocalPassword(password);
        const asMentor = Boolean(body.isMentor);
        const mentorCourses = Array.isArray(body.mentorCourses) ? body.mentorCourses : [];
        if (asMentor && (!mentorCourses.length || mentorCourses.some(item => !String(item.course || '').trim() || !String(item.grade || '').trim()))) throw new Error('Add at least one course and your grade in it to sign up as a mentor.');
        const user = {
            id: Date.now() + Math.floor(Math.random() * 1000), email, nim,
            passwordSalt: passwordData.salt, passwordHash: passwordData.hash,
            isMentor: asMentor, mentorCourses: asMentor ? mentorCourses : [],
            isAdmin: email === LOCAL_ADMIN_EMAIL, hasProfile: false, profile: null
        };
        data.users.push(user);
        writeLocalData(data);
        localStorage.setItem(LOCAL_SESSION_KEY, String(user.id));
        return { user: localPublicUser(user, data) };
    }
    if (url.pathname === '/api/auth/login' && method === 'POST') {
        const email = String(body.email || '').trim().toLowerCase();
        const user = data.users.find(item => item.email === email);
        const passwordData = user ? await hashLocalPassword(String(body.password || ''), user.passwordSalt) : null;
        if (!user || passwordData.hash !== user.passwordHash) throw new Error('Invalid email or password.');
        localStorage.setItem(LOCAL_SESSION_KEY, String(user.id));
        return { user: localPublicUser(user, data) };
    }
    if (url.pathname === '/api/profile' && method === 'PUT') {
        const user = localRequireUser(data);
        const profile = body.profile || body;
        const required = ['name', 'major', 'subject', 'skillHave', 'studyMode', 'bio'];
        if (required.some(key => !String(profile[key] || '').trim())) throw new Error('Complete all required profile fields.');
        if (!['Online', 'Onsite'].includes(profile.studyMode)) throw new Error('Choose a valid study preference.');
        user.profile = { ...profile, schedule: Array.isArray(profile.schedule) ? profile.schedule : [] };
        user.hasProfile = true;
        writeLocalData(data);
        return { user: localPublicUser(user, data) };
    }
    if (url.pathname === '/api/daily-updates' && method === 'GET') {
        const user = localRequireUser(data);
        const studentIds = data.assignments.filter(item => item.mentorId === user.id).map(item => item.studentId);
        const visibleIds = new Set([user.id, ...studentIds]);
        return { updates: data.dailyUpdates.filter(item => visibleIds.has(item.userId)).sort((a, b) => b.createdAt - a.createdAt).map(item => ({
            ...item, studentName: data.users.find(person => person.id === item.userId)?.profile?.name || 'Student'
        })) };
    }
    if (url.pathname === '/api/daily-updates' && method === 'POST') {
        const user = localRequireUser(data);
        const text = String(body.text || '').trim();
        const image = String(body.image || '');
        if (!text || text.length > 1200) throw new Error('Write a short update before sharing.');
        if (image && (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 2200000)) throw new Error('Choose an image under 1.5 MB.');
        data.dailyUpdates.push({ id: Date.now() + Math.floor(Math.random() * 1000), userId: user.id, text, image, createdAt: Date.now() });
        writeLocalData(data);
        return { ok: true };
    }
    if (url.pathname === '/api/students' && method === 'GET') {
        const user = localRequireUser(data);
        return { users: data.users.filter(item => item.hasProfile && item.id !== user.id).map(profileUser) };
    }
    if (url.pathname === '/api/admin/users' && method === 'GET') {
        localRequireAdmin(data);
        return { users: data.users.filter(user => !user.isAdmin).map(user => ({
            ...profileUser(user), assignedMentorId: data.assignments.find(item => item.studentId === user.id)?.mentorId || null
        })) };
    }
    if (url.pathname === '/api/admin/mentors' && method === 'POST') {
        localRequireAdmin(data);
        const target = data.users.find(user => user.id === Number(body.userId) && !user.isAdmin);
        if (!target) throw new Error('Student account not found.');
        if (!body.isMentor && data.assignments.some(item => item.mentorId === target.id)) throw new Error('Reassign this mentor’s students before removing mentor status.');
        target.isMentor = Boolean(body.isMentor);
        writeLocalData(data);
        return { ok: true };
    }
    if (url.pathname === '/api/admin/assignments' && method === 'POST') {
        localRequireAdmin(data);
        const studentId = Number(body.studentId);
        const mentorId = body.mentorId === null ? null : Number(body.mentorId);
        const assignmentIndex = data.assignments.findIndex(item => item.studentId === studentId);
        if (mentorId === null) {
            if (assignmentIndex >= 0) data.assignments.splice(assignmentIndex, 1);
        } else {
            const mentor = data.users.find(user => user.id === mentorId && user.isMentor && user.nim);
            if (studentId === mentorId || !mentor || !data.users.some(user => user.id === studentId && !user.isAdmin)) throw new Error('Choose a registered student and a designated mentor with a NIM.');
            if (assignmentIndex >= 0) data.assignments[assignmentIndex].mentorId = mentorId;
            else data.assignments.push({ studentId, mentorId });
        }
        writeLocalData(data);
        return { ok: true };
    }
    if (url.pathname === '/api/chat/contacts' && method === 'GET') {
        const user = localRequireUser(data);
        const isRelated = id => data.assignments.some(item => (item.studentId === user.id && item.mentorId === id) || (item.studentId === id && item.mentorId === user.id));
        const contacts = data.users.filter(peer => peer.id !== user.id && (peer.hasProfile || isRelated(peer.id)));
        return { contacts: contacts.map(peer => {
            const recent = data.messages.filter(message => (message.senderId === user.id && message.recipientId === peer.id) || (message.senderId === peer.id && message.recipientId === user.id)).sort((a, b) => b.createdAt - a.createdAt)[0];
            return { ...profileUser(peer), recentMessage: recent?.message || '', recentAt: recent?.createdAt || 0 };
        }).sort((a, b) => b.recentAt - a.recentAt) };
    }
    if (url.pathname === '/api/chat/messages' && method === 'GET') {
        const user = localRequireUser(data);
        const peerId = Number(url.searchParams.get('peerId'));
        return { messages: data.messages.filter(message => (message.senderId === user.id && message.recipientId === peerId) || (message.senderId === peerId && message.recipientId === user.id)).sort((a, b) => a.createdAt - b.createdAt).map(message => ({
            id: message.id, text: message.message, senderId: message.senderId,
            senderEmail: data.users.find(item => item.id === message.senderId)?.email || '', timestamp: message.createdAt
        })) };
    }
    if (url.pathname === '/api/chat/messages' && method === 'POST') {
        const user = localRequireUser(data);
        const peerId = Number(body.peerId);
        const message = String(body.message || '').trim();
        const canMessage = data.users.some(peer => peer.id === peerId && peer.id !== user.id && (peer.hasProfile || data.assignments.some(item => (item.studentId === user.id && item.mentorId === peerId) || (item.studentId === peerId && item.mentorId === user.id))));
        if (!canMessage || !message || message.length > 3000) throw new Error('This student is not available to message, or the message is invalid.');
        data.messages.push({ id: Date.now() + Math.floor(Math.random() * 1000), senderId: user.id, recipientId: peerId, message, createdAt: Date.now() });
        writeLocalData(data);
        return { ok: true };
    }
    throw new Error('Peer2Peer local storage request was not recognized.');
}
function showError(error) {
    alert(error?.message || 'Something went wrong. Please try again.');
}

function updateHeaderUI() {
    const navActions = document.querySelector('.nav-actions');
    if (!navActions) return;

    chatLauncher?.classList.toggle('is-hidden', !currentUser);
    navActions.innerHTML = currentUser
        ? '<button class="nav-login" onclick="showDashboard()">Dashboard</button><button class="logout-btn" onclick="handleLogout()">Sign Out</button>'
        : '<button class="nav-login" onclick="showAuth(\'login\')">Sign In</button><button class="nav-cta" onclick="showAuth(\'register\')">Get Started</button>';
    updateThemeToggle();
}

function updateThemeToggle() {
    const dark = document.documentElement.dataset.theme === 'dark';
    document.querySelectorAll('.theme-toggle').forEach(button => {
        button.textContent = dark ? 'Light mode' : 'Dark mode';
        button.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
        button.setAttribute('aria-pressed', String(dark));
    });
}

function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('p2p_theme', theme);
    updateThemeToggle();
}

function toggleDarkMode() {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}

function showHome() {
    closeChatWidget();
    homePage.style.display = 'block';
    authPage.style.display = 'none';
    dashboardPage.style.display = 'none';
    updateHeaderUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function navigateToSection(sectionId) {
    if (homePage.style.display === 'none') showHome();
    window.setTimeout(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' }), 50);
}

function showAuth(mode = 'login') {
    currentAuthMode = mode;
    homePage.style.display = 'none';
    authPage.style.display = 'block';
    dashboardPage.style.display = 'none';
    switchAuthMode(mode);
    updateHeaderUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchAuthMode(mode) {
    currentAuthMode = mode;
    const registering = mode === 'register';
    document.getElementById('tabLoginBtn').classList.toggle('active', !registering);
    document.getElementById('tabRegisterBtn').classList.toggle('active', registering);
    document.getElementById('authSubmitBtn').textContent = registering ? 'Create Peer2Peer Account' : 'Access Dashboard';
    document.getElementById('authTitle').textContent = registering ? 'Join Peer2Peer' : 'Welcome back';
    document.getElementById('authSubtitle').textContent = registering
        ? 'Create an account and start finding your peers.'
        : 'Sign in to access your peer network.';
    document.querySelectorAll('.signup-only').forEach(field => field.classList.toggle('is-hidden', !registering));
    document.getElementById('authAsMentor').checked = false;
    document.getElementById('mentorCoursesBlock').classList.add('is-hidden');
    document.getElementById('mentorCourseRows').replaceChildren();
    document.getElementById('authNim').required = registering;

    const card = document.querySelector('.auth-card');
    if (card) {
        card.classList.remove('mode-switch');
        void card.offsetWidth;
        card.classList.add('mode-switch');
    }
}

async function showDashboard() {
    try {
        if (!currentUser) currentUser = (await api('auth/me')).user;
        homePage.style.display = 'none';
        authPage.style.display = 'none';
        dashboardPage.style.display = 'block';
        updateHeaderUI();
        populateProfile(currentUser);
        renderAssignedMentor();
        updateMatrixUI();
        await refreshStudents();
        await refreshDailyUpdates();
        await renderAdminPanel();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        currentUser = null;
        showHome();
        showError(error);
    }
}

function populateProfile(user) {
    if (user?.hasProfile && user.profile) {
        const profile = user.profile;
        document.getElementById('userGreetingName').textContent = profile.name;
        document.getElementById('profName').value = profile.name || '';
        document.getElementById('profMajor').value = profile.major || '';
        const profileCategory = document.getElementById('profCourseCategory');
        profileCategory.value = categoryForCourse(profile.subject || '');
        document.getElementById('profSubject').disabled = false;
        populateCourseDatalist(profileCategory.value, 'profileCourseOptions');
        document.getElementById('profSubject').value = profile.subject || 'Java Programming';
        document.getElementById('profSkill').value = profile.skillHave || '';
        document.getElementById('profStudyMode').value = profile.studyMode || 'Online';
        document.getElementById('profRoomLink').value = profile.roomLink || '';
        document.getElementById('profLocation').value = profile.location || '';
        document.getElementById('profBio').value = profile.bio || '';
        profileSelectedSchedule = Array.isArray(profile.schedule) ? [...profile.schedule] : [];
    } else {
        document.getElementById('userGreetingName').textContent = 'New Peer';
        profileForm.reset();
        document.getElementById('profSubject').disabled = true;
        populateCourseDatalist('', 'profileCourseOptions');
        profileSelectedSchedule = [];
    }
    toggleModeFields();
}

async function handleLogout() {
    try { await api('auth/logout', { method: 'POST' }); } catch {  }
    currentUser = null;
    closeChatWidget();
    showHome();
}

function toggleModeFields() {
    const mode = document.getElementById('profStudyMode').value;
    document.getElementById('onlineFieldBlock').style.display = mode === 'Online' ? 'block' : 'none';
    document.getElementById('onsiteFieldBlock').style.display = mode === 'Onsite' ? 'block' : 'none';
}

function updateMatrixUI() {
    document.querySelectorAll('.matrix-cell').forEach(cell => {
        const key = `${cell.dataset.day}-${cell.dataset.slot}`;
        cell.classList.toggle('selected', profileSelectedSchedule.includes(key));
    });
}

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function addMentorCourseRow(course = '', grade = '') {
    const row = document.createElement('div');
    row.className = 'mentor-course-row';
    const listId = `mentorCourseOptions${++mentorCourseRowSequence}`;
    row.innerHTML = `<label class="mentor-course-field">Category<select class="form-control mentor-course-category course-category" aria-label="Course category" required></select></label><label class="mentor-course-field">Course<input class="form-control mentor-course" list="${listId}" aria-label="Specialization course" placeholder="Select category first" required disabled></label><div class="mentor-course-footer"><label class="mentor-course-field">Grade<select class="form-control mentor-grade" aria-label="Grade in course" required><option value="">Your grade</option><option>A</option><option>A-</option><option>B+</option><option>B</option><option>B-</option><option>C+</option><option>C</option></select></label><button type="button" class="remove-course-btn" aria-label="Remove specialization">Remove course</button></div><datalist id="${listId}"></datalist>`;
    document.getElementById('mentorCourseRows').append(row);
    const category = row.querySelector('.mentor-course-category');
    const courseInput = row.querySelector('.mentor-course');
    setCourseCategoryOptions(category);
    category.value = course ? categoryForCourse(course) : '';
    courseInput.disabled = !category.value;
    populateCourseDatalist(category.value, listId);
    category.addEventListener('change', () => {
        courseInput.value = '';
        courseInput.disabled = !category.value;
        courseInput.placeholder = category.value ? 'Search or type course' : 'Select category first';
        populateCourseDatalist(category.value, listId);
    });
    courseInput.value = course;
    row.querySelector('.mentor-grade').value = grade;
    row.querySelector('.remove-course-btn').addEventListener('click', () => row.remove());
}

async function refreshDailyUpdates() {
    const feed = document.getElementById('dailyUpdatesFeed');
    if (!feed || !currentUser) return;
    const { updates } = await api('daily-updates');
    feed.replaceChildren();
    if (!updates.length) {
        const empty = document.createElement('p');
        empty.className = 'field-hint';
        empty.textContent = currentUser.isMentor ? 'Updates from students assigned to you will appear here.' : 'Your updates will appear here and be visible to your assigned mentor.';
        feed.append(empty);
        return;
    }
    updates.forEach(update => {
        const card = document.createElement('article');
        card.className = 'daily-update-card';
        const title = document.createElement('strong');
        title.textContent = update.userId === currentUser.id ? 'Your update' : update.studentName;
        const date = document.createElement('time');
        date.dateTime = new Date(update.createdAt).toISOString();
        date.textContent = new Date(update.createdAt).toLocaleString();
        const body = document.createElement('p');
        body.textContent = update.text;
        card.append(title, date, body);
        if (update.image) {
            const img = document.createElement('img');
            img.src = update.image;
            img.alt = `Photo attached to ${update.studentName}'s college update`;
            card.append(img);
        }
        feed.append(card);
    });
}

async function resizeUpdateImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.78);
}

function safeHttpUrl(value) {
    try {
        const url = new URL(value);
        return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
}

async function refreshStudents() {
    const { users } = await api('students');
    renderBuddies(users);
}

function calculateMetrics(current, other) {
    if (!current?.hasProfile || !other?.hasProfile) return { score: 0, overlaps: [] };
    const a = current.profile;
    const b = other.profile;
    let score = 10;
    if (a.subject === b.subject) score += 30;
    if ((a.major || '').trim().toLowerCase() === (b.major || '').trim().toLowerCase()) score += 20;
    if (a.studyMode === b.studyMode) score += 20;
    const overlaps = (a.schedule || []).filter(slot => (b.schedule || []).includes(slot));
    if ((a.schedule || []).length && (b.schedule || []).length) score += Math.min(overlaps.length * 10, 20);
    return { score: Math.min(score, 100), overlaps };
}

function renderBuddies(users) {
    buddyList.replaceChildren();
    const subject = filterSubject.value.trim();
    const category = document.getElementById('filterCourseCategory').value;
    let students = users.filter(user => {
        const course = user.profile?.subject || '';
        return (!subject || subject === 'All' || course.toLocaleLowerCase() === subject.toLocaleLowerCase())
            && (!category || categoryForCourse(course) === category);
    });
    students = students.map(user => ({ ...user, ...calculateMetrics(currentUser, user) }));
    if (currentUser?.hasProfile) students.sort((a, b) => b.score - a.score);

    if (!students.length) {
        buddyList.innerHTML = '<div class="empty-state"><div class="empty-icon">&#x25CE;</div><h3>No study friends yet</h3><p>Students who complete a profile will appear here. Your BINUS-assigned mentor is shown separately above.</p></div>';
        return;
    }

    students.forEach((peer, index) => {
        const profile = peer.profile || {};
        const online = profile.studyMode !== 'Onsite';
        const roomLink = safeHttpUrl(profile.roomLink || '');
        const schedule = (profile.schedule || []).map(slot =>
            `<span class="sched-tag ${peer.overlaps.includes(slot) ? 'overlap' : ''}">${escapeHTML(slot.replace('-', ' '))}</span>`
        ).join('');
        const card = document.createElement('div');
        card.className = 'buddy-card';
        card.innerHTML = `
            <div class="buddy-profile-block">
                <div class="avatar-placeholder">${escapeHTML((profile.name || 'S').charAt(0).toUpperCase())}</div>
                <div class="buddy-info">
                    <div class="buddy-title-row">
                        <h3>${escapeHTML(profile.name)}</h3>
                        <span class="mode-tag ${online ? 'online' : 'onsite'}">${escapeHTML(profile.studyMode)}</span>
                        <span class="match-badge">${peer.score}% Match</span>
                    </div>
                    ${index === 0 && currentUser?.hasProfile ? '<span class="top-match-label">Top study friend match</span>' : ''}
                    ${peer.isMentor ? `<span class="student-mentor-badge">Student mentor</span>${peer.mentorCourses?.length ? `<div class="skill-label">Mentors: <strong>${peer.mentorCourses.map(item => `${escapeHTML(item.course)} (Grade ${escapeHTML(item.grade)})`).join(', ')}</strong></div>` : ''}` : ''}
                    <div class="buddy-meta-details"><span class="buddy-major">${escapeHTML(profile.major)}</span><span class="meta-divider"></span><span class="tag">${escapeHTML(profile.subject)}</span></div>
                    <div class="skill-label">Expertise <strong>${escapeHTML(profile.skillHave)}</strong></div>
                    ${schedule ? `<div class="card-schedule-info"><strong>Availability</strong><div class="schedule-tag-container">${schedule}</div></div>` : ''}
                    <p class="buddy-bio">"${escapeHTML(profile.bio)}"</p>
                </div>
            </div>
            <div class="action-block">
                ${online ? (roomLink ? `<a href="${escapeHTML(roomLink)}" target="_blank" rel="noopener noreferrer" class="room-btn">Launch Space &rarr;</a>` : '<div class="location-display-box">No room link provided</div>') : `<div class="location-display-box"><strong>Campus</strong><br>${escapeHTML(profile.location || 'Campus')}</div>`}
                <button class="chat-btn" type="button">Message Study Friend</button>
            </div>`;
        card.querySelector('.chat-btn').addEventListener('click', () => openChatWidget(peer.id, profile.name || 'Study friend'));
        buddyList.append(card);
    });
}

function renderAssignedMentor() {
    const panel = document.getElementById('assignedMentorPanel');
    const content = document.getElementById('assignedMentorContent');
    const status = document.getElementById('assignedMentorStatus');
    const mentor = currentUser?.assignedMentor;
    content.replaceChildren();

    if (!mentor) {
        status.textContent = 'Not assigned yet';
        content.textContent = 'Your mentor will appear here after BINUS records an assignment to your account.';
        return;
    }

    status.textContent = 'Assigned by BINUS';
    const identity = document.createElement('div');
    identity.className = 'assigned-mentor-identity';
    const name = document.createElement('strong');
    name.textContent = mentor.profile?.name || 'Student mentor';
    const detail = document.createElement('span');
    detail.textContent = `NIM: ${mentor.nim || 'Not provided'}${mentor.profile?.major ? ` - ${mentor.profile.major}` : ''}`;
    identity.append(name, detail);
    content.append(identity);
    if (mentor.mentorCourses?.length) {
        const courses = document.createElement('p');
        courses.className = 'field-hint';
        courses.textContent = `Mentoring: ${mentor.mentorCourses.map(item => `${item.course} (Grade ${item.grade})`).join(', ')}`;
        content.append(courses);
    }
    if (mentor.profile?.bio) {
        const bio = document.createElement('p');
        bio.textContent = mentor.profile.bio;
        content.append(bio);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-btn';
    button.textContent = 'Message your mentor';
    button.addEventListener('click', () => openChatWidget(mentor.id, mentor.profile?.name || 'Student mentor'));
    content.append(button);
}

function fillAccountSelect(select, users, placeholder) {
    select.replaceChildren();
    const first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    first.disabled = true;
    first.selected = true;
    select.append(first);
    users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = `${user.profile?.name || 'Profile not completed'} - ${user.nim || 'NIM missing'} - ${user.email}`;
        select.append(option);
    });
    select.disabled = users.length === 0;
}

async function renderAdminPanel() {
    const panel = document.getElementById('adminPanel');
    panel.classList.toggle('is-hidden', !currentUser?.isAdmin);
    if (!currentUser?.isAdmin) return;

    try {
        const { users } = await api('admin/users');
        const studentSelect = document.getElementById('assignmentStudentSelect');
        const mentorSelect = document.getElementById('assignmentMentorSelect');
        const designationSelect = document.getElementById('mentorCandidateSelect');
        const mentors = users.filter(user => user.isMentor);
        fillAccountSelect(studentSelect, users, users.length ? 'Choose a student' : 'No student accounts yet');
        fillAccountSelect(mentorSelect, mentors, mentors.length ? 'Choose a student mentor' : 'Designate a student mentor first');
        fillAccountSelect(designationSelect, users, users.length ? 'Choose a student account' : 'No student accounts yet');
        const syncButton = () => {
            const target = users.find(user => String(user.id) === designationSelect.value);
            const button = document.querySelector('#mentorDesignationForm button[type="submit"]');
            if (button) button.textContent = target?.isMentor ? 'Remove mentor status' : 'Add as student mentor';
        };
        designationSelect.onchange = syncButton;
        syncButton();
    } catch (error) {
        const status = document.getElementById('adminStatus');
        status.textContent = error.message;
    }
}

async function openChatWidget(peerId, peerName) {
    activeChatPeerId = Number(peerId);
    chatWidgetTargetName.textContent = peerName;
    chatBackButton.classList.remove('is-hidden');
    chatWidgetForm.hidden = false;
    chatWidget.style.display = 'flex';
    await loadChatMessages();
}

function closeChatWidget() {
    activeChatPeerId = null;
    chatWidget.style.display = 'none';
}

function toggleChatInbox() {
    if (chatWidget.style.display === 'flex') closeChatWidget();
    else showChatInbox();
}

async function showChatInbox() {
    if (!currentUser) return;
    activeChatPeerId = null;
    chatWidgetTargetName.textContent = 'Your conversations';
    chatBackButton.classList.add('is-hidden');
    chatWidgetForm.hidden = true;
    chatWidget.style.display = 'flex';
    await renderChatInbox();
}

async function renderChatInbox() {
    chatWidgetBody.replaceChildren();
    try {
        const { contacts } = await api('chat/contacts');
        if (!contacts.length) {
            const empty = document.createElement('div');
            empty.className = 'chat-empty';
            empty.textContent = 'Complete a student profile or wait for your mentor assignment to start a conversation.';
            chatWidgetBody.append(empty);
            return;
        }
        contacts.forEach(contact => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'chat-contact';
            const name = document.createElement('strong');
            name.textContent = contact.profile?.name || (contact.isMentor ? 'Student mentor' : 'Student');
            const preview = document.createElement('span');
            preview.textContent = contact.recentMessage || (contact.isMentor ? 'BINUS student mentor' : 'Start a conversation');
            button.append(name, preview);
            button.addEventListener('click', () => openChatWidget(contact.id, name.textContent));
            chatWidgetBody.append(button);
        });
    } catch (error) {
        const empty = document.createElement('div');
        empty.className = 'chat-empty';
        empty.textContent = error.message;
        chatWidgetBody.append(empty);
    }
}

async function loadChatMessages() {
    if (!currentUser || !activeChatPeerId) return;
    chatWidgetBody.replaceChildren();
    try {
        const { messages } = await api(`chat/messages?peerId=${encodeURIComponent(activeChatPeerId)}`);
        if (!messages.length) {
            const empty = document.createElement('div');
            empty.className = 'chat-empty';
            empty.textContent = 'Start the conversation with your peer.';
            chatWidgetBody.append(empty);
        }
        messages.forEach(message => {
            const bubble = document.createElement('div');
            bubble.className = `chat-bubble ${message.senderId === currentUser.id ? 'sent' : 'received'}`;
            bubble.textContent = message.text;
            chatWidgetBody.append(bubble);
        });
        chatWidgetBody.scrollTop = chatWidgetBody.scrollHeight;
    } catch (error) {
        const empty = document.createElement('div');
        empty.className = 'chat-empty';
        empty.textContent = error.message;
        chatWidgetBody.append(empty);
    }
}

async function showSupportForm() {
    const email = document.getElementById('supportEmail');
    if (email && currentUser?.email) email.value = currentUser.email;
    document.getElementById('supportStatus').textContent = '';
    document.getElementById('supportDialog')?.showModal();
}

function closeSupportForm() {
    document.getElementById('supportDialog')?.close();
}

authForm.addEventListener('submit', async event => {
    event.preventDefault();
    const email = document.getElementById('authEmail').value.trim().toLowerCase();
    const password = document.getElementById('authPassword').value;
    const payload = { email, password };
    if (currentAuthMode === 'register') {
        payload.nim = document.getElementById('authNim').value.trim();
        payload.isMentor = document.getElementById('authAsMentor').checked;
        payload.mentorCourses = [...document.querySelectorAll('.mentor-course-row')].map(row => ({
            course: row.querySelector('.mentor-course').value,
            grade: row.querySelector('.mentor-grade').value
        }));
    }

    try {
        const { user } = await api(`auth/${currentAuthMode === 'register' ? 'register' : 'login'}`, {
            method: 'POST', body: JSON.stringify(payload)
        });
        currentUser = user;
        await showDashboard();
    } catch (error) {
        showError(error);
    }
});

document.getElementById('authAsMentor').addEventListener('change', event => {
    const block = document.getElementById('mentorCoursesBlock');
    block.classList.toggle('is-hidden', !event.target.checked);
    if (event.target.checked && !document.querySelector('.mentor-course-row')) addMentorCourseRow();
});
document.getElementById('addMentorCourse').addEventListener('click', () => addMentorCourseRow());

document.getElementById('dailyUpdateForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        const file = document.getElementById('dailyUpdateImage').files[0];
        const image = file ? await resizeUpdateImage(file) : '';
        await api('daily-updates', { method: 'POST', body: JSON.stringify({ text: document.getElementById('dailyUpdateText').value, image }) });
        event.currentTarget.reset();
        await refreshDailyUpdates();
        alert('Your college update has been shared with your assigned mentor.');
    } catch (error) { showError(error); }
    finally { button.disabled = false; }
});

profileForm.addEventListener('submit', async event => {
    event.preventDefault();
    const studyMode = document.getElementById('profStudyMode').value;
    const profile = {
        name: document.getElementById('profName').value.trim(),
        major: document.getElementById('profMajor').value.trim(),
        subject: document.getElementById('profSubject').value,
        skillHave: document.getElementById('profSkill').value.trim(),
        studyMode,
        roomLink: studyMode === 'Online' ? document.getElementById('profRoomLink').value.trim() : '',
        location: studyMode === 'Onsite' ? document.getElementById('profLocation').value.trim() : '',
        bio: document.getElementById('profBio').value.trim(),
        schedule: [...profileSelectedSchedule]
    };
    try {
        currentUser = (await api('profile', { method: 'PUT', body: JSON.stringify({ profile }) })).user;
        document.getElementById('userGreetingName').textContent = profile.name;
        await refreshStudents();
        alert('Your Peer2Peer profile has been updated.');
    } catch (error) {
        showError(error);
    }
});

document.getElementById('mentorDesignationForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const select = document.getElementById('mentorCandidateSelect');
    const target = select.value;
    const { users } = await api('admin/users').catch(error => { showError(error); return { users: [] }; });
    const account = users.find(user => String(user.id) === target);
    if (!account) return;
    const status = document.getElementById('adminStatus');
    try {
        await api('admin/mentors', {
            method: 'POST',
            body: JSON.stringify({ userId: Number(target), isMentor: !account.isMentor })
        });
        status.textContent = account.isMentor
            ? `${account.profile?.name || account.email} was removed from the student mentor list.`
            : `${account.profile?.name || account.email} is now a student mentor.`;
        await renderAdminPanel();
        await refreshStudents();
    } catch (error) {
        status.textContent = error.message;
    }
});

document.getElementById('mentorAssignmentForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const studentId = Number(document.getElementById('assignmentStudentSelect').value);
    const mentorId = Number(document.getElementById('assignmentMentorSelect').value);
    const status = document.getElementById('adminStatus');
    try {
        await api('admin/assignments', { method: 'POST', body: JSON.stringify({ studentId, mentorId }) });
        status.textContent = 'Mentor assignment saved.';
        await renderAdminPanel();
        if (studentId === currentUser?.id) {
            currentUser = (await api('auth/me')).user;
            renderAssignedMentor();
        }
        await renderChatInboxIfOpen();
    } catch (error) {
        status.textContent = error.message;
    }
});

async function renderChatInboxIfOpen() {
    if (chatWidget.style.display === 'flex' && !activeChatPeerId) await renderChatInbox();
}

document.getElementById('profStudyMode').addEventListener('change', toggleModeFields);
document.querySelectorAll('.matrix-cell').forEach(cell => {
    cell.addEventListener('click', () => {
        const key = `${cell.dataset.day}-${cell.dataset.slot}`;
        profileSelectedSchedule = profileSelectedSchedule.includes(key)
            ? profileSelectedSchedule.filter(item => item !== key)
            : [...profileSelectedSchedule, key];
        updateMatrixUI();
    });
});

filterSubject.addEventListener('change', () => refreshStudents().catch(showError));
chatWidgetForm.addEventListener('submit', async event => {
    event.preventDefault();
    const message = chatWidgetInput.value.trim();
    if (!message || !activeChatPeerId) return;
    try {
        await api('chat/messages', {
            method: 'POST', body: JSON.stringify({ peerId: activeChatPeerId, message })
        });
        chatWidgetInput.value = '';
        await loadChatMessages();
    } catch (error) { showError(error); }
});

document.getElementById('supportForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const subject = `[Peer2Peer Support] ${formData.get('topic')}`;
    const body = [`Reply to: ${formData.get('email')}`, '', formData.get('message')].join('\n');
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    document.getElementById('supportStatus').textContent = 'Your email app should open with your message ready to send.';
});

async function boot() {
    setTheme(localStorage.getItem('p2p_theme') === 'dark' ? 'dark' : 'light');
    try {
        currentUser = (await api('auth/me')).user;
        await showDashboard();
    } catch {
        currentUser = null;
        showHome();
    }
}

boot();
