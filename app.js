// ═════════════════════════════════════════════════════════════════════
// PULSE LIVE NETWORK – Frontend Engine v4.0
// ═════════════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://jnwqokkzywrctdjsdzbl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impud3Fva2t6eXdyY3RkanNkemJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTkxOTYsImV4cCI6MjA5NTM5NTE5Nn0.8RkJ2A1oJ9DaSD0Y8CdiNwvcfcr7iWyQZf5eKD3kpAo';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ──
let currentUser   = null;
let allPostsCache = [];
let currentTab    = 'latest';
let currentRoom   = null;
let currentRoomId = null;
let isCurrentUserHost = false;

// ── Helper functions ──
function toast(msg, type = 'info') {
    const el = document.getElementById('status-msg');
    if (!el) return;
    el.textContent = msg;
    el.style.background = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#1f2937';
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 3000);
}

function esc(s) { return (s || '').replace(/[&<>]/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m])); }
function fmtNum(n) { n = n || 0; if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n>=1e3) return (n/1e3).toFixed(1)+'k'; return String(n); }
function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso), now = new Date();
    const sec = Math.floor((now-d)/1000);
    if (sec<60) return 'الآن';
    if (sec<3600) return `${Math.floor(sec/60)} د`;
    if (sec<86400) return `${Math.floor(sec/3600)} س`;
    return d.toLocaleDateString('ar-EG', {month:'short', day:'numeric'});
}

// ── Avatar colors ──
const COLORS = ['#000000', '#1e293b', '#2d3748', '#4a5568', '#1a202c', '#171923'];
const getColor = (s) => COLORS[Math.abs((s||'A').split('').reduce((a,c)=>a+c.charCodeAt(0),0))%COLORS.length];
const getInitial = (s) => (s && s[0]) ? s[0].toUpperCase() : '?';

