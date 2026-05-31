// ══════════════════════════════════════════════════════════════════════════════
// Pulse — Frontend Engine v4.1 (تصويت فوري + ترتيب ديناميكي + تاج ذهبي بجانب الاسم)
// ══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL      = 'https://jnwqokkzywrctdjsdzbl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impud3Fva2t6eXdyY3RkanNkemJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTkxOTYsImV4cCI6MjA5NTM5NTE5Nn0.8RkJ2A1oJ9DaSD0Y8CdiNwvcfcr7iWyQZf5eKD3kpAo';

// ── Custom storage مع fallback لـ sessionStorage على Safari/iOS ──
const _storage = (() => {
    try {
        localStorage.setItem('_elite_test', '1');
        localStorage.removeItem('_elite_test');
        return localStorage;
    } catch (e) {
        return sessionStorage;
    }
})();

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage:             _storage,
        persistSession:      true,
        autoRefreshToken:    true,
        detectSessionInUrl:  true,
        storageKey:          'elite-auth-token',
    },
});

// ── State ──
let currentUser        = null;
let allPostsCache      = [];
let userVotesCache     = {};   // { postId: 'upvote' | 'downvote' }
let currentTab         = 'latest';
let currentRoom        = null;
let currentRoomId      = null;
let currentRoomHostId  = null;
let isCurrentUserHost  = false;
let scrollY            = 0;

// ── Infinite Scroll State ──
let isFetchingMore  = false;
let hasMorePosts    = true;
let currentOffset   = 0;
const PAGE_SIZE     = 20;

// ── Boot flag ──
let bootComplete = false;

// ── Notifications State ──
let notificationsCache = [];
let unreadCount        = 0;

// ── Realtime State ──
let realtimeChannels = [];

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
    el.style.zIndex = '9999';
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
    try {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (btn) { btn.innerHTML = 'دخول <i class="fa-solid fa-arrow-left"></i>'; btn.disabled = false; }
        if (error) {
            const msg = error.message?.includes('Invalid login') || error.message?.includes('invalid_credentials')
                ? 'البريد أو كلمة المرور غلط' : error.message;
            return toast(msg, 'error');
        }
        closeAuthModal();
        toast('أهلاً بك! 🎉', 'success');
    } catch (e) {
        if (btn) { btn.innerHTML = 'دخول <i class="fa-solid fa-arrow-left"></i>'; btn.disabled = false; }
        console.error('Login error:', e);
        toast('خطأ في الاتصال، حاول مرة أخرى', 'error');
    }
}

async function handleSignup() {
    const name     = document.getElementById('signup-name')?.value?.trim();
    const email    = document.getElementById('signup-email')?.value?.trim();
    const password = document.getElementById('signup-password')?.value;
    if (!name || !email || !password) return toast('يرجى تعبئة جميع الحقول', 'error');
    if (password.length < 6) return toast('كلمة المرور 6 أحرف على الأقل', 'error');
    const btn = document.querySelector('#signup-form button');
    if (btn) { btn.textContent = '...'; btn.disabled = true; }
    try {
        const { data, error } = await db.auth.signUp({ email, password, options: { data: { full_name: name } } });
        if (btn) { btn.innerHTML = 'إنشاء الحساب ✨'; btn.disabled = false; }
        if (error) {
            const msg = error.message?.includes('already registered') || error.message?.includes('already been registered')
                ? 'البريد مسجّل بالفعل — جرب تسجيل الدخول'
                : error.message;
            return toast(msg, 'error');
        }
        // Supabase قد يطلب تأكيد الإيميل
        if (data?.user && !data.session) {
            closeAuthModal();
            return toast('تحقق من بريدك لتفعيل الحساب 📧', 'info');
        }
        closeAuthModal();
        toast('مرحباً بك في Elite! 🎊', 'success');
    } catch (e) {
        if (btn) { btn.innerHTML = 'إنشاء الحساب ✨'; btn.disabled = false; }
        console.error('Signup error:', e);
        toast('خطأ في الاتصال، حاول مرة أخرى', 'error');
    }
}

async function handleLogout() {
    stopRealtime();
    notificationsCache = [];
    unreadCount = 0;
    updateNotifBadge();
    await db.auth.signOut();
    currentUser = null;
    updateUIForAuth();
    navigateTo('timeline');
    toast('إلى اللقاء! 👋', 'info');
}

db.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user ?? null;
    updateUIForAuth();

    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (bootComplete) {
            if (event === 'SIGNED_IN') {
                fetchPosts();
                fetchNotifications();
                startNotificationsRealtime();
            }
            // TOKEN_REFRESHED — الـ UI بيتحدث تلقائياً بـ updateUIForAuth فوق
        }
    } else if (event === 'SIGNED_OUT') {
        stopRealtime();
        allPostsCache   = [];
        userVotesCache  = {};
        renderTimeline();
        updateNotifBadge();
    }
});

function updateUIForAuth() {
    const loggedIn = !!currentUser;

    document.getElementById('auth-toggle-btn')?.classList.toggle('hidden', loggedIn);
    document.getElementById('user-profile-card')?.classList.toggle('hidden', !loggedIn);
    document.getElementById('composer-logged-in')?.classList.toggle('hidden', !loggedIn);
    document.getElementById('composer-logged-out')?.classList.toggle('hidden', loggedIn);

    // Mobile top bar: hide login btn when logged in, show avatar
    const mobAuthArea = document.getElementById('mob-auth-area');
    if (mobAuthArea) {
        if (loggedIn && currentUser) {
            const name = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'م';
            mobAuthArea.innerHTML = `<div style="display:flex;align-items:center;gap:8px">
                <div style="width:30px;height:30px;border-radius:50%;background:${getColor(name)};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:.78rem;color:#fff;cursor:pointer" onclick="navigateTo('profile')">${getInitial(name)}</div>
            </div>`;
        } else {
            mobAuthArea.innerHTML = `<button id="mob-auth-btn" onclick="openAuthModal()" style="background:var(--dark);color:#fff;border:none;padding:7px 16px;border-radius:20px;font-size:.78rem;font-weight:700;cursor:pointer"><i class="fa-solid fa-bolt"></i> دخول</button>`;
        }
    }

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
    // إعادة ضبط pagination
    currentOffset = 0;
    hasMorePosts  = true;
    showSkeletons(4);

    const { data, error } = await db.from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .range(0, PAGE_SIZE - 1);

    if (error) { console.error('fetchPosts:', error); return; }
    allPostsCache = data || [];
    hasMorePosts  = data?.length === PAGE_SIZE;

    // جلب تصويتات المستخدم الحالي لتلوين الأسهم
    await loadUserVotes(allPostsCache.map(p => p.id));

    renderTimeline();
    updateStats();
}

