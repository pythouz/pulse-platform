// ══════════════════════════════════════════════════════════════════════════════
// Pulse — Frontend Engine v4.1 (تصويت فوري + ترتيب ديناميكي + تاج ذهبي بجانب الاسم)
// ══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL      = 'https://jnwqokkzywrctdjsdzbl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impud3Fva2t6eXdyY3RkanNkemJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTkxOTYsImV4cCI6MjA5NTM5NTE5Nn0.8RkJ2A1oJ9DaSD0Y8CdiNwvcfcr7iWyQZf5eKD3kpAo';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ──
let currentUser        = null;
let allPostsCache      = [];
let currentTab         = 'latest';
let currentRoom        = null;
let currentRoomId      = null;
let currentRoomHostId  = null;
let isCurrentUserHost  = false;
let scrollY            = 0;

// ── Avatar color palette ──
const COLORS = ['#6366f1','#8b5cf6','#ec4899','#10b981','#f59e0b','#3b82f6','#ef4444','#14b8a6','#f97316','#06b6d4'];
const getColor   = s => COLORS[Math.abs(Array.from(s||'A').reduce((a,c)=>a+c.charCodeAt(0),0))%COLORS.length];
const getInitial = s => (s||'?')[0].toUpperCase();

// ══════════════════════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════════════════════
function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtNum(n) {
    n = n || 0;
    if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
    if (n >= 1000)    return (n/1000).toFixed(1)    + 'k';
    return String(n);
}

function fmtDate(iso) {
    if (!iso) return '';
    const d   = new Date(iso);
    const now = new Date();
    const sec = Math.floor((now - d) / 1000);
    if (sec < 60)   return 'الآن';
    if (sec < 3600) return `${Math.floor(sec/60)} د`;
    if (sec < 86400)return `${Math.floor(sec/3600)} س`;
    return d.toLocaleDateString('ar-EG', { month:'short', day:'numeric' });
}

function toast(msg, type='info') {
    const el = document.getElementById('status-msg');
    if (!el) return;
    el.textContent = msg;
    el.style.background = type==='success'?'#16a34a':type==='error'?'#dc2626':'#0f0f0f';
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 3500);
}