// ═════════════════════════════════════════════════════════════════════
// POST CARD – تصميم أنيق ومطابق للملف الجديد
// ═════════════════════════════════════════════════════════════════════
function postCard(post) {
    const name = post.author_name || 'مستخدم';
    const net = (post.upvotes||0) - (post.downvotes||0);
    const netSign = net >= 0 ? '+' : '';
    const isOwner = currentUser?.id === post.user_id;
    const contentHtml = esc(post.content).replace(/#(\S+)/g, '<span class="text-blue-600 font-bold cursor-pointer" onclick="filterByTag(\'$1\')">#$1</span>');

    return `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 transition hover:shadow-md" data-id="${post.id}">
            <div class="flex gap-3">
                <!-- Avatar -->
                <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm"
                     style="background: ${getColor(name)}">${getInitial(name)}</div>
                <div class="flex-1 min-w-0">
                    <!-- Header -->
                    <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-sm text-black">${esc(name)}</span>
                            <span class="text-xs text-gray-400">${fmtDate(post.created_at)}</span>
                        </div>
                        ${isOwner ? `
                            <button onclick="deletePost('${post.id}')" class="text-gray-400 hover:text-red-500 transition text-xs">
                                <i class="fa-regular fa-trash-can"></i>
                            </button>
                        ` : ''}
                    </div>
                    <!-- Content -->
                    <p class="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap mb-3">${contentHtml}</p>
                    <!-- Reactions -->
                    <div class="flex items-center gap-4">
                        <button onclick="handleVote('${post.id}','up')" class="flex items-center gap-1 text-xs text-gray-500 hover:text-green-600 transition">
                            <i class="fa-regular fa-thumbs-up"></i> ${fmtNum(post.upvotes||0)}
                        </button>
                        <button onclick="handleVote('${post.id}','down')" class="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 transition">
                            <i class="fa-regular fa-thumbs-down"></i> ${fmtNum(post.downvotes||0)}
                        </button>
                        <span class="text-xs text-gray-400 font-mono mr-2">${netSign}${net}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ═════════════════════════════════════════════════════════════════════
// POSTS LOGIC
// ═════════════════════════════════════════════════════════════════════
async function fetchPosts() {
    const { data, error } = await db.from('posts').select('*').order('created_at', { ascending: false }).limit(80);
    if (error) { console.error(error); return; }
    allPostsCache = data || [];
    renderTimeline();
    document.getElementById('stat-posts').innerText = fmtNum(allPostsCache.length);
}

function renderTimeline() {
    const container = document.getElementById('posts-container');
    if (!container) return;
    let posts = [...allPostsCache];
    if (currentTab === 'top') posts.sort((a,b) => ((b.upvotes||0)-(b.downvotes||0)) - ((a.upvotes||0)-(a.downvotes||0)));
    if (!posts.length) {
        container.innerHTML = `<div class="bg-white rounded-2xl p-8 text-center text-gray-500 text-sm">لا توجد منشورات بعد. كن أول من يشارك!</div>`;
        return;
    }
    container.innerHTML = posts.map(postCard).join('');
}

async function createPost() {
    if (!currentUser) { openAuthModal(); return; }
    const ta = document.getElementById('post-textarea');
    const content = ta?.value?.trim();
    if (!content) return toast('اكتب شيئاً أولاً', 'error');
    const btn = document.getElementById('post-submit-btn');
    if (btn) { btn.disabled = true; btn.innerText = '...'; }
    const name = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'مستخدم';
    const { error } = await db.from('posts').insert({
        user_id: currentUser.id,
        author_name: name,
        content: content,
        upvotes: 0,
        downvotes: 0
    });
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane ml-1"></i> نشر'; }
    if (error) return toast('فشل النشر: '+error.message, 'error');
    ta.value = '';
    toast('تم النشر!', 'success');
    fetchPosts();
}

async function handleVote(postId, type) {
    if (!currentUser) { openAuthModal(); return; }
    const field = type === 'up' ? 'upvotes' : 'downvotes';
    const post = allPostsCache.find(p => p.id === postId);
    if (!post) return;
    const newVal = (post[field]||0) + 1;
    const { error } = await db.from('posts').update({ [field]: newVal }).eq('id', postId);
    if (error) return toast('فشل التصويت', 'error');
    post[field] = newVal;
    renderTimeline();
}

async function deletePost(postId) {
    if (!currentUser) return;
    if (!confirm('حذف المنشور؟')) return;
    const { error } = await db.from('posts').delete().eq('id', postId).eq('user_id', currentUser.id);
    if (error) return toast('فشل الحذف', 'error');
    allPostsCache = allPostsCache.filter(p => p.id !== postId);
    renderTimeline();
    toast('تم الحذف', 'info');
}

function switchTab(tab) {
    currentTab = tab;
    document.getElementById('tab-latest')?.classList.toggle('active', tab==='latest');
    document.getElementById('tab-top')?.classList.toggle('active', tab==='top');
    renderTimeline();
}

function filterByTag(tag) {
    navigateTo('timeline');
    const filtered = allPostsCache.filter(p => p.content?.includes('#'+tag));
    const container = document.getElementById('posts-container');
    if (!filtered.length) {
        container.innerHTML = `<div class="bg-white rounded-2xl p-8 text-center text-gray-500">لا توجد منشورات بـ #${esc(tag)}</div>`;
        return;
    }
    container.innerHTML = filtered.map(postCard).join('');
}

// ═════════════════════════════════════════════════════════════════════
// AUTH, NAVIGATION, ROOMS, SANDBOX (بقية الدوال اختصاراً)
// ═════════════════════════════════════════════════════════════════════
function openAuthModal() { document.getElementById('auth-modal').classList.remove('hidden'); }
function closeAuthModal() { document.getElementById('auth-modal').classList.add('hidden'); }
function switchToSignup() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('signup-form').classList.remove('hidden');
    document.getElementById('auth-modal-title').innerText = 'إنشاء حساب';
}
function switchToLogin() {
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('auth-modal-title').innerText = 'تسجيل الدخول';
}
async function handleLogin() {
    const email = document.getElementById('login-email')?.value.trim();
    const pw = document.getElementById('login-password')?.value;
    if (!email || !pw) return toast('أدخل البريد وكلمة المرور', 'error');
    const btn = event?.target;
    if(btn) btn.disabled = true;
    const { error } = await db.auth.signInWithPassword({ email, password: pw });
    if(btn) btn.disabled = false;
    if(error) return toast(error.message, 'error');
    closeAuthModal();
    toast('أهلاً بك!');
}
async function handleSignup() {
    const name = document.getElementById('signup-name')?.value.trim();
    const email = document.getElementById('signup-email')?.value.trim();
    const pw = document.getElementById('signup-password')?.value;
    if(!name || !email || !pw) return toast('املأ جميع الحقول', 'error');
    if(pw.length<6) return toast('كلمة المرور 6 أحرف على الأقل', 'error');
    const btn = event?.target;
    if(btn) btn.disabled = true;
    const { error } = await db.auth.signUp({ email, password: pw, options: { data: { full_name: name } } });
    if(btn) btn.disabled = false;
    if(error) return toast(error.message, 'error');
    closeAuthModal();
    toast('تم إنشاء الحساب!');
}
async function handleLogout() { await db.auth.signOut(); currentUser=null; updateUIForAuth(); navigateTo('timeline'); toast('إلى اللقاء'); }