async function loadMorePosts() {
    if (isFetchingMore || !hasMorePosts) return;
    isFetchingMore = true;

    // أظهر مؤشر تحميل
    const sentinel = document.getElementById('scroll-sentinel');
    if (sentinel) sentinel.innerHTML =
        '<div style="text-align:center;padding:16px;color:var(--muted);font-size:.82rem"><i class="fa-solid fa-spinner fa-spin"></i> تحميل المزيد...</div>';

    currentOffset += PAGE_SIZE;
    const { data, error } = await db.from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .range(currentOffset, currentOffset + PAGE_SIZE - 1);

    isFetchingMore = false;

    if (error || !data?.length) {
        hasMorePosts = false;
        if (sentinel) sentinel.innerHTML =
            '<div style="text-align:center;padding:16px;color:var(--muted);font-size:.78rem">لا توجد منشورات أخرى</div>';
        return;
    }

    hasMorePosts = data.length === PAGE_SIZE;

    // جلب تصويتات للمنشورات الجديدة
    await loadUserVotes(data.map(p => p.id));

    // إضافة للكاش
    allPostsCache = [...allPostsCache, ...data];

    // إضافة للـ DOM مباشرة بدون إعادة رندر
    const container = document.getElementById('posts-container');
    if (container && sentinel) {
        const fragment = document.createDocumentFragment();
        data.forEach((post, idx) => {
            const tmp = document.createElement('div');
            tmp.innerHTML = postCard(post, false);
            const el = tmp.firstElementChild;
            el.style.opacity   = '0';
            el.style.transform = 'translateY(12px)';
            fragment.appendChild(el);
        });
        container.insertBefore(fragment, sentinel);
        // Animate them in
        const newCards = container.querySelectorAll('.post-card[style*="opacity: 0"]');
        newCards.forEach((card, i) => {
            setTimeout(() => {
                card.style.transition = 'opacity .3s, transform .3s';
                card.style.opacity    = '1';
                card.style.transform  = 'translateY(0)';
            }, i * 40);
        });
        bindVoteEvents();
    }

    if (!hasMorePosts && sentinel) {
        sentinel.innerHTML =
            '<div style="text-align:center;padding:16px;color:var(--muted);font-size:.78rem">وصلت لآخر المنشورات ✓</div>';
    } else if (sentinel) {
        sentinel.innerHTML = '';
    }
}

async function loadUserVotes(postIds) {
    if (!currentUser || !postIds.length) return;
    const { data: votes } = await db.from('post_votes')
        .select('post_id, vote_type')
        .eq('user_id', currentUser.id)
        .in('post_id', postIds);
    (votes || []).forEach(v => { userVotesCache[v.post_id] = v.vote_type; });
}

function initInfiniteScroll() {
    const sentinel = document.getElementById('scroll-sentinel');
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && currentTab === 'latest') {
            loadMorePosts();
        }
    }, { rootMargin: '200px' });
    observer.observe(sentinel);
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

function skeletonCard() {
    return `<div class="card post-card skeleton-card" style="pointer-events:none">
        <div style="display:flex;gap:12px">
            <div class="skel skel-av"></div>
            <div style="flex:1;min-width:0">
                <div style="display:flex;gap:8px;margin-bottom:10px">
                    <div class="skel" style="width:90px;height:13px;border-radius:6px"></div>
                    <div class="skel" style="width:50px;height:13px;border-radius:6px"></div>
                </div>
                <div class="skel" style="width:100%;height:13px;border-radius:6px;margin-bottom:8px"></div>
                <div class="skel" style="width:85%;height:13px;border-radius:6px;margin-bottom:8px"></div>
                <div class="skel" style="width:60%;height:13px;border-radius:6px;margin-bottom:14px"></div>
                <div style="display:flex;gap:8px">
                    <div class="skel" style="width:56px;height:28px;border-radius:20px"></div>
                    <div class="skel" style="width:56px;height:28px;border-radius:20px"></div>
                    <div class="skel" style="width:56px;height:28px;border-radius:20px"></div>
                </div>
            </div>
        </div>
    </div>`;
}

function showSkeletons(count = 4) {
    const container = document.getElementById('posts-container');
    if (!container) return;
    container.innerHTML = Array(count).fill(0).map(skeletonCard).join('');
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
        bindVoteEvents();
        return;
    }
    scrollY = window.scrollY;
    container.innerHTML = posts.map((post, idx) => postCard(post, currentTab === 'top' && idx === 0)).join('');
    window.scrollTo(0, scrollY);
    bindVoteEvents();
}