function avatar(name, size='av-sm', extra='') {
    return `<div class="avatar ${size}" style="background:${getColor(name)};${extra}">${getInitial(name)}</div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTER
// ══════════════════════════════════════════════════════════════════════════════
const VIEWS = ['timeline','rooms','explore','profile'];

function navigateTo(view) {
    VIEWS.forEach(v => {
        const el = document.getElementById(v+'-view');
        if (el) el.classList.add('hidden');
    });
    const target = document.getElementById(view+'-view');
    if (target) target.classList.remove('hidden');

    VIEWS.forEach(v => {
        const btn    = document.getElementById('nav-'+v);
        const mobBtn = document.getElementById('mob-nav-'+v);
        if (btn)    btn.classList.toggle('active',    v===view);
        if (mobBtn) mobBtn.classList.toggle('active', v===view);
    });

    if (view === 'rooms')   { fetchRooms(); }
    if (view === 'profile') { if (currentUser) renderProfilePage(); else openAuthModal(); }
    if (view === 'explore') { renderExplorePage(); }
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════════
function openAuthModal() {
    document.getElementById('auth-modal').classList.remove('hidden');
}
function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
}
function outsideCloseAuth(e) {
    if (e.target.id === 'auth-modal') closeAuthModal();
}
function switchToSignup() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('signup-form').classList.remove('hidden');
    document.getElementById('auth-modal-title').textContent = 'إنشاء حساب';
}
function switchToLogin() {
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('auth-modal-title').textContent = 'تسجيل الدخول';
}

async function handleLogin() {
    const email    = document.getElementById('login-email')?.value?.trim();
    const password = document.getElementById('login-password')?.value;
    if (!email || !password) return toast('أدخل البريد وكلمة المرور', 'error');
    const btn = document.querySelector('#login-form button');
    if (btn) { btn.textContent = '...'; btn.disabled = true; }
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (btn) { btn.innerHTML = 'دخول <i class="fa-solid fa-arrow-left"></i>'; btn.disabled = false; }
    if (error) return toast(error.message, 'error');
    closeAuthModal();
    toast('أهلاً بك! 🎉', 'success');
}

async function handleSignup() {
    const name     = document.getElementById('signup-name')?.value?.trim();
    const email    = document.getElementById('signup-email')?.value?.trim();
    const password = document.getElementById('signup-password')?.value;
    if (!name || !email || !password) return toast('يرجى تعبئة جميع الحقول', 'error');
    if (password.length < 6) return toast('كلمة المرور 6 أحرف على الأقل', 'error');
    const btn = document.querySelector('#signup-form button');
    if (btn) { btn.textContent = '...'; btn.disabled = true; }
    const { error } = await db.auth.signUp({ email, password, options: { data: { full_name: name } } });
    if (btn) { btn.innerHTML = 'إنشاء الحساب ✨'; btn.disabled = false; }
    if (error) return toast(error.message, 'error');
    closeAuthModal();
    toast('مرحباً بك في Pulse! 🎊', 'success');
}

async function handleLogout() {
    await db.auth.signOut();
    currentUser = null;
    updateUIForAuth();
    navigateTo('timeline');
    toast('إلى اللقاء! 👋', 'info');
}

db.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user ?? null;
    updateUIForAuth();
    if (event === 'SIGNED_IN') fetchPosts();
});

function updateUIForAuth() {
    const loggedIn = !!currentUser;

    document.getElementById('auth-toggle-btn')?.classList.toggle('hidden', loggedIn);
    document.getElementById('user-profile-card')?.classList.toggle('hidden', !loggedIn);
    document.getElementById('composer-logged-in')?.classList.toggle('hidden', !loggedIn);
    document.getElementById('composer-logged-out')?.classList.toggle('hidden', loggedIn);

    if (loggedIn && currentUser) {
        const name = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'مستخدم';
        const c    = getColor(name);

        const setEl = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
        const setStyle = (id, prop, val) => { const el=document.getElementById(id); if(el) el.style[prop]=val; };

        setEl('user-display-name', name);
        setEl('user-email-display', currentUser.email || '');
        setEl('user-avatar-letter', getInitial(name));
        setEl('composer-avatar', getInitial(name));
        setStyle('user-avatar-letter', 'background', c);
        setStyle('composer-avatar', 'background', c);
    }
    updateStats();
}

// ══════════════════════════════════════════════════════════════════════════════
// POSTS – الإصدار النهائي مع التاج بجانب الاسم والتصويت الفوري
// ══════════════════════════════════════════════════════════════════════════════

async function fetchPosts() {
    const { data, error } = await db.from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(80);
    if (error) { console.error('fetchPosts:', error); return; }
    allPostsCache = data || [];
    renderTimeline();
    updateStats();
}

function switchTab(tab) {
    currentTab = tab;
    document.getElementById('tab-latest')?.classList.toggle('active', tab==='latest');
    document.getElementById('tab-top')?.classList.toggle('active',    tab==='top');
    renderTimeline();
}

function getSortedPosts() {
    if (currentTab === 'top') {
        return [...allPostsCache].sort((a,b) =>
            ((b.upvotes||0)-(b.downvotes||0)) - ((a.upvotes||0)-(a.downvotes||0))
        );
    }
    return [...allPostsCache];
}

function renderTimeline() {
    const container = document.getElementById('posts-container');
    if (!container) return;
    const posts = getSortedPosts();
    if (!posts.length) {
        container.innerHTML = `<div class="card" style="padding:50px 20px;text-align:center">
            <div style="font-size:2.5rem;margin-bottom:12px">📭</div>
            <p style="color:var(--muted);font-size:.9rem">لا توجد منشورات بعد.<br>كن أول من يشارك!</p>
        </div>`;
        bindVoteEvents(); // لا حاجة لكن للأمان
        return;
    }
    scrollY = window.scrollY;
    // نمرر `true` فقط للمنشور الأول إذا كان التبويب 'top'
    container.innerHTML = posts.map((post, idx) => postCard(post, currentTab === 'top' && idx === 0)).join('');
    window.scrollTo(0, scrollY);
    bindVoteEvents(); // إعادة ربط أزرار التصويت بعد الرندر
}

// دالة بطاقة المنشور - التاج الآن بجانب الاسم داخل نفس الصف
function postCard(post, isTopPost = false) {
    const name    = post.author_name || 'مجهول';
    const net     = (post.upvotes||0) - (post.downvotes||0);
    const netSign = net >= 0 ? '+' : '';
    const isOwner = currentUser?.id === post.user_id;
    const content = esc(post.content).replace(/#(\S+)/g,
        '<span style="color:var(--accent2);cursor:pointer;font-weight:700" onclick="filterByTag(\'$1\')">#$1</span>');

    // إضافة كلاس ذهبي وتأثير للبطاقة إذا كانت الأعلى تقييماً
    const topClass = isTopPost ? 'golden-post' : '';
    // التاج أصبح داخل صف الاسم وليس منفصلاً
    const crownHtml = isTopPost ? '<span style="font-size:1rem; margin-right:4px;">👑</span>' : '';

    return `<div class="card post-card fade-up ${topClass}" data-id="${post.id}" style="position:relative; ${isTopPost ? 'border:2px solid #FFD700; box-shadow:0 0 20px rgba(255,215,0,0.5);' : ''}">
        <div style="display:flex;gap:12px">
            ${avatar(name, 'av-sm')}
            <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
                        <span style="font-weight:800;font-size:.88rem;color:var(--dark)">${esc(name)}</span>
                        ${crownHtml}
                        <span style="font-size:.72rem;color:var(--muted)">${fmtDate(post.created_at)}</span>
                    </div>
                    ${isOwner ? `<button onclick="deletePost('${post.id}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.8rem;padding:4px 6px;border-radius:8px" title="حذف"><i class="fa-regular fa-trash-can"></i></button>` : ''}
                </div>
                <p style="font-size:.88rem;line-height:1.7;color:#2a2a2a;white-space:pre-wrap;margin:0 0 12px">${content}</p>
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                    <button class="reaction-btn vote-up" data-id="${post.id}" data-type="up">
                        <i class="fa-solid fa-arrow-up"></i> <span class="up-count">${fmtNum(post.upvotes||0)}</span>
                    </button>
                    <button class="reaction-btn vote-down" data-id="${post.id}" data-type="down">
                        <i class="fa-solid fa-arrow-down"></i> <span class="down-count">${fmtNum(post.downvotes||0)}</span>
                    </button>
                    <span class="net-score" style="font-size:.85rem;font-weight:800;background:var(--accent2);color:white;padding:4px 10px;border-radius:30px;">${netSign}${net}</span>
                </div>
            </div>
        </div>
    </div>`;
}

// ── التصويت: تحديث واجهة فوري + إرسال إلى السيرفر + إعادة ترتيب إذا كان تبويب top ──
async function handleVote(postId, type) {
    if (!currentUser) { openAuthModal(); return; }
    
    const field = type === 'up' ? 'upvotes' : 'downvotes';
    const post = allPostsCache.find(p => p.id === postId);
    if (!post) return;

    // optimistic update
    const oldValue = post[field] || 0;
    post[field] = oldValue + 1;
    // تحديث الكاش
    const index = allPostsCache.findIndex(p => p.id === postId);
    if (index !== -1) allPostsCache[index] = post;

    // تحديث DOM مباشرة
    const postElement = document.querySelector(`.post-card[data-id="${postId}"]`);
    if (postElement) {
        const upSpan = postElement.querySelector('.up-count');
        const downSpan = postElement.querySelector('.down-count');
        if (type === 'up' && upSpan) upSpan.innerText = fmtNum(post.upvotes);
        if (type === 'down' && downSpan) downSpan.innerText = fmtNum(post.downvotes);
        const netSpan = postElement.querySelector('.net-score');
        const net = (post.upvotes||0) - (post.downvotes||0);
        netSpan.innerText = `${net >= 0 ? '+' : ''}${net}`;
    }

    // إرسال إلى السيرفر
    try {
        const { error } = await db.from('posts').update({ [field]: post[field] }).eq('id', postId);
        if (error) {
            // فشل: نعيد القيمة القديمة
            post[field] = oldValue;
            if (index !== -1) allPostsCache[index] = post;
            if (postElement) {
                if (type === 'up') postElement.querySelector('.up-count').innerText = fmtNum(oldValue);
                else postElement.querySelector('.down-count').innerText = fmtNum(oldValue);
                const net = (post.upvotes||0) - (post.downvotes||0);
                postElement.querySelector('.net-score').innerText = `${net >= 0 ? '+' : ''}${net}`;
            }
            toast('فشل التصويت: ' + error.message, 'error');
            return;
        }
        // نجاح: إذا كنا في تبويب top، قد نحتاج لإعادة الترتيب
        if (currentTab === 'top') {
            const newSorted = getSortedPosts();
            // إذا تغير الترتيب (أول عنصر مختلف)
            const firstId = document.querySelector('.post-card')?.getAttribute('data-id');
            if (firstId && newSorted[0]?.id != firstId) {
                renderTimeline();
            }
        }
        toast(`تم التصويت ${type === 'up' ? '⬆️' : '⬇️'}`, 'success');
    } catch(e) {
        console.error(e);
        toast('خطأ في الشبكة', 'error');
    }
}

// ── Event delegation لأزرار التصويت (تعمل حتى بعد إعادة الرندر) ──
function bindVoteEvents() {
    const container = document.getElementById('posts-container');
    if (!container) return;
    // إزالة المستمع القديم لتجنب التكرار
    container.removeEventListener('click', voteClickHandler);
    container.addEventListener('click', voteClickHandler);
}

function voteClickHandler(event) {
    const btn = event.target.closest('.vote-up, .vote-down');
    if (!btn) return;
    event.preventDefault();
    const postId = btn.getAttribute('data-id');
    const type = btn.classList.contains('vote-up') ? 'up' : 'down';
    if (postId) handleVote(postId, type);
}

async function createPost() {
    if (!currentUser) return openAuthModal();
    const ta      = document.getElementById('post-textarea');
    const content = ta?.value?.trim();
    if (!content) return toast('اكتب شيئاً أولاً!', 'error');
    const btn = document.getElementById('post-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    const name = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'مستخدم';
    const { error } = await db.from('posts').insert({
        content,
        user_id:     currentUser.id,
        author_name: name,
        upvotes:     0,
        downvotes:   0,
    });
    if (btn) { btn.disabled = false; btn.innerHTML = 'نشر <i class="fa-solid fa-paper-plane"></i>'; }
    if (error) return toast('فشل النشر: ' + error.message, 'error');
    ta.value = '';
    toast('تم النشر! ✅', 'success');
    fetchPosts();
}

async function deletePost(postId) {
    if (!currentUser) return;
    if (!confirm('حذف هذا المنشور؟')) return;
    const { error } = await db.from('posts').delete().eq('id', postId).eq('user_id', currentUser.id);
    if (error) return toast('فشل الحذف', 'error');
    allPostsCache = allPostsCache.filter(p => p.id !== postId);
    renderTimeline();
    toast('تم الحذف', 'info');
}

function filterByTag(tag) {
    navigateTo('timeline');
    const filtered = allPostsCache.filter(p => p.content?.includes('#'+tag));
    const container = document.getElementById('posts-container');
    if (!container) return;
    if (!filtered.length) {
        container.innerHTML = `<div class="card" style="padding:32px;text-align:center;color:var(--muted)">لا توجد منشورات بوسم #${esc(tag)}</div>`;
    } else {
        container.innerHTML = filtered.map(post => postCard(post, false)).join('');
    }
    bindVoteEvents();
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPLORE
// ══════════════════════════════════════════════════════════════════════════════
function renderExplorePage() {
    const el = document.getElementById('explore-posts');
    if (!el) return;
    const top = [...allPostsCache]
        .sort((a,b) => ((b.upvotes||0)-(b.downvotes||0)) - ((a.upvotes||0)-(a.downvotes||0)))
        .slice(0, 10);
    if (!top.length) {
        el.innerHTML = '<p style="color:var(--muted);font-size:.85rem">لا توجد منشورات بعد.</p>';
        bindVoteEvents();
        return;
    }
    // أول منشور في قائمة الاستكشاف يحصل على تاج (لأنه الأعلى تقييماً)
    el.innerHTML = top.map((post, idx) => postCard(post, idx === 0)).join('');
    bindVoteEvents();
}

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE
// ══════════════════════════════════════════════════════════════════════════════
function renderProfilePage() {
    if (!currentUser) return;
    const name    = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'مستخدم';
    const initial = getInitial(name);
    const color   = getColor(name);

    const setEl    = (id, val)       => { const el=document.getElementById(id); if(el) el.textContent=val; };
    const setStyle = (id, prop, val) => { const el=document.getElementById(id); if(el) el.style[prop]=val; };

    setEl('profile-display-name', name);
    setEl('profile-username', currentUser.email || '');
    setEl('profile-avatar', initial);
    setStyle('profile-avatar', 'background', color);

    const myPosts  = allPostsCache.filter(p => p.user_id === currentUser.id);
    const myVotes  = myPosts.reduce((s,p) => s + (p.upvotes||0), 0);
    setEl('profile-posts-count', myPosts.length);
    setEl('profile-votes-count', fmtNum(myVotes));
    setEl('profile-rooms-count', '—');

    const listEl = document.getElementById('profile-posts-list');
    if (!listEl) return;
    if (!myPosts.length) {
        listEl.innerHTML = '<p style="text-align:center;color:var(--muted);padding:24px 0;font-size:.88rem">لم تنشر شيئاً بعد 📝</p>';
        return;
    }
    listEl.innerHTML = myPosts.map(p => {
        const net = (p.upvotes||0)-(p.downvotes||0);
        return `<div class="card" style="padding:16px">
            <p style="font-size:.87rem;line-height:1.65;color:#2a2a2a;margin:0 0 10px;white-space:pre-wrap">${esc(p.content)}</p>
            <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:.72rem;color:var(--muted)">${fmtDate(p.created_at)}</span>
                <div style="display:flex;gap:10px;align-items:center">
                    <span style="font-size:.75rem;color:var(--muted);font-weight:700">
                        <i class="fa-solid fa-arrow-up" style="color:#22c55e"></i> ${p.upvotes||0}
                    </span>
                    <button onclick="deletePost('${p.id}')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:.8rem">
                        <i class="fa-regular fa-trash-can"></i>
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// STATS
// ══════════════════════════════════════════════════════════════════════════════
async function updateStats() {
    const postsEl = document.getElementById('stat-posts');
    const roomsEl = document.getElementById('stat-rooms');
    if (postsEl) postsEl.textContent = fmtNum(allPostsCache.length);
    if (roomsEl) {
        const { count, error } = await db.from('audio_rooms')
            .select('id', { count:'exact', head:true })
            .eq('is_active', true);
        if (!error) roomsEl.textContent = fmtNum(count || 0);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// AUDIO ROOMS (نفس السابق مع إعادة ربط لا حاجة لها هنا)
// ══════════════════════════════════════════════════════════════════════════════
async function fetchRooms() {
    const { data, error } = await db.from('audio_rooms')
        .select('id, title, host_id, host_name, is_active, created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
    if (error) { console.error('fetchRooms:', error); return; }
    renderRooms(data || []);
    updateStats();
}

function renderRooms(rooms) {
    const grid  = document.getElementById('rooms-grid');
    const empty = document.getElementById('rooms-empty-state');
    if (!grid) return;

    if (!rooms.length) {
        grid.innerHTML = '';
        empty?.classList.remove('hidden');
        return;
    }
    empty?.classList.add('hidden');

    grid.innerHTML = rooms.map(room => {
        const hostName = room.host_name || 'المضيف';
        const age      = fmtDate(room.created_at);
        return `<div class="room-card card-hover" onclick="joinRoom('${room.id}','${esc(room.title).replace(/'/g,"\\'")}','${room.host_id}')">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px">
                <div style="flex:1;min-width:0">
                    <h3 style="font-size:1rem;font-weight:800;color:var(--dark);margin:0 0 8px;line-height:1.4">${esc(room.title)}</h3>
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                        ${avatar(hostName,'av-sm')}
                        <span class="badge badge-host">🎤 ${esc(hostName)}</span>
                        <span style="font-size:.7rem;color:var(--muted)">${age}</span>
                    </div>
                </div>
                <span class="badge badge-live">
                    <span style="width:6px;height:6px;background:#ef4444;border-radius:50%;animation:blink 1.2s infinite;display:inline-block"></span>
                    مباشر
                </span>
            </div>
            <div class="divider" style="margin:12px 0"></div>
            <div style="display:flex;align-items:center;justify-content:space-between">
                <span style="font-size:.78rem;color:var(--muted);font-weight:600;display:flex;align-items:center;gap:6px">
                    <i class="fa-solid fa-headphones" style="color:var(--accent)"></i>
                    انقر للانضمام
                </span>
                <div style="background:var(--accent);color:#fff;padding:7px 16px;border-radius:20px;font-size:.75rem;font-weight:800;display:flex;align-items:center;gap:6px">
                    <i class="fa-solid fa-microphone"></i> دخول
                </div>
            </div>
        </div>`;
    }).join('');
}

function showCreateRoomModal() {
    if (!currentUser) { openAuthModal(); return; }
    document.getElementById('create-room-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('room-title-input')?.focus(), 300);
}
function hideCreateRoomModal() {
    document.getElementById('create-room-modal').classList.add('hidden');
}
function outsideCloseRoom(e) {
    if (e.target.id === 'create-room-modal') hideCreateRoomModal();
}

async function createNewAudioRoom() {
    if (!currentUser) { openAuthModal(); return; }
    const input = document.getElementById('room-title-input');
    const title = input?.value?.trim();
    if (!title) return toast('أدخل عنوان المجلس', 'error');

    const btn = document.querySelector('#create-room-modal .btn-accent');
    if (btn) { btn.textContent = '...'; btn.disabled = true; }

    const name = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'مضيف';

    const { data, error } = await db.from('audio_rooms').insert({
        title,
        host_id:   currentUser.id,
        host_name: name,
        is_active: true,
    }).select('id, title, host_id').single();

    if (btn) { btn.innerHTML = 'ابدأ الآن 🚀'; btn.disabled = false; }
    if (error) return toast('فشل إنشاء الغرفة: ' + error.message, 'error');

    if (input) input.value = '';
    hideCreateRoomModal();
    toast('تم إطلاق المجلس! 🚀', 'success');
    await fetchRooms();
    if (data) joinRoom(data.id, data.title, data.host_id);
}

async function joinRoom(roomId, title, hostId) {
    if (!currentUser) return openAuthModal();
    if (currentRoom) await leaveCurrentAudioRoom(true);

    const userName = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
    const roomName = `room_${roomId}`;

    try {
        const res = await fetch('/api/livekit-token', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ roomName, participantName: userName }),
        });
        if (!res.ok) {
            const d = await res.json().catch(()=>({}));
            throw new Error(d.error || `HTTP ${res.status}`);
        }
        const { token, wsUrl } = await res.json();

        const room = new LivekitClient.Room({
            adaptiveStream:  true,
            dynacast:        true,
        });

        room.on(LivekitClient.RoomEvent.TrackSubscribed, (track) => {
            if (track.kind === LivekitClient.Track.Kind.Audio) {
                const audio = track.attach();
                audio.play().catch(()=>{});
            }
        });
        room.on(LivekitClient.RoomEvent.ParticipantConnected,    () => refreshRoomUI(room));
        room.on(LivekitClient.RoomEvent.ParticipantDisconnected, () => refreshRoomUI(room));
        room.on(LivekitClient.RoomEvent.TrackMuted,              () => refreshRoomUI(room));
        room.on(LivekitClient.RoomEvent.TrackUnmuted,            () => refreshRoomUI(room));

        await room.connect(wsUrl, token);

        try {
            await room.localParticipant.setMicrophoneEnabled(false);
        } catch(e) { console.warn('mic:', e); }

        currentRoom       = room;
        currentRoomId     = roomId;
        currentRoomHostId = hostId;
        isCurrentUserHost = currentUser.id === hostId;

        const panel = document.getElementById('active-room-panel');
        panel.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        document.getElementById('active-room-title').textContent = title;
        document.getElementById('active-room-role').textContent  =
            isCurrentUserHost ? 'أنت المضيف 👑' : 'مستمع في الجمهور';

        const closeBtn = document.getElementById('close-active-room-btn');
        if (closeBtn) closeBtn.style.display = isCurrentUserHost ? 'inline-flex' : 'none';

        updateMicBtn();
        refreshRoomUI(room);

        window.addEventListener('beforeunload', quietLeave);
        toast(`دخلت "${title}" 🎙️`, 'success');

    } catch(err) {
        console.error('joinRoom:', err);
        toast('تعذر الانضمام: ' + err.message, 'error');
    }
}

function refreshRoomUI(room) {
    const speakersEl  = document.getElementById('speakers-grid');
    const listenersEl = document.getElementById('listeners-grid');
    if (!speakersEl || !listenersEl) return;

    const local   = room.localParticipant;
    const remotes = Array.from(room.remoteParticipants?.values() || room.participants?.values() || []);

    const mkParticipant = (identity, isMicOn, isLocal) => ({ identity, isMicOn, isLocal });
    const all = [
        mkParticipant(local.identity, local.isMicrophoneEnabled, true),
        ...remotes.map(p => mkParticipant(p.identity, p.isMicrophoneEnabled, false)),
    ];

    const stageMax = Math.min(8, all.length);
    const stage    = all.slice(0, stageMax);
    const audience = all.slice(stageMax);

    speakersEl.innerHTML = stage.map(p => {
        const c    = getColor(p.identity);
        const init = getInitial(p.identity);
        const spk  = p.isMicOn ? 'speaking' : '';
        const micC = p.isMicOn ? 'on' : 'off';
        const micI = p.isMicOn ? 'fa-microphone' : 'fa-microphone-slash';
        return `<div class="speaker-bubble">
            <div class="speaker-avatar ${spk}" style="background:${c}">
                ${init}
                <span class="speaker-mic ${micC}"><i class="fa-solid ${micI}" style="color:#fff;font-size:8px"></i></span>
            </div>
            <div style="font-size:.72rem;font-weight:700;color:rgba(255,255,255,.85);max-width:78px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                ${esc(p.identity)}${p.isLocal?' 👤':''}
            </div>
            ${p.isLocal && isCurrentUserHost ? '<div style="font-size:.6rem;color:#f59e0b;font-weight:800">مضيف 👑</div>' : ''}
        </div>`;
    }).join('');

    listenersEl.innerHTML = audience.length
        ? audience.map(p => `<div class="listener-bubble" style="background:${getColor(p.identity)}" title="${esc(p.identity)}">${getInitial(p.identity)}</div>`).join('')
        : '<span style="font-size:.78rem;color:rgba(255,255,255,.3)">الجمهور فارغ بعد</span>';
}

function updateMicBtn() {
    if (!currentRoom) return;
    const btn = document.getElementById('mute-btn');
    if (!btn) return;
    const isOn = currentRoom.localParticipant.isMicrophoneEnabled;
    btn.classList.toggle('active', isOn);
    btn.innerHTML = isOn
        ? '<i class="fa-solid fa-microphone"></i>'
        : '<i class="fa-solid fa-microphone-slash"></i>';
}

async function toggleMic() {
    if (!currentRoom) return;
    try {
        const next = !currentRoom.localParticipant.isMicrophoneEnabled;
        await currentRoom.localParticipant.setMicrophoneEnabled(next);
        updateMicBtn();
        refreshRoomUI(currentRoom);
        toast(next ? '🎙️ الميكروفون شغّال' : '🔇 الميكروفون معطّل', 'info');
    } catch(e) { toast('تعذر التحكم في الميكروفون', 'error'); }
}

function raiseHand() {
    const btn = document.getElementById('raise-hand-btn');
    if (!btn) return;
    const raised = btn.classList.toggle('raised');
    toast(raised ? '✋ رفعت يدك' : 'أنزلت يدك', 'info');
}

async function leaveCurrentAudioRoom(silent = false) {
    if (currentRoom) {
        try { currentRoom.disconnect(); } catch(e) {}
        currentRoom = null; currentRoomId = null; currentRoomHostId = null; isCurrentUserHost = false;
    }
    window.removeEventListener('beforeunload', quietLeave);
    const panel = document.getElementById('active-room-panel');
    if (panel) panel.classList.add('hidden');
    document.body.style.overflow = '';
    const sg = document.getElementById('speakers-grid');
    const lg = document.getElementById('listeners-grid');
    if (sg) sg.innerHTML = '';
    if (lg) lg.innerHTML = '';
    if (!silent) toast('غادرت المجلس 👋', 'info');
    fetchRooms();
}

function quietLeave() {
    if (currentRoom) try { currentRoom.disconnect(); } catch(e) {}
}

async function closeCurrentRoom() {
    if (!currentRoomId || !isCurrentUserHost) return;
    if (!confirm('إغلاق الغرفة نهائياً؟')) return;
    const { error } = await db.from('audio_rooms')
        .update({ is_active: false })
        .eq('id', currentRoomId);
    if (error) return toast('فشل الإغلاق: ' + error.message, 'error');
    await leaveCurrentAudioRoom();
}

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL EXPORTS
// ══════════════════════════════════════════════════════════════════════════════
Object.assign(window, {
    navigateTo, openAuthModal, closeAuthModal, outsideCloseAuth,
    switchToSignup, switchToLogin, handleLogin, handleSignup, handleLogout,
    createPost, deletePost, switchTab, filterByTag,
    fetchRooms, showCreateRoomModal, hideCreateRoomModal, outsideCloseRoom,
    createNewAudioRoom, joinRoom, leaveCurrentAudioRoom, closeCurrentRoom,
    toggleMic, raiseHand,
    handleVote, // للاستخدام المباشر إن لزم
});

// ══════════════════════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await db.auth.getSession();
    currentUser = session?.user ?? null;
    updateUIForAuth();
    fetchPosts();

    // ربط زر النشر (بدون onclick في HTML)
    const postBtn = document.getElementById('post-submit-btn');
    if (postBtn) postBtn.addEventListener('click', createPost);

    // ربط أحداث التصويت
    bindVoteEvents();

    // التعامل مع زر Esc
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (!document.getElementById('create-room-modal')?.classList.contains('hidden'))
                hideCreateRoomModal();
            if (!document.getElementById('auth-modal')?.classList.contains('hidden'))
                closeAuthModal();
        }
    });
});
