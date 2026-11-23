let currentAuthMode = 'login';
let currentUser = null;
let profileSelectedSchedule = [];
let activeChatPeerId = null;

/* ===== OAuth configuration =====
   Replace these placeholders with your real client IDs.
   - Google: Google Cloud Console > APIs & Services > Credentials > OAuth client ID (Web).
     Add your origin (e.g. http://localhost:8000 and your Vercel URL) to "Authorized JavaScript origins".
   - Microsoft: Azure Portal > App registrations > your app > Application (client) ID.
     Add the same origins as SPA redirect URIs.
   OAuth only works over http://localhost or HTTPS, not when opening the file directly. */
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const MICROSOFT_CLIENT_ID = 'YOUR_MICROSOFT_CLIENT_ID';

const SUPPORT_EMAIL = 'yusuf.daniel@binus.ac.id';
const homePage = document.getElementById('homePage');
const authPage = document.getElementById('authPage');
const profilePage = document.getElementById('profilePage');
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
            dailyUpdates: Array.isArray(data.dailyUpdates) ? data.dailyUpdates : [],
            mentorRequests: Array.isArray(data.mentorRequests) ? data.mentorRequests : []
        };
    } catch {
        return { users: [], assignments: [], messages: [], dailyUpdates: [], mentorRequests: [] };
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
        plan: user.plan === 'premium' ? 'premium' : 'free',
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

function localRequirePremium(data) {
    const user = localRequireUser(data);
    if (user.plan !== 'premium') throw new Error('This is a Premium feature. Upgrade to request a specific mentor.');
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
    if (url.pathname === '/api/account/plan' && method === 'POST') {
        const user = localRequireUser(data);
        const plan = body.plan === 'premium' ? 'premium' : 'free';
        user.plan = plan;
        writeLocalData(data);
        return { user: localPublicUser(user, data) };
    }
    if (url.pathname === '/api/auth/register' && method === 'POST') {
        const email = String(body.email || '').trim().toLowerCase();
        const nim = String(body.nim || '').trim().toUpperCase();
        const password = String(body.password || '');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || nim.length < 3 || nim.length > 32) throw new Error('Enter a valid email and BINUS NIM.');
        if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) throw new Error('Password must be at least 8 characters and include an uppercase letter and a number.');
        if (data.users.some(user => user.email === email || user.nim === nim)) throw new Error('That email or NIM is already registered.');
        const passwordData = await hashLocalPassword(password);
        const user = {
            id: Date.now() + Math.floor(Math.random() * 1000), email, nim,
            passwordSalt: passwordData.salt, passwordHash: passwordData.hash,
            isMentor: false, mentorCourses: [],
            isAdmin: email === LOCAL_ADMIN_EMAIL, plan: 'free',
            hasProfile: false, profile: null
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
    if (url.pathname === '/api/auth/oauth' && method === 'POST') {
        const email = String(body.email || '').trim().toLowerCase();
        const provider = String(body.provider || 'oauth');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('The provider did not return a valid email.');
        let user = data.users.find(item => item.email === email);
        if (!user) {
            user = {
                id: Date.now() + Math.floor(Math.random() * 1000), email,
                nim: '', passwordSalt: null, passwordHash: null,
                isMentor: false, mentorCourses: [],
                isAdmin: email === LOCAL_ADMIN_EMAIL, plan: 'free',
                provider, hasProfile: false, profile: null
            };
            data.users.push(user);
            writeLocalData(data);
        }
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
    if (url.pathname === '/api/mentors' && method === 'GET') {
        const user = localRequirePremium(data);
        const subject = String(url.searchParams.get('subject') || '').trim().toLowerCase();
        const category = String(url.searchParams.get('category') || '').trim();
        const mentors = data.users
            .filter(item => item.isMentor && item.id !== user.id && Array.isArray(item.mentorCourses) && item.mentorCourses.length)
            .filter(item => {
                if (!subject && !category) return true;
                return item.mentorCourses.some(entry => {
                    const course = String(entry.course || '');
                    const matchSubject = !subject || course.toLowerCase().includes(subject);
                    const matchCategory = !category || categoryForCourse(course) === category;
                    return matchSubject && matchCategory;
                });
            })
            .map(item => ({
                id: item.id,
                name: item.profile?.name || 'Student mentor',
                nim: item.nim || '',
                major: item.profile?.major || '',
                mentorCourses: item.mentorCourses,
                alreadyRequested: data.mentorRequests.some(request => request.studentId === user.id && request.mentorId === item.id && request.status === 'pending'),
                isAssigned: data.assignments.some(assignment => assignment.studentId === user.id && assignment.mentorId === item.id)
            }));
        return { mentors };
    }
    if (url.pathname === '/api/mentor-requests' && method === 'GET') {
        const user = localRequireUser(data);
        const requests = data.mentorRequests
            .filter(request => request.studentId === user.id)
            .sort((a, b) => b.createdAt - a.createdAt)
            .map(request => ({
                ...request,
                mentorName: data.users.find(item => item.id === request.mentorId)?.profile?.name || 'Student mentor'
            }));
        return { requests };
    }
    if (url.pathname === '/api/mentor-requests' && method === 'POST') {
        const user = localRequirePremium(data);
        const mentorId = Number(body.mentorId);
        const subject = String(body.subject || '').trim();
        const mentor = data.users.find(item => item.id === mentorId && item.isMentor);
        if (!mentor) throw new Error('Choose a valid student mentor.');
        if (!subject) throw new Error('Tell us which subject you want to learn.');
        if (data.mentorRequests.some(request => request.studentId === user.id && request.mentorId === mentorId && request.status === 'pending')) {
            throw new Error('You already have a pending request for this mentor.');
        }
        data.mentorRequests.push({
            id: Date.now() + Math.floor(Math.random() * 1000),
            studentId: user.id, mentorId, subject, status: 'pending', createdAt: Date.now()
        });
        writeLocalData(data);
        return { ok: true };
    }
    if (url.pathname === '/api/mentor-requests/cancel' && method === 'POST') {
        const user = localRequireUser(data);
        const requestId = Number(body.requestId);
        const index = data.mentorRequests.findIndex(request => request.id === requestId && request.studentId === user.id);
        if (index >= 0) {
            data.mentorRequests.splice(index, 1);
            writeLocalData(data);
        }
        return { ok: true };
    }
    if (url.pathname === '/api/admin/users' && method === 'GET') {
        localRequireAdmin(data);
        return { users: data.users.filter(user => !user.isAdmin).map(user => ({
            ...profileUser(user),
            assignedMentorId: data.assignments.find(item => item.studentId === user.id)?.mentorId || null,
            pendingRequests: data.mentorRequests
                .filter(request => request.studentId === user.id && request.status === 'pending')
                .map(request => ({ mentorId: request.mentorId, subject: request.subject }))
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
            data.mentorRequests
                .filter(request => request.studentId === studentId && request.mentorId === mentorId && request.status === 'pending')
                .forEach(request => { request.status = 'accepted'; });
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
        ? '<button class="nav-login" onclick="showDashboard()">Dashboard</button><button class="nav-login" onclick="showProfile()">My Profile</button><button class="logout-btn" onclick="handleLogout()">Sign Out</button>'
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
    profilePage.style.display = 'none';
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
    profilePage.style.display = 'none';
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
    document.getElementById('authNim').required = registering;
    const hint = document.getElementById('socialHint');
    if (hint) hint.textContent = '';

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
        profilePage.style.display = 'none';
        dashboardPage.style.display = 'block';
        updateHeaderUI();
        updatePlanBadges();
        populateProfile(currentUser);
        renderAssignedMentor();
        updateMatrixUI();
        await refreshStudents();
        await refreshDailyUpdates();
        await renderMentorRequestPanel();
        await renderAdminPanel();
        maybeShowPipToast();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        currentUser = null;
        showHome();
        showError(error);
    }
}

async function showProfile() {
    try {
        if (!currentUser) currentUser = (await api('auth/me')).user;
        homePage.style.display = 'none';
        authPage.style.display = 'none';
        dashboardPage.style.display = 'none';
        profilePage.style.display = 'block';
        updateHeaderUI();
        updatePlanBadges();
        populateProfile(currentUser);
        updateMatrixUI();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        currentUser = null;
        showHome();
        showError(error);
    }
}

function updatePlanBadges() {
    const premium = currentUser?.plan === 'premium';
    const dash = document.getElementById('dashboardPlanBadge');
    if (dash) {
        dash.textContent = premium ? 'Premium plan' : 'Free plan';
        dash.classList.toggle('premium', premium);
    }
    const prof = document.getElementById('profilePlanBadge');
    if (prof) {
        prof.textContent = premium ? 'PREMIUM PLAN' : 'FREE PLAN';
        prof.classList.toggle('premium', premium);
    }
    const prof2 = document.getElementById('profilePlanBadge2');
    if (prof2) {
        prof2.textContent = premium ? 'Premium plan' : 'Free plan';
        prof2.classList.toggle('premium', premium);
    }
    updateUpgradeButtons();
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

/* ===== Premium: request a specific mentor by subject ===== */
let mentorRequestInit = false;

function initMentorRequestPanel() {
    if (mentorRequestInit) return;
    mentorRequestInit = true;
    const category = document.getElementById('mentorRequestCategory');
    const subject = document.getElementById('mentorRequestSubject');
    if (!category || !subject) return;
    setCourseCategoryOptions(category, true);
    category.addEventListener('change', () => refreshMentorRequestList().catch(showError));
    let timer = null;
    subject.addEventListener('input', () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => refreshMentorRequestList().catch(showError), 250);
    });
}

async function renderMentorRequestPanel() {
    const panel = document.getElementById('mentorRequestPanel');
    if (!panel) return;
    const locked = document.getElementById('mentorRequestLocked');
    const tools = document.getElementById('mentorRequestTools');
    const premium = isPremium();
    locked.classList.toggle('is-hidden', premium);
    tools.classList.toggle('is-hidden', !premium);
    if (!premium) return;
    initMentorRequestPanel();
    await refreshMentorRequestList();
    await refreshMentorRequestStatus();
}

async function refreshMentorRequestList() {
    const list = document.getElementById('mentorRequestList');
    if (!list) return;
    const category = document.getElementById('mentorRequestCategory').value;
    const subject = document.getElementById('mentorRequestSubject').value.trim();
    list.replaceChildren();
    try {
        const params = new URLSearchParams();
        if (category) params.set('category', category);
        if (subject) params.set('subject', subject);
        const { mentors } = await api(`mentors?${params.toString()}`);
        if (!mentors.length) {
            const empty = document.createElement('p');
            empty.className = 'field-hint';
            empty.textContent = 'No mentors match that subject yet. Try another category or clear the search.';
            list.append(empty);
            return;
        }
        mentors.forEach(mentor => {
            const card = document.createElement('div');
            card.className = 'mentor-request-card';
            const info = document.createElement('div');
            info.className = 'mentor-request-info';
            const name = document.createElement('strong');
            name.textContent = mentor.name;
            const meta = document.createElement('span');
            meta.textContent = `${mentor.major || 'BINUS student'}${mentor.nim ? ` · ${mentor.nim}` : ''}`;
            const courses = document.createElement('p');
            courses.className = 'mentor-request-courses';
            courses.textContent = 'Mentors: ' + mentor.mentorCourses.map(entry => `${entry.course} (Grade ${entry.grade})`).join(', ');
            info.append(name, meta, courses);

            const action = document.createElement('div');
            action.className = 'mentor-request-action';
            const select = document.createElement('select');
            select.className = 'form-control mentor-request-course-select';
            select.setAttribute('aria-label', `Subject to learn from ${mentor.name}`);
            mentor.mentorCourses.forEach(entry => {
                const option = document.createElement('option');
                option.value = entry.course;
                option.textContent = entry.course;
                select.append(option);
            });
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'mentor-request-btn';
            if (mentor.isAssigned) {
                button.textContent = 'Assigned';
                button.disabled = true;
            } else if (mentor.alreadyRequested) {
                button.textContent = 'Requested';
                button.disabled = true;
            } else {
                button.textContent = 'Request mentor';
                button.addEventListener('click', () => requestMentor(mentor.id, select.value, button));
            }
            action.append(select, button);
            card.append(info, action);
            list.append(card);
        });
    } catch (error) {
        const msg = document.createElement('p');
        msg.className = 'field-hint';
        msg.textContent = error.message;
        list.append(msg);
    }
}

async function requestMentor(mentorId, subject, button) {
    button.disabled = true;
    try {
        await api('mentor-requests', { method: 'POST', body: JSON.stringify({ mentorId, subject }) });
        button.textContent = 'Requested';
        notifyPip(`Request sent! BINUS will review your mentor request for ${subject}.`);
        await refreshMentorRequestStatus();
    } catch (error) {
        button.disabled = false;
        showError(error);
    }
}

async function refreshMentorRequestStatus() {
    const container = document.getElementById('mentorRequestStatus');
    if (!container) return;
    container.replaceChildren();
    try {
        const { requests } = await api('mentor-requests');
        if (!requests.length) {
            const empty = document.createElement('p');
            empty.className = 'field-hint';
            empty.textContent = 'You have not requested a mentor yet.';
            container.append(empty);
            return;
        }
        requests.forEach(request => {
            const row = document.createElement('div');
            row.className = 'mentor-request-row';
            const label = document.createElement('span');
            label.innerHTML = `<strong>${escapeHTML(request.mentorName)}</strong> — ${escapeHTML(request.subject)}`;
            const status = document.createElement('span');
            status.className = `request-status ${request.status}`;
            status.textContent = request.status === 'accepted' ? 'Accepted' : 'Pending';
            row.append(label, status);
            if (request.status === 'pending') {
                const cancel = document.createElement('button');
                cancel.type = 'button';
                cancel.className = 'request-cancel';
                cancel.textContent = 'Cancel';
                cancel.addEventListener('click', async () => {
                    try {
                        await api('mentor-requests/cancel', { method: 'POST', body: JSON.stringify({ requestId: request.id }) });
                        await refreshMentorRequestStatus();
                        await refreshMentorRequestList();
                    } catch (error) { showError(error); }
                });
                row.append(cancel);
            }
            container.append(row);
        });
    } catch (error) {
        const msg = document.createElement('p');
        msg.className = 'field-hint';
        msg.textContent = error.message;
        container.append(msg);
    }
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
    pipMode = false;
    setChatHeaderPip(false);
    activeChatPeerId = Number(peerId);
    chatWidgetTargetName.textContent = peerName;
    chatBackButton.classList.remove('is-hidden');
    chatWidgetForm.hidden = false;
    chatWidgetInput.placeholder = 'Write a message...';
    chatWidget.style.display = 'flex';
    await loadChatMessages();
}

function closeChatWidget() {
    activeChatPeerId = null;
    pipMode = false;
    setChatHeaderPip(false);
    chatWidget.style.display = 'none';
}

/* ===== Pip: the Shiba Inu icebreaker assistant ===== */
let pipMode = false;
let pipToastTimer = null;

const PIP_ICEBREAKERS = {
    'Computing / IT': [
        'What project or app first got you excited about coding?',
        'Which language do you reach for first, and why?',
        'Are you more of a frontend, backend, or "break everything" person?',
        'What is one bug that taught you a lot?'
    ],
    'Business': [
        'If you launched a startup tomorrow, what would it be?',
        'Which company do you think has the smartest strategy right now?',
        'Do you prefer marketing, finance, or operations?',
        'What is a business idea you wish existed?'
    ],
    'Design / Arts': [
        'Whose design work or art style inspires you most?',
        'Do you sketch on paper or go straight to digital?',
        'What is a color palette you keep coming back to?',
        'Which app has UI you genuinely love?'
    ],
    'Engineering': [
        'What is a structure or machine you find fascinating?',
        'Do you enjoy the theory or the hands-on build more?',
        'What is the trickiest problem set you have survived?',
        'Which engineering field would you switch into for a week?'
    ],
    'Humanities': [
        'What book or idea recently changed how you think?',
        'Which historical moment would you want to witness?',
        'Do you prefer writing essays or debating out loud?',
        'What topic could you talk about for an hour?'
    ],
    'Hospitality': [
        'What is the best meal or service experience you have had?',
        'Front office, kitchen, or events — where do you shine?',
        'What dish would you cook to impress someone?',
        'Which city has hospitality you admire?'
    ],
    'General / Other': [
        'What are you hoping to get out of a study partner?',
        'Morning study or late-night grind?',
        'What subject do you secretly enjoy the most?',
        'What is one goal you have this semester?'
    ]
};

function pipIcebreakersFor(subject) {
    const category = subject ? categoryForCourse(subject) : (currentUser?.profile?.subject ? categoryForCourse(currentUser.profile.subject) : 'General / Other');
    const bank = PIP_ICEBREAKERS[category] || PIP_ICEBREAKERS['General / Other'];
    return { category, questions: bank };
}

function pipPick(subject) {
    const { questions } = pipIcebreakersFor(subject);
    return questions[Math.floor(Math.random() * questions.length)];
}

function appendPipBubble(text, suggestions = []) {
    const row = document.createElement('div');
    row.className = 'pip-row';
    const avatar = document.createElement('img');
    avatar.src = 'pip.svg';
    avatar.alt = 'Pip';
    const column = document.createElement('div');
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble pip';
    bubble.textContent = text;
    column.append(bubble);
    if (suggestions.length) {
        const wrap = document.createElement('div');
        wrap.className = 'pip-suggestions';
        suggestions.forEach(question => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'pip-suggestion';
            chip.textContent = question;
            chip.addEventListener('click', () => usePipSuggestion(question));
            wrap.append(chip);
        });
        column.append(wrap);
    }
    row.append(avatar, column);
    chatWidgetBody.append(row);
    chatWidgetBody.scrollTop = chatWidgetBody.scrollHeight;
}

function usePipSuggestion(question) {
    if (pipMode) {
        appendUserBubble(question);
        window.setTimeout(() => {
            appendPipBubble('Great pick! Send that to a study friend to break the ice. Want another one?', [pipPick()]);
        }, 350);
        return;
    }
    // In a real conversation: drop the icebreaker into the message box, ready to send.
    chatWidgetInput.value = question;
    chatWidgetInput.focus();
}

function appendUserBubble(text) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble sent';
    bubble.textContent = text;
    chatWidgetBody.append(bubble);
    chatWidgetBody.scrollTop = chatWidgetBody.scrollHeight;
}

function setChatHeaderPip(on) {
    const pip = document.getElementById('chatHeaderPip');
    if (pip) pip.hidden = !on;
}

function openPipChat() {
    if (!currentUser) { showAuth('login'); return; }
    dismissPipToast();
    pipMode = true;
    activeChatPeerId = null;
    setChatHeaderPip(true);
    chatWidgetTargetName.textContent = 'Pip — icebreaker buddy';
    chatBackButton.classList.remove('is-hidden');
    chatWidgetForm.hidden = false;
    chatWidgetInput.placeholder = 'Ask Pip for an icebreaker...';
    chatWidget.style.display = 'flex';
    chatWidgetBody.replaceChildren();
    const { category, questions } = pipIcebreakersFor();
    const premiumNote = isPremium()
        ? ' You are Premium, so I can also summarize notes and make quizzes — type "summarize" or "quiz".'
        : '';
    appendPipBubble(`Woof! I'm Pip. I help you break the ice with study friends. Here are a few openers for ${category}. Tap one to copy it, or type "more" for others.${premiumNote}`, questions.slice(0, 3));
    appendPipStudyMenu();
}

function renderPipEmptyState() {
    chatWidgetBody.replaceChildren();
    const wrap = document.createElement('div');
    wrap.className = 'pip-empty';
    const img = document.createElement('img');
    img.src = 'pip.svg';
    img.alt = 'Pip';
    const title = document.createElement('strong');
    title.textContent = 'No messages yet';
    const text = document.createElement('p');
    text.textContent = 'Pip here! This chat is empty. Want an icebreaker to get it started?';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pip-empty-btn';
    button.textContent = 'Give me an icebreaker';
    button.addEventListener('click', () => {
        const subject = currentUser?.profile?.subject;
        appendPipBubble(pipPick(subject), [pipPick(subject), pipPick(subject)]);
    });
    wrap.append(img, title, text, button);
    chatWidgetBody.append(wrap);
}

/* Pip as a notification toast */
function notifyPip(text) {
    const toast = document.getElementById('pipToast');
    const body = document.getElementById('pipToastText');
    if (!toast || !body) return;
    body.textContent = text;
    toast.classList.remove('is-hidden');
    window.clearTimeout(pipToastTimer);
    pipToastTimer = window.setTimeout(dismissPipToast, 9000);
    toast.onclick = event => {
        if (event.target.closest('.pip-toast-close')) return;
        dismissPipToast();
        openPipChat();
    };
}

function dismissPipToast() {
    const toast = document.getElementById('pipToast');
    if (toast) toast.classList.add('is-hidden');
    window.clearTimeout(pipToastTimer);
}

function maybeShowPipToast() {
    if (!currentUser) return;
    const key = `p2p_pip_seen_${currentUser.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    window.setTimeout(() => {
        if (!currentUser.hasProfile) {
            notifyPip('Finish your profile and I can suggest icebreakers tuned to your course!');
        } else {
            notifyPip(`Hi ${currentUser.profile?.name?.split(' ')[0] || 'there'}! Need an icebreaker to message a study friend? Tap me.`);
        }
    }, 1500);
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
            renderPipEmptyState();
            return;
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

/* ===== Google / Microsoft OAuth (Option A, real client-side OAuth) ===== */
function setSocialHint(text) {
    const hint = document.getElementById('socialHint');
    if (hint) hint.textContent = text || '';
}

function decodeJwtPayload(token) {
    const part = token.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(json)));
}

async function finishOAuth(email, provider) {
    const { user } = await api('auth/oauth', { method: 'POST', body: JSON.stringify({ email, provider }) });
    currentUser = user;
    setSocialHint('');
    if (!user.hasProfile) {
        notifyPip(`Welcome, ${user.email.split('@')[0]}! Finish your profile so peers can find you.`);
        await showProfile();
    } else {
        await showDashboard();
    }
}

function signInWithGoogle() {
    if (GOOGLE_CLIENT_ID.startsWith('YOUR_')) {
        setSocialHint('Google sign-in needs a client ID. Add yours to GOOGLE_CLIENT_ID in script.js (see the comment there).');
        return;
    }
    if (!window.google?.accounts?.id) {
        setSocialHint('Google sign-in is still loading or blocked. Check your connection and that you are on http://localhost or HTTPS.');
        return;
    }
    window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async response => {
            try {
                const payload = decodeJwtPayload(response.credential);
                if (!payload.email_verified) throw new Error('Your Google email is not verified.');
                await finishOAuth(payload.email, 'google');
            } catch (error) { showError(error); }
        }
    });
    window.google.accounts.id.prompt(notification => {
        if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
            setSocialHint('Google did not show the sign-in prompt. Make sure this origin is an authorized JavaScript origin for your client ID.');
        }
    });
}

let msalInstance = null;
async function signInWithMicrosoft() {
    if (MICROSOFT_CLIENT_ID.startsWith('YOUR_')) {
        setSocialHint('Microsoft sign-in needs a client ID. Add yours to MICROSOFT_CLIENT_ID in script.js (see the comment there).');
        return;
    }
    if (!window.msal) {
        setSocialHint('Microsoft sign-in is still loading or blocked. Check your connection and that you are on http://localhost or HTTPS.');
        return;
    }
    try {
        if (!msalInstance) {
            msalInstance = new window.msal.PublicClientApplication({
                auth: { clientId: MICROSOFT_CLIENT_ID, authority: 'https://login.microsoftonline.com/common', redirectUri: window.location.origin },
                cache: { cacheLocation: 'sessionStorage' }
            });
            if (msalInstance.initialize) await msalInstance.initialize();
        }
        const result = await msalInstance.loginPopup({ scopes: ['openid', 'email', 'profile'] });
        const email = result.account?.username || result.idTokenClaims?.email || result.idTokenClaims?.preferred_username;
        if (!email) throw new Error('Microsoft did not return an email address.');
        await finishOAuth(email, 'microsoft');
    } catch (error) {
        setSocialHint(error.message || 'Microsoft sign-in was cancelled.');
    }
}

authForm.addEventListener('submit', async event => {
    event.preventDefault();
    const email = document.getElementById('authEmail').value.trim().toLowerCase();
    const password = document.getElementById('authPassword').value;
    const payload = { email, password };
    if (currentAuthMode === 'register') {
        payload.nim = document.getElementById('authNim').value.trim();
    }

    try {
        const { user } = await api(`auth/${currentAuthMode === 'register' ? 'register' : 'login'}`, {
            method: 'POST', body: JSON.stringify(payload)
        });
        currentUser = user;
        if (!user.hasProfile) {
            notifyPip('Nice to meet you! Complete your profile so peers can find you.');
            await showProfile();
        } else {
            await showDashboard();
        }
    } catch (error) {
        showError(error);
    }
});

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
    if (!message) return;

    if (pipMode) {
        appendUserBubble(message);
        chatWidgetInput.value = '';
        window.setTimeout(() => respondAsPip(message), 350);
        return;
    }

    if (!activeChatPeerId) return;
    try {
        await api('chat/messages', {
            method: 'POST', body: JSON.stringify({ peerId: activeChatPeerId, message })
        });
        chatWidgetInput.value = '';
        await loadChatMessages();
    } catch (error) { showError(error); }
});

function respondAsPip(message) {
    const text = message.toLowerCase();
    const subject = currentUser?.profile?.subject;
    if (/summari[sz]e|summary|quiz|test me|study|notes|material/.test(text)) {
        appendPipStudyMenu();
        return;
    }
    if (/premium|upgrade|subscription|plan/.test(text)) {
        if (isPremium()) {
            appendPipBubble('You are already Premium — paste your material below to summarize or quiz it.');
        } else {
            appendPipBubble('Premium unlocks my study tools (summaries and quizzes).');
        }
        appendPipStudyMenu();
        return;
    }
    if (/more|another|again|next|yes|yeah|sure|ok/.test(text)) {
        appendPipBubble('Here you go:', [pipPick(subject), pipPick(subject)]);
        return;
    }
    if (/thank|thanks|cool|nice|great/.test(text)) {
        appendPipBubble('Anytime! Go say hi to a study friend. Want one more opener?', [pipPick(subject)]);
        return;
    }
    if (/who|what are you|help|hi|hello|hey/.test(text)) {
        appendPipBubble("I'm Pip, your Shiba icebreaker buddy. I only hand out conversation starters so you can message peers with confidence. Try me:", [pipPick(subject), pipPick(subject)]);
        return;
    }
    // Default: treat their message as a topic and offer openers for it.
    const { category } = pipIcebreakersFor(message);
    appendPipBubble(`Good topic! Here are a couple of ${category} openers you could send:`, [pipPick(message), pipPick(message)]);
}

/* ============================================================
   PREMIUM PIP — on-device study tools (A1, no API, no key)
   Summarize pasted material + generate a quiz, all in-browser.
   ============================================================ */

const PIP_STOPWORDS = new Set(('a an the and or but if then else of to in on at by for with as is are was were be been being ' +
    'this that these those it its it\'s they them their there here we you your i me my he she his her from into over under ' +
    'can could should would will shall may might must do does did done have has had not no yes so such than too very ' +
    'about above after again against all am any because before below between both during each few more most other some ' +
    'only own same up down out off which who whom what when where why how also however thus hence therefore ').split(/\s+/));

function splitSentences(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
        ?.map(s => s.trim())
        .filter(s => s.split(/\s+/).length >= 4) || [];
}

function wordFrequencies(text) {
    const freq = {};
    (String(text).toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []).forEach(word => {
        if (PIP_STOPWORDS.has(word)) return;
        freq[word] = (freq[word] || 0) + 1;
    });
    return freq;
}

// Extractive summary: rank sentences by keyword weight + position, keep the top N in original order.
function summarizeText(text, maxSentences = 4) {
    const sentences = splitSentences(text);
    if (sentences.length <= maxSentences) return sentences;
    const freq = wordFrequencies(text);
    const max = Math.max(1, ...Object.values(freq));
    const scored = sentences.map((sentence, index) => {
        const words = sentence.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || [];
        let score = words.reduce((sum, word) => sum + (freq[word] || 0) / max, 0);
        score = score / Math.sqrt(words.length || 1);        // normalise for length
        if (index === 0) score *= 1.6;                        // intro sentences matter
        if (index === sentences.length - 1) score *= 1.15;    // conclusions matter
        return { sentence, index, score };
    });
    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, maxSentences)
        .sort((a, b) => a.index - b.index)
        .map(item => item.sentence);
}

function keyTermsFrom(text, count = 12) {
    const freq = wordFrequencies(text);
    return Object.entries(freq)
        .filter(([word, n]) => n >= 1 && word.length >= 4)
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(([word]) => word);
}

function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function titleCase(word) {
    return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

// Build a quiz from the text: fill-in-the-blank (multiple choice) + true/false.
function generateQuiz(text, maxQuestions = 5) {
    const sentences = splitSentences(text);
    const terms = keyTermsFrom(text, 16);
    if (sentences.length < 2 || terms.length < 4) return [];
    const questions = [];
    const usedTerms = new Set();

    // Fill-in-the-blank multiple-choice questions.
    for (const sentence of sentences) {
        if (questions.length >= maxQuestions - 1) break;
        const words = sentence.match(/[A-Za-z][A-Za-z'-]{3,}/g) || [];
        const answer = words.find(word => {
            const lower = word.toLowerCase();
            return terms.includes(lower) && !usedTerms.has(lower);
        });
        if (!answer) continue;
        usedTerms.add(answer.toLowerCase());
        const distractors = shuffle(terms.filter(term => term !== answer.toLowerCase()))
            .slice(0, 3)
            .map(titleCase);
        if (distractors.length < 3) continue;
        const options = shuffle([titleCase(answer), ...distractors]);
        const prompt = sentence.replace(new RegExp(`\\b${answer}\\b`), '_____');
        questions.push({ type: 'mcq', prompt, options, answer: titleCase(answer) });
    }

    // One true/false question (flip a key term for the "false" version).
    const base = sentences.find(s => (s.match(/[A-Za-z][A-Za-z'-]{3,}/g) || []).some(w => terms.includes(w.toLowerCase())));
    if (base && questions.length < maxQuestions) {
        const makeFalse = Math.random() < 0.5;
        let statement = base;
        if (makeFalse) {
            const words = base.match(/[A-Za-z][A-Za-z'-]{3,}/g) || [];
            const target = words.find(w => terms.includes(w.toLowerCase()));
            const swap = shuffle(terms.filter(t => t !== target?.toLowerCase()))[0];
            if (target && swap) statement = base.replace(new RegExp(`\\b${target}\\b`), titleCase(swap));
        }
        questions.push({ type: 'tf', prompt: statement, answer: makeFalse ? 'False' : 'True' });
    }

    return questions.slice(0, maxQuestions);
}

/* ---------- Premium gating + upgrade (demo) ---------- */

function isPremium() {
    return currentUser?.plan === 'premium';
}

async function togglePremium() {
    if (!currentUser) { showAuth('login'); return; }
    const next = isPremium() ? 'free' : 'premium';
    if (next === 'free' && !window.confirm('Switch back to the Free plan? You will lose access to Pip study tools.')) return;
    try {
        const { user } = await api('account/plan', { method: 'POST', body: JSON.stringify({ plan: next }) });
        currentUser = user;
        updatePlanBadges();
        updateUpgradeButtons();
        if (dashboardPage.style.display === 'block') await renderMentorRequestPanel();
        if (next === 'premium') notifyPip('You are Premium now! Request a mentor by subject, and ask Pip to summarize notes or make quizzes.');
    } catch (error) { showError(error); }
}

function updateUpgradeButtons() {
    document.querySelectorAll('.upgrade-btn').forEach(button => {
        button.textContent = isPremium() ? 'Switch to Free' : 'Upgrade to Premium';
        button.classList.toggle('is-premium', isPremium());
    });
}

/* ---------- Premium Pip chat: study tools ---------- */

function appendPipStudyMenu() {
    const row = document.createElement('div');
    row.className = 'pip-row';
    const avatar = document.createElement('img');
    avatar.src = 'pip.svg';
    avatar.alt = 'Pip';
    const column = document.createElement('div');
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble pip';

    if (isPremium()) {
        bubble.textContent = 'Premium unlocked! Paste your study material and I can summarize it or build you a quiz.';
        column.append(bubble);
        column.append(buildStudyToolForm());
    } else {
        bubble.textContent = 'Summarizing notes and generating quizzes are Premium features. Upgrade and I will study with you!';
        column.append(bubble);
        const wrap = document.createElement('div');
        wrap.className = 'pip-suggestions';
        const upgrade = document.createElement('button');
        upgrade.type = 'button';
        upgrade.className = 'pip-suggestion upgrade-btn';
        upgrade.textContent = 'Upgrade to Premium';
        upgrade.addEventListener('click', togglePremium);
        wrap.append(upgrade);
        column.append(wrap);
    }
    row.append(avatar, column);
    chatWidgetBody.append(row);
    chatWidgetBody.scrollTop = chatWidgetBody.scrollHeight;
}

function buildStudyToolForm() {
    const form = document.createElement('div');
    form.className = 'pip-study-tool';
    const area = document.createElement('textarea');
    area.className = 'pip-study-input';
    area.rows = 5;
    area.placeholder = 'Paste your notes, a chapter, or an article here...';
    const fileLabel = document.createElement('label');
    fileLabel.className = 'pip-study-file';
    fileLabel.textContent = 'Or load a .txt file';
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.txt,text/plain';
    file.addEventListener('change', async () => {
        const chosen = file.files[0];
        if (chosen) area.value = await chosen.text();
    });
    fileLabel.append(file);

    const actions = document.createElement('div');
    actions.className = 'pip-study-actions';
    const summarizeBtn = document.createElement('button');
    summarizeBtn.type = 'button';
    summarizeBtn.className = 'pip-study-btn';
    summarizeBtn.textContent = 'Summarize';
    summarizeBtn.addEventListener('click', () => runPipSummary(area.value));
    const quizBtn = document.createElement('button');
    quizBtn.type = 'button';
    quizBtn.className = 'pip-study-btn alt';
    quizBtn.textContent = 'Make a quiz';
    quizBtn.addEventListener('click', () => runPipQuiz(area.value));
    actions.append(summarizeBtn, quizBtn);

    form.append(area, fileLabel, actions);
    return form;
}

function runPipSummary(text) {
    if (!isPremium()) { appendPipStudyMenu(); return; }
    const clean = String(text || '').trim();
    if (clean.split(/\s+/).length < 25) {
        appendPipBubble('Give me a bit more text (at least a short paragraph) and I will summarize the key points.');
        return;
    }
    const points = summarizeText(clean, 4);
    const bubble = document.createElement('div');
    bubble.className = 'pip-row';
    const avatar = document.createElement('img');
    avatar.src = 'pip.svg';
    avatar.alt = 'Pip';
    const column = document.createElement('div');
    const head = document.createElement('div');
    head.className = 'chat-bubble pip';
    head.textContent = 'Here are the key points:';
    const list = document.createElement('ul');
    list.className = 'pip-summary';
    points.forEach(point => {
        const li = document.createElement('li');
        li.textContent = point;
        list.append(li);
    });
    const terms = keyTermsFrom(clean, 6);
    column.append(head, list);
    if (terms.length) {
        const tags = document.createElement('div');
        tags.className = 'pip-terms';
        tags.textContent = 'Key terms: ' + terms.map(titleCase).join(', ');
        column.append(tags);
    }
    bubble.append(avatar, column);
    chatWidgetBody.append(bubble);
    chatWidgetBody.scrollTop = chatWidgetBody.scrollHeight;
}

function runPipQuiz(text) {
    if (!isPremium()) { appendPipStudyMenu(); return; }
    const clean = String(text || '').trim();
    if (clean.split(/\s+/).length < 40) {
        appendPipBubble('I need a bit more material to build a fair quiz — paste a few paragraphs and try again.');
        return;
    }
    const quiz = generateQuiz(clean, 5);
    if (!quiz.length) {
        appendPipBubble('I could not find enough distinct terms to build a quiz from that. Try a longer or more detailed passage.');
        return;
    }
    renderPipQuiz(quiz);
}

function renderPipQuiz(quiz) {
    const row = document.createElement('div');
    row.className = 'pip-row';
    const avatar = document.createElement('img');
    avatar.src = 'pip.svg';
    avatar.alt = 'Pip';
    const column = document.createElement('div');
    const intro = document.createElement('div');
    intro.className = 'chat-bubble pip';
    intro.textContent = `Quiz time! ${quiz.length} question${quiz.length > 1 ? 's' : ''}. Pick an answer for each, then submit.`;
    column.append(intro);

    const card = document.createElement('form');
    card.className = 'pip-quiz';
    quiz.forEach((question, qi) => {
        const block = document.createElement('fieldset');
        block.className = 'pip-quiz-q';
        const legend = document.createElement('legend');
        legend.textContent = `${qi + 1}. ${question.prompt}`;
        block.append(legend);
        const options = question.type === 'tf' ? ['True', 'False'] : question.options;
        options.forEach(option => {
            const label = document.createElement('label');
            label.className = 'pip-quiz-opt';
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = `q${qi}`;
            input.value = option;
            const span = document.createElement('span');
            span.textContent = option;
            label.append(input, span);
            block.append(label);
        });
        card.append(block);
    });

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'pip-study-btn';
    submit.textContent = 'Submit answers';
    const result = document.createElement('p');
    result.className = 'pip-quiz-result';
    card.append(submit, result);

    card.addEventListener('submit', event => {
        event.preventDefault();
        let correct = 0;
        quiz.forEach((question, qi) => {
            const picked = card.querySelector(`input[name="q${qi}"]:checked`);
            const block = card.querySelectorAll('.pip-quiz-q')[qi];
            block.classList.remove('right', 'wrong');
            if (picked && picked.value === question.answer) {
                correct++;
                block.classList.add('right');
            } else {
                block.classList.add('wrong');
                const legend = block.querySelector('legend');
                if (!legend.querySelector('.pip-quiz-answer')) {
                    const ans = document.createElement('span');
                    ans.className = 'pip-quiz-answer';
                    ans.textContent = ` — answer: ${question.answer}`;
                    legend.append(ans);
                }
            }
        });
        result.textContent = `You scored ${correct} / ${quiz.length}.`;
    });

    column.append(card);
    row.append(avatar, column);
    chatWidgetBody.append(row);
    chatWidgetBody.scrollTop = chatWidgetBody.scrollHeight;
}

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