// دالة بطاقة المنشور - التاج الآن بجانب الاسم داخل نفس الصف
function postCard(post, isTopPost = false) {
    const name    = post.author_name || 'مجهول';
    const net     = (post.upvotes||0) - (post.downvotes||0);
    const netSign = net >= 0 ? '+' : '';
    const isOwner = currentUser?.id === post.user_id;
    const content = esc(post.content).replace(/#(\S+)/g,
        '<span style="color:var(--accent2);cursor:pointer;font-weight:700" onclick="filterByTag(\'$1\')">#$1</span>');

    const topClass  = isTopPost ? 'golden-post' : '';
    const crownHtml = isTopPost ? '<span style="font-size:1rem; margin-right:4px;">👑</span>' : '';

    // تحديد حالة التصويت الحالية لتلوين الأسهم
    const myVote    = userVotesCache[post.id] || null;
    const upClass   = myVote === 'upvote'   ? ' voted' : '';
    const downClass = myVote === 'downvote' ? ' voted' : '';

    return `<div class="card post-card fade-up ${topClass}" data-id="${post.id}" style="position:relative; ${isTopPost ? 'border:2px solid #FFD700; box-shadow:0 0 20px rgba(255,215,0,0.5);' : ''}">
        <div style="display:flex;gap:12px">
            ${avatar(name, 'av-sm')}
            <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
                        <span style="font-weight:800;font-size:.88rem;color:var(--dark);cursor:pointer" 
                              onclick="event.stopPropagation();openPublicProfile('${post.user_id}','${esc(name).replace(/'/g,'\\'+'\'')}')">${esc(name)}</span>
                        ${crownHtml}
                        <span style="font-size:.72rem;color:var(--muted)">${fmtDate(post.created_at)}</span>
                    </div>
                    ${isOwner ? `<button onclick="deletePost('${post.id}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.8rem;padding:4px 6px;border-radius:8px" title="حذف"><i class="fa-regular fa-trash-can"></i></button>` : ''}
                </div>
                <p style="font-size:.88rem;line-height:1.7;color:#2a2a2a;white-space:pre-wrap;margin:0 0 12px">${content}</p>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <button class="reaction-btn vote-up${upClass}" data-id="${post.id}" data-type="up">
                        <i class="fa-solid fa-arrow-up"></i>
                        <span class="up-count">${fmtNum(post.upvotes||0)}</span>
                    </button>
                    <button class="reaction-btn vote-down${downClass}" data-id="${post.id}" data-type="down">
                        <i class="fa-solid fa-arrow-down"></i>
                        <span class="down-count">${fmtNum(post.downvotes||0)}</span>
                    </button>
                    <button class="reaction-btn comment-btn" data-id="${post.id}" onclick="openComments(${post.id})">
                        <i class="fa-regular fa-comment"></i>
                        <span class="comment-count-${post.id}">${fmtNum(post.comment_count||0)}</span>
                    </button>
                    <button class="reaction-btn" onclick="sharePost(${post.id})" style="margin-right:auto" title="مشاركة">
                        <i class="fa-solid fa-share-nodes"></i>
                    </button>
                    <span class="net-score" style="display:none">${netSign}${net}</span>
                </div>
            </div>
        </div>
    </div>`;
}
// ── التصويت: يستخدم post_votes للتتبع + يمنع التصويت المكرر + يدعم إلغاء التصويت ──
async function handleVote(postId, type) {
    if (!currentUser) { openAuthModal(); return; }

    postId = Number(postId); // data-id دايماً string من getAttribute، الكاش يخزنه number
    const voteType = type === 'up' ? 'upvote' : 'downvote';
    const post     = allPostsCache.find(p => p.id === postId);
    if (!post) return;
    const index    = allPostsCache.findIndex(p => p.id === postId);

    // تحقق من التصويت الحالي للمستخدم على هذا المنشور
    const { data: existingVote } = await db
        .from('post_votes')
        .select('id, vote_type')
        .eq('post_id', postId)
        .eq('user_id', currentUser.id)
        .maybeSingle();

    let upDelta   = 0;
    let downDelta = 0;
    let action    = '';

    if (existingVote) {
        if (existingVote.vote_type === voteType) {
            // نفس التصويت → إلغاء
            const { error } = await db.from('post_votes').delete().eq('id', existingVote.id);
            if (error) { toast('فشل إلغاء التصويت', 'error'); return; }
            if (voteType === 'upvote')   upDelta   = -1;
            else                         downDelta = -1;
            action = 'cancel';
        } else {
            // تصويت معاكس → تغيير
            const { error } = await db.from('post_votes')
                .update({ vote_type: voteType })
                .eq('id', existingVote.id);
            if (error) { toast('فشل تغيير التصويت', 'error'); return; }
            if (voteType === 'upvote') { upDelta = 1; downDelta = -1; }
            else                       { upDelta = -1; downDelta = 1; }
            action = 'change';
        }
    } else {
        // تصويت جديد
        const { error } = await db.from('post_votes').insert({
            post_id:   postId,
            user_id:   currentUser.id,
            vote_type: voteType,
        });
        if (error) { toast('فشل التصويت: ' + error.message, 'error'); return; }
        if (voteType === 'upvote') upDelta = 1;
        else                       downDelta = 1;
        action = 'add';
        // إشعار upvote فقط
        if (voteType === 'upvote') {
            const actorName = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'مستخدم';
            createNotification('upvote', post.id, post.user_id, actorName,
                `أعجب بمنشورك: "${post.content.slice(0,40)}${post.content.length>40?'...':''}"`);
        }
    }

    // تحديث العدادات في DB (الصلاحية ليست مشكلة لأن الكاتب هو صاحب المنشور فقط)
    // نستخدم قيم مطلقة من الكاش + الدلتا لتجنب race conditions
    const newUpvotes   = Math.max(0, (post.upvotes   || 0) + upDelta);
    const newDownvotes = Math.max(0, (post.downvotes || 0) + downDelta);

    const { error: updateErr } = await db.rpc('increment_votes', {
        p_post_id:   postId,
        p_up_delta:  upDelta,
        p_down_delta: downDelta,
    });

    // إذا لم تكن الـ RPC موجودة نستخدم update مباشر (fallback)
    if (updateErr) {
        await db.from('posts')
            .update({ upvotes: newUpvotes, downvotes: newDownvotes })
            .eq('id', postId);
    }

    // تحديث الكاش
    post.upvotes   = newUpvotes;
    post.downvotes = newDownvotes;
    if (index !== -1) allPostsCache[index] = post;

    // تحديث DOM مباشرة بدون إعادة رندر كامل
    const postElement = document.querySelector(`.post-card[data-id="${postId}"]`);
    if (postElement) {
        const upSpan   = postElement.querySelector('.up-count');
        const downSpan = postElement.querySelector('.down-count');
        const netSpan  = postElement.querySelector('.net-score');
        if (upSpan)   upSpan.innerText   = fmtNum(newUpvotes);
        if (downSpan) downSpan.innerText = fmtNum(newDownvotes);
        if (netSpan) {
            const net = newUpvotes - newDownvotes;
            netSpan.innerText = `${net >= 0 ? '+' : ''}${net}`;
        }
        // تمييز زر التصويت النشط
        const upBtn   = postElement.querySelector('.vote-up');
        const downBtn = postElement.querySelector('.vote-down');
        if (upBtn)   upBtn.classList.toggle('voted',   action !== 'cancel' && voteType === 'upvote');
        if (downBtn) downBtn.classList.toggle('voted', action !== 'cancel' && voteType === 'downvote');
        // نبضة animation على الزر
        const activeBtn = voteType === 'upvote' ? upBtn : downBtn;
        if (activeBtn && action !== 'cancel') {
            activeBtn.classList.add('vote-pulse');
            setTimeout(() => activeBtn.classList.remove('vote-pulse'), 350);
        }
    }

    // إعادة الترتيب إذا كنا في تبويب top
    if (currentTab === 'top') {
        const newSorted = getSortedPosts();
        const firstId   = document.querySelector('.post-card')?.getAttribute('data-id');
        if (firstId && String(newSorted[0]?.id) !== String(firstId)) {
            renderTimeline();
        }
    }

    // إشعار صاحب البوست عند التصويت بالأعلى (مرة واحدة فقط، مش عند الإلغاء)
    if (action === 'add' && voteType === 'upvote') {
        const postOwner = allPostsCache.find(p => p.id === postId);
        if (postOwner && postOwner.user_id !== currentUser.id) {
            const myName = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'شخص';
            
        }
    }

    // تحديث userVotesCache
    if (action === 'cancel') {
        delete userVotesCache[postId];
    } else {
        userVotesCache[postId] = voteType;
    }

    const emoji = action === 'cancel' ? '↩️' : type === 'up' ? '⬆️' : '⬇️';
    toast(action === 'cancel' ? 'تم إلغاء التصويت' : `تم التصويت ${emoji}`, 'success');
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
    // تحقق من الـ session أولاً — ممكن تكون انتهت على الموبايل
    const { data: { session } } = await db.auth.getSession();
    currentUser = session?.user ?? null;
    if (!currentUser) { updateUIForAuth(); return openAuthModal(); }

    const ta      = document.getElementById('post-textarea');
    const postContent = ta?.value?.trim();
    if (!postContent) return toast('اكتب شيئاً أولاً!', 'error');
    const btn = document.getElementById('post-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    const name = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'مستخدم';
    const { error } = await db.from('posts').insert({
        content:     postContent,
        user_id:     currentUser.id,
        author_name: name,
        upvotes:     0,
        downvotes:   0,
    });
    if (btn) { btn.disabled = false; btn.innerHTML = 'نشر <i class="fa-solid fa-paper-plane"></i>'; }
    if (error) {
        if (error.message?.includes('JWT') || error.message?.includes('token') || error.code === 'PGRST301') {
            toast('انتهت الجلسة — سجّل دخولك مرة أخرى', 'error');
            currentUser = null;
            updateUIForAuth();
            openAuthModal();
        } else {
            toast('فشل النشر: ' + error.message, 'error');
        }
        return;
    }
    ta.value = '';
    toast('تم النشر! ✅', 'success');
    fetchPosts();
}

async function deletePost(postId) {
    if (!currentUser) return;
    if (!confirm('حذف هذا المنشور؟')) return;

    // إزالة فورية من الـ DOM قبل ما نستنى الـ server
    const postEl = document.querySelector(`.post-card[data-id="${postId}"]`);
    if (postEl) {
        postEl.style.transition = 'opacity .2s, transform .2s';
        postEl.style.opacity    = '0';
        postEl.style.transform  = 'scale(.97)';
        setTimeout(() => postEl.remove(), 200);
    }

    // إزالة من الكاش فوراً
    allPostsCache = allPostsCache.filter(p => String(p.id) !== String(postId));
    updateStats();

    const { error } = await db.from('posts').delete().eq('id', postId).eq('user_id', currentUser.id);
    if (error) {
        toast('فشل الحذف', 'error');
        fetchPosts();
        return;
    }
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
// PUBLIC PROFILE
// ══════════════════════════════════════════════════════════════════════════════

let publicProfileUserId = null;

function openPublicProfile(userId, userName) {
    if (!userId) return;
    publicProfileUserId = userId;
    const modal = document.getElementById('public-profile-modal');
    if (!modal) return;

    // header placeholder
    const color   = getColor(userName);
    const initial = getInitial(userName);
    document.getElementById('pp-avatar').style.background = color;
    document.getElementById('pp-avatar').textContent      = initial;
    document.getElementById('pp-name').textContent        = userName;
    document.getElementById('pp-posts-count').textContent = '...';
    document.getElementById('pp-votes-count').textContent = '...';
    document.getElementById('pp-posts-list').innerHTML    =
        '<div style="text-align:center;padding:24px;color:var(--muted)"><i class="fa-solid fa-spinner fa-spin"></i></div>';

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    loadPublicProfilePosts(userId);
}

async function loadPublicProfilePosts(userId) {
    const { data, error } = await db.from('posts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30);

    if (error || !data) return;

    const totalVotes = data.reduce((s, p) => s + (p.upvotes || 0), 0);
    document.getElementById('pp-posts-count').textContent = fmtNum(data.length);
    document.getElementById('pp-votes-count').textContent = fmtNum(totalVotes);

    const listEl = document.getElementById('pp-posts-list');
    if (!data.length) {
        listEl.innerHTML = '<p style="text-align:center;color:var(--muted);padding:24px;font-size:.85rem">لا توجد منشورات بعد</p>';
        return;
    }
    listEl.innerHTML = data.map(p => {
        const net = (p.upvotes||0) - (p.downvotes||0);
        return `<div style="padding:14px 0;border-bottom:1px solid var(--border)">
            <p style="font-size:.86rem;line-height:1.65;color:#2a2a2a;margin:0 0 8px;white-space:pre-wrap">${esc(p.content)}</p>
            <div style="display:flex;align-items:center;gap:12px">
                <span style="font-size:.72rem;color:var(--muted)">${fmtDate(p.created_at)}</span>
                <span style="font-size:.75rem;color:#22c55e;font-weight:700">
                    <i class="fa-solid fa-arrow-up"></i> ${p.upvotes||0}
                </span>
                <span style="font-size:.75rem;color:var(--muted);font-weight:700">
                    <i class="fa-regular fa-comment"></i> ${p.comment_count||0}
                </span>
            </div>
        </div>`;
    }).join('');
}

function closePublicProfile() {
    document.getElementById('public-profile-modal')?.classList.add('hidden');
    document.body.style.overflow = '';
    publicProfileUserId = null;
}

// ══════════════════════════════════════════════════════════════════════════════
// SEARCH
// ══════════════════════════════════════════════════════════════════════════════

let searchTimeout = null;

function openSearch() {
    const modal = document.getElementById('search-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('search-input')?.focus(), 100);
    renderSearchResults('');
}

function closeSearch() {
    document.getElementById('search-modal')?.classList.add('hidden');
    document.body.style.overflow = '';
    const inp = document.getElementById('search-input');
    if (inp) inp.value = '';
}

function onSearchInput(val) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => renderSearchResults(val.trim()), 200);
}

function renderSearchResults(q) {
    const container = document.getElementById('search-results');
    if (!container) return;

    if (!q) {
        // عرض المنشورات الأحدث كـ suggestions
        const recent = allPostsCache.slice(0, 5);
        if (!recent.length) {
            container.innerHTML = `<p style="text-align:center;color:var(--muted);padding:32px;font-size:.85rem">ابدأ الكتابة للبحث...</p>`;
            return;
        }
        container.innerHTML = `<div style="padding:10px 16px 6px"><span style="font-size:.68rem;font-weight:800;color:var(--muted);letter-spacing:1px;text-transform:uppercase">الأحدث</span></div>`
            + recent.map(p => searchResultCard(p)).join('');
        return;
    }

    const lower = q.toLowerCase();
    const results = allPostsCache.filter(p =>
        p.content?.toLowerCase().includes(lower) ||
        p.author_name?.toLowerCase().includes(lower)
    );

    if (!results.length) {
        container.innerHTML = `<div style="text-align:center;padding:40px 20px">
            <div style="font-size:2rem;margin-bottom:8px">🔍</div>
            <p style="color:var(--muted);font-size:.85rem">لا نتائج لـ "${esc(q)}"</p>
        </div>`;
        return;
    }

    container.innerHTML = `<div style="padding:10px 16px 6px"><span style="font-size:.68rem;font-weight:800;color:var(--muted);letter-spacing:1px">${results.length} نتيجة</span></div>`
        + results.slice(0, 20).map(p => searchResultCard(p)).join('');
}

function searchResultCard(p) {
    const name = p.author_name || 'مجهول';
    const preview = p.content.length > 90 ? p.content.slice(0, 90) + '...' : p.content;
    return `<div onclick="goToPost(${p.id})" style="display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s"
                 onmouseenter="this.style.background='#f7f4ef'" onmouseleave="this.style.background=''">
        ${avatar(name, 'av-sm')}
        <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
                <span style="font-size:.8rem;font-weight:800;color:var(--dark)">${esc(name)}</span>
                <span style="font-size:.7rem;color:var(--muted)">${fmtDate(p.created_at)}</span>
            </div>
            <p style="font-size:.82rem;color:#444;margin:0;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(preview)}</p>
        </div>
    </div>`;
}

function goToPost(postId) {
    closeSearch();
    navigateTo('timeline');
    setTimeout(() => {
        const el = document.querySelector(`.post-card[data-id="${postId}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.transition = 'box-shadow .3s';
            el.style.boxShadow  = '0 0 0 3px var(--accent)';
            setTimeout(() => el.style.boxShadow = '', 2000);
        }
    }, 300);
}

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

async function fetchNotifications() {
    if (!currentUser) return;
    const { data } = await db.from('notifications')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(30);
    notificationsCache = data || [];
    unreadCount = notificationsCache.filter(n => !n.is_read).length;
    updateNotifBadge();
}

function updateNotifBadge() {
    const badges = document.querySelectorAll('.notif-badge');
    badges.forEach(b => {
        b.textContent  = unreadCount > 9 ? '9+' : unreadCount;
        b.style.display = unreadCount > 0 ? 'flex' : 'none';
    });
}

async function markAllNotifsRead() {
    if (!currentUser || !unreadCount) return;
    await db.from('notifications')
        .update({ is_read: true })
        .eq('user_id', currentUser.id)
        .eq('is_read', false);
    notificationsCache.forEach(n => n.is_read = true);
    unreadCount = 0;
    updateNotifBadge();
    renderNotifications();
}

function openNotifications() {
    const modal = document.getElementById('notif-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    renderNotifications();
    if (unreadCount > 0) markAllNotifsRead();
}

function closeNotifications() {
    document.getElementById('notif-modal')?.classList.add('hidden');
    document.body.style.overflow = '';
}

function renderNotifications() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    if (!notificationsCache.length) {
        list.innerHTML = `<div style="text-align:center;padding:48px 20px">
            <div style="font-size:2.5rem;margin-bottom:10px">🔔</div>
            <p style="color:var(--muted);font-size:.85rem">لا توجد إشعارات بعد</p>
        </div>`;
        return;
    }
    list.innerHTML = notificationsCache.map(n => {
        const icon = n.type === 'comment' ? '💬' : n.type === 'upvote' ? '⬆️' : '🔔';
        const bg   = n.is_read ? '' : 'background:#fff8f6;';
        return `<div class="notif-item ${n.is_read ? '' : 'notif-unread'}" 
                     style="${bg}display:flex;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s"
                     onmouseenter="this.style.background='#f7f4ef'"
                     onmouseleave="this.style.background='${n.is_read ? '' : '#fff8f6'}'"
                     onclick="handleNotifClick(${n.post_id})">
            <div style="font-size:1.3rem;flex-shrink:0;margin-top:2px">${icon}</div>
            <div style="flex:1;min-width:0">
                <p style="font-size:.84rem;font-weight:700;color:var(--dark);margin:0 0 3px">${esc(n.actor_name || 'مستخدم')}</p>
                <p style="font-size:.78rem;color:var(--muted);margin:0;line-height:1.5">${esc(n.message || '')}</p>
                <p style="font-size:.68rem;color:var(--muted);margin:4px 0 0">${fmtDate(n.created_at)}</p>
            </div>
            ${!n.is_read ? '<div style="width:8px;height:8px;background:var(--accent);border-radius:50%;flex-shrink:0;margin-top:6px"></div>' : ''}
        </div>`;
    }).join('');
}

function handleNotifClick(postId) {
    closeNotifications();
    if (!postId) return;
    navigateTo('timeline');
    setTimeout(() => {
        const el = document.querySelector(`.post-card[data-id="${postId}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.transition = 'box-shadow .3s';
            el.style.boxShadow  = '0 0 0 3px var(--accent)';
            setTimeout(() => el.style.boxShadow = '', 2000);
        }
    }, 300);
}

async function createNotification(type, postId, postOwnerId, actorName, message) {
    if (!postOwnerId || postOwnerId === currentUser?.id) return; // لا إشعار لنفسك
    await db.from('notifications').insert({
        user_id:    postOwnerId,
        actor_id:   currentUser.id,
        actor_name: actorName,
        type,
        post_id:    postId,
        message,
        is_read:    false,
    });
}

function startNotificationsRealtime() {
    if (!currentUser) return;
    const ch = db.channel(`notif-${currentUser.id}`)
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'notifications',
              filter: `user_id=eq.${currentUser.id}` },
            (payload) => {
                notificationsCache.unshift(payload.new);
                unreadCount++;
                updateNotifBadge();
                // نبضة على الجرس
                document.querySelectorAll('.notif-bell').forEach(b => {
                    b.classList.add('bell-ring');
                    setTimeout(() => b.classList.remove('bell-ring'), 600);
                });
            }
        )
        .subscribe();
    realtimeChannels.push(ch);
}

// ══════════════════════════════════════════════════════════════════════════════
// REALTIME — Supabase channels للتحديث الفوري
// ══════════════════════════════════════════════════════════════════════════════

function startRealtime() {
    stopRealtime(); // cleanup أي channels قديمة

    // ── Channel 1: Posts (insert / update / delete) ──
    const postsCh = db.channel('posts-changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'posts' },
            (payload) => {
                if (payload.eventType === 'INSERT') {
                    // لا تضيف بوست نفس المستخدم مرتين (هو بيضيفه optimistically)
                    if (currentUser && payload.new.user_id === currentUser.id) return;
                    allPostsCache.unshift(payload.new);
                    renderTimeline();
                    updateStats();
                } else if (payload.eventType === 'UPDATE') {
                    const idx = allPostsCache.findIndex(p => p.id === payload.new.id);
                    if (idx !== -1) {
                        allPostsCache[idx] = { ...allPostsCache[idx], ...payload.new };
                        // تحديث DOM بدون إعادة رندر كامل
                        const el = document.querySelector(`.post-card[data-id="${payload.new.id}"]`);
                        if (el) {
                            const up   = el.querySelector('.up-count');
                            const down = el.querySelector('.down-count');
                            const net  = el.querySelector('.net-score');
                            if (up)   up.innerText   = fmtNum(payload.new.upvotes   || 0);
                            if (down) down.innerText = fmtNum(payload.new.downvotes || 0);
                            if (net) {
                                const n = (payload.new.upvotes||0)-(payload.new.downvotes||0);
                                net.innerText = `${n>=0?'+':''}${n}`;
                            }
                            // comment_count
                            const cc = el.querySelector(`.comment-count-${payload.new.id}`);
                            if (cc) cc.innerText = fmtNum(payload.new.comment_count || 0);
                        }
                    }
                } else if (payload.eventType === 'DELETE') {
                    allPostsCache = allPostsCache.filter(p => p.id !== payload.old.id);
                    const el = document.querySelector(`.post-card[data-id="${payload.old.id}"]`);
                    if (el) {
                        el.style.transition = 'opacity .25s, transform .25s';
                        el.style.opacity    = '0';
                        el.style.transform  = 'scale(.97)';
                        setTimeout(() => el.remove(), 250);
                    }
                    updateStats();
                }
            }
        )
        .subscribe();

    realtimeChannels.push(postsCh);
}

function startCommentsRealtime(postId) {
    // أوقف أي channel تعليقات قديم
    const old = realtimeChannels.find(c => c.topic?.includes('comments-'));
    if (old) { db.removeChannel(old); realtimeChannels = realtimeChannels.filter(c => c !== old); }

    const commentsCh = db.channel(`comments-${postId}`)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` },
            (payload) => {
                if (!commentsCache[postId]) commentsCache[postId] = [];

                if (payload.eventType === 'INSERT') {
                    // تجاهل لو هو نفس المستخدم أضافه (optimistic update موجود)
                    if (currentUser && payload.new.user_id === currentUser.id) return;
                    commentsCache[postId].push(payload.new);

                    const list = document.getElementById('comments-list');
                    if (list && activeCommentsPostId === postId) {
                        // شيل placeholder لو موجود
                        if (list.querySelector('[style*="padding:40px"]')) list.innerHTML = '';
                        const tmp = document.createElement('div');
                        tmp.innerHTML = commentCard(payload.new);
                        const el = tmp.firstElementChild;
                        el.style.opacity   = '0';
                        el.style.transform = 'translateY(8px)';
                        list.appendChild(el);
                        requestAnimationFrame(() => {
                            el.style.transition = 'opacity .2s, transform .2s';
                            el.style.opacity    = '1';
                            el.style.transform  = 'translateY(0)';
                        });
                        list.scrollTop = list.scrollHeight;
                    }
                    // تحديث عداد التعليقات
                    const count = commentsCache[postId].length;
                    const cc = document.querySelector(`.comment-count-${postId}`);
                    if (cc) cc.innerText = fmtNum(count);

                } else if (payload.eventType === 'DELETE') {
                    commentsCache[postId] = commentsCache[postId].filter(c => c.id !== payload.old.id);
                    const el = document.getElementById(`comment-${payload.old.id}`);
                    if (el) {
                        el.style.transition = 'opacity .2s';
                        el.style.opacity    = '0';
                        setTimeout(() => el.remove(), 200);
                    }
                }
            }
        )
        .subscribe();

    realtimeChannels.push(commentsCh);
}

function stopRealtime() {
    realtimeChannels.forEach(ch => db.removeChannel(ch));
    realtimeChannels = [];
}



// ══════════════════════════════════════════════════════════════════════════════
// COMMENTS SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

let activeCommentsPostId = null;
let commentsCache        = {};   // { postId: [comments] }

async function openComments(postId) {
    if (!currentUser) { openAuthModal(); return; }
    activeCommentsPostId = postId;

    const post = allPostsCache.find(p => p.id === postId);
    const modal = document.getElementById('comments-modal');
    const titleEl = document.getElementById('comments-post-preview');
    if (titleEl && post) {
        titleEl.textContent = post.content.length > 80
            ? post.content.slice(0, 80) + '...'
            : post.content;
    }

    document.getElementById('comments-list').innerHTML =
        '<div class="comments-loading"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</div>';
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // reset input
    const inp = document.getElementById('comment-input');
    if (inp) { inp.value = ''; inp.style.height = 'auto'; }

    await loadComments(postId);
    startCommentsRealtime(postId);
}

function closeComments() {
    document.getElementById('comments-modal').classList.add('hidden');
    document.body.style.overflow = '';
    activeCommentsPostId = null;
}

async function loadComments(postId) {
    const { data, error } = await db
        .from('comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

    if (error) {
        document.getElementById('comments-list').innerHTML =
            '<p style="text-align:center;color:#ef4444;padding:20px">فشل تحميل التعليقات</p>';
        return;
    }

    commentsCache[postId] = data || [];
    renderComments(postId);

    // تحديث عداد التعليقات في الكارد
    const countEl = document.querySelector(`.comment-count-${postId}`);
    if (countEl) countEl.innerText = fmtNum((data || []).length);
}

function renderComments(postId) {
    const list   = document.getElementById('comments-list');
    const comments = commentsCache[postId] || [];

    if (!comments.length) {
        list.innerHTML = `<div style="text-align:center;padding:40px 20px">
            <div style="font-size:2rem;margin-bottom:10px">💬</div>
            <p style="color:var(--muted);font-size:.85rem">لا توجد تعليقات بعد.<br>كن أول من يعلق!</p>
        </div>`;
        return;
    }

    list.innerHTML = comments.map(c => commentCard(c)).join('');
    // scroll to bottom
    list.scrollTop = list.scrollHeight;
}

function commentCard(c) {
    const name    = c.author_name || 'مجهول';
    const isOwner = currentUser?.id === c.user_id;
    const initials = getInitial(name);
    const color    = getColor(name);

    return `<div class="comment-item" id="comment-${c.id}">
        <div style="width:32px;height:32px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:.75rem;color:#fff;flex-shrink:0">${initials}</div>
        <div class="comment-bubble">
            <div class="comment-header">
                <span class="comment-author">${esc(name)}</span>
                <span class="comment-time">${fmtDate(c.created_at)}</span>
                ${isOwner ? `<button onclick="deleteComment(${c.id})" class="comment-delete-btn" title="حذف"><i class="fa-regular fa-trash-can"></i></button>` : ''}
            </div>
            <p class="comment-text">${esc(c.content)}</p>
        </div>
    </div>`;
}

async function submitComment() {
    if (!currentUser) { openAuthModal(); return; }
    const inp     = document.getElementById('comment-input');
    const content = inp?.value?.trim();
    if (!content || !activeCommentsPostId) return;

    const btn  = document.getElementById('comment-submit-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }

    const name = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'مستخدم';

    const { data, error } = await db.from('comments').insert({
        post_id:     activeCommentsPostId,
        user_id:     currentUser.id,
        author_name: name,
        content,
    }).select().single();

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>'; }

    if (error) { toast('فشل إرسال التعليق', 'error'); return; }

    // إشعار صاحب البوست
    const commentedPost = allPostsCache.find(p => p.id === activeCommentsPostId);
    if (commentedPost && commentedPost.user_id !== currentUser.id) {
        const actorN = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'مستخدم';
        createNotification('comment', commentedPost.id, commentedPost.user_id, actorN,
            `علّق على منشورك: "${content.slice(0,40)}${content.length>40?'...':''}"`);
    }

    inp.value = '';
    inp.style.height = 'auto';

    // إضافة فورية للكاش والـ DOM
    if (!commentsCache[activeCommentsPostId]) commentsCache[activeCommentsPostId] = [];
    commentsCache[activeCommentsPostId].push(data);

    const list = document.getElementById('comments-list');
    // إزالة placeholder لو موجود
    if (list.querySelector('[style*="padding:40px"]')) list.innerHTML = '';

    const tmp = document.createElement('div');
    tmp.innerHTML = commentCard(data);
    const el = tmp.firstElementChild;
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
    list.appendChild(el);
    requestAnimationFrame(() => {
        el.style.transition = 'opacity .25s, transform .25s';
        el.style.opacity    = '1';
        el.style.transform  = 'translateY(0)';
    });
    list.scrollTop = list.scrollHeight;

    // تحديث العداد في الكارد
    const count = commentsCache[activeCommentsPostId].length;
    const countEl = document.querySelector(`.comment-count-${activeCommentsPostId}`);
    if (countEl) countEl.innerText = fmtNum(count);
}

async function deleteComment(commentId) {
    if (!currentUser) return;
    const el = document.getElementById(`comment-${commentId}`);
    if (el) {
        el.style.transition = 'opacity .2s, transform .2s';
        el.style.opacity    = '0';
        el.style.transform  = 'scale(.97)';
        setTimeout(() => el.remove(), 200);
    }

    // إزالة من الكاش
    if (activeCommentsPostId && commentsCache[activeCommentsPostId]) {
        commentsCache[activeCommentsPostId] =
            commentsCache[activeCommentsPostId].filter(c => c.id !== commentId);
        const count = commentsCache[activeCommentsPostId].length;
        const countEl = document.querySelector(`.comment-count-${activeCommentsPostId}`);
        if (countEl) countEl.innerText = fmtNum(count);
    }

    const { error } = await db.from('comments').delete()
        .eq('id', commentId).eq('user_id', currentUser.id);
    if (error) { toast('فشل حذف التعليق', 'error'); loadComments(activeCommentsPostId); }
}



// ══════════════════════════════════════════════════════════════════════════════
// SHARE POST
// ══════════════════════════════════════════════════════════════════════════════

async function sharePost(postId) {
    const post = allPostsCache.find(p => p.id === postId);
    const text = post ? (post.content.length > 100 ? post.content.slice(0,100)+'...' : post.content) : '';
    const url  = `${location.origin}${location.pathname}?post=${postId}`;

    if (navigator.share) {
        try {
            await navigator.share({ title: 'Elite', text, url });
            return;
        } catch(e) { /* user cancelled */ return; }
    }
    // Fallback: copy to clipboard
    try {
        await navigator.clipboard.writeText(url);
        toast('تم نسخ الرابط 🔗', 'success');
    } catch(e) {
        toast('الرابط: ' + url, 'info');
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// DARK MODE
// ══════════════════════════════════════════════════════════════════════════════

function initDarkMode() {
    const saved = localStorage.getItem('elite-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved ? saved === 'dark' : prefersDark;
    applyTheme(isDark);
}

function toggleDarkMode() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    applyTheme(!isDark);
    localStorage.setItem('elite-theme', !isDark ? 'dark' : 'light');
}

function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    // تحديث أيقونة الزر
    document.querySelectorAll('.theme-toggle-icon').forEach(el => {
        el.className = `fa-solid ${dark ? 'fa-sun' : 'fa-moon'} theme-toggle-icon`;
    });
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
    handleVote,
    openComments, closeComments, submitComment, deleteComment,
    openSearch, closeSearch, onSearchInput, goToPost,
    openPublicProfile, closePublicProfile,
    openNotifications, closeNotifications, handleNotifClick,
    toggleDarkMode, sharePost,
});

// ══════════════════════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    initDarkMode();
    const { data: { session } } = await db.auth.getSession();
    currentUser = session?.user ?? null;
    updateUIForAuth();
    fetchPosts();
    startRealtime();
    initInfiniteScroll();
    if (currentUser) {
        fetchNotifications();
        startNotificationsRealtime();
    }

    // ربط زر النشر (بدون onclick في HTML)
    const postBtn = document.getElementById('post-submit-btn');
    if (postBtn) postBtn.addEventListener('click', createPost);

    // ربط أحداث التصويت
    bindVoteEvents();

    // فتح بوست محدد عبر URL param
    const urlPost = new URLSearchParams(location.search).get('post');
    if (urlPost) {
        setTimeout(() => {
            const el = document.querySelector(`.post-card[data-id="${urlPost}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.style.transition = 'box-shadow .3s';
                el.style.boxShadow  = '0 0 0 3px var(--accent)';
                setTimeout(() => el.style.boxShadow = '', 2500);
            }
        }, 800);
    }

    // التعامل مع زر Esc
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (!document.getElementById('search-modal')?.classList.contains('hidden'))       { closeSearch(); return; }
            if (!document.getElementById('public-profile-modal')?.classList.contains('hidden')) { closePublicProfile(); return; }
            if (!document.getElementById('notif-modal')?.classList.contains('hidden'))        { closeNotifications(); return; }
            if (!document.getElementById('comments-modal')?.classList.contains('hidden'))     { closeComments(); return; }
            if (!document.getElementById('create-room-modal')?.classList.contains('hidden'))  { hideCreateRoomModal(); return; }
            if (!document.getElementById('auth-modal')?.classList.contains('hidden'))         { closeAuthModal(); return; }
        }
    });

    // الـ boot خلص — دلوقتي onAuthStateChange يقدر يشغّل fetchPosts لما المستخدم يسجل دخول
    bootComplete = true;
});