function updateUIForAuth() {
    const loggedIn = !!currentUser;
    document.getElementById('auth-toggle-btn')?.classList.toggle('hidden', loggedIn);
    document.getElementById('user-profile-card')?.classList.toggle('hidden', !loggedIn);
    document.getElementById('composer-logged-in')?.classList.toggle('hidden', !loggedIn);
    document.getElementById('composer-logged-out')?.classList.toggle('hidden', loggedIn);
    if(loggedIn && currentUser) {
        const name = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
        const c = getColor(name);
        document.getElementById('user-display-name').innerText = name;
        document.getElementById('user-avatar-letter').innerText = getInitial(name);
        document.getElementById('user-avatar-letter').style.background = c;
        document.getElementById('profile-display-name').innerText = name;
        document.getElementById('profile-username').innerText = currentUser.email;
        document.getElementById('profile-avatar').innerText = getInitial(name);
        document.getElementById('profile-avatar').style.background = c;
        document.getElementById('composer-avatar')?.setAttribute('style', `background:${c}`);
    }
}

function navigateTo(view) {
    ['timeline','rooms','sandbox','profile'].forEach(v => {
        document.getElementById(v+'-view')?.classList.add('hidden');
    });
    document.getElementById(view+'-view')?.classList.remove('hidden');
    if(view==='profile') renderProfile();
    if(view==='rooms') fetchRooms();
}

function renderProfile() {
    if(!currentUser) return;
    const myPosts = allPostsCache.filter(p => p.user_id === currentUser.id);
    document.getElementById('profile-posts-count').innerText = myPosts.length;
    const container = document.getElementById('profile-posts-list');
    if(!myPosts.length) { container.innerHTML = '<div class="text-center text-gray-400 text-sm p-6">لا توجد منشورات بعد</div>'; return; }
    container.innerHTML = myPosts.map(p => `
        <div class="bg-white rounded-2xl border border-gray-100 p-4">
            <p class="text-sm text-gray-800 mb-2">${esc(p.content)}</p>
            <div class="flex justify-between items-center text-xs text-gray-400">
                <span>${fmtDate(p.created_at)}</span>
                <button onclick="deletePost('${p.id}')" class="text-red-500 hover:text-red-700"><i class="fa-regular fa-trash-can"></i> حذف</button>
            </div>
        </div>
    `).join('');
}

// Rooms & Sandbox مختصرة (للاختصار، يمكنك إضافة دوال الغرف والمشغل لاحقاً)
async function fetchRooms() { /* ... */ }
async function createNewAudioRoom() { /* ... */ }
async function joinRoom() { /* ... */ }
async function leaveCurrentAudioRoom() { /* ... */ }
function toggleMic() { /* ... */ }
function closeCurrentRoom() { /* ... */ }
async function runSandbox() { /* ... */ }
function stopSandbox() { /* ... */ }
function clearTerminal() { /* ... */ }

db.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user ?? null;
    updateUIForAuth();
    if(event === 'SIGNED_IN') fetchPosts();
});

document.addEventListener('DOMContentLoaded', () => {
    db.auth.getSession().then(({data:{session}}) => { currentUser = session?.user??null; updateUIForAuth(); fetchPosts(); });
    document.getElementById('post-submit-btn')?.addEventListener('click', createPost);
    window.navigateTo = navigateTo;
    window.openAuthModal = openAuthModal; window.closeAuthModal = closeAuthModal;
    window.switchToSignup = switchToSignup; window.switchToLogin = switchToLogin;
    window.handleLogin = handleLogin; window.handleSignup = handleSignup; window.handleLogout = handleLogout;
    window.switchTab = switchTab; window.handleVote = handleVote; window.deletePost = deletePost; window.filterByTag = filterByTag;
    window.createNewAudioRoom = createNewAudioRoom; window.joinRoom = joinRoom; window.leaveCurrentAudioRoom = leaveCurrentAudioRoom;
    window.toggleMic = toggleMic; window.closeCurrentRoom = closeCurrentRoom;
    window.runSandbox = runSandbox; window.stopSandbox = stopSandbox; window.clearTerminal = clearTerminal;
});
