// ══════════════════════════════════════════════════════════════════════════════
// Pulse Live — Frontend Engine v20 (Clubhouse Rooms + Full Auth Fix)
// ══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL      = 'https://jnwqokkzywrctdjsdzbl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impud3Fva2t6eXdyY3RkanNkemJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTkxOTYsImV4cCI6MjA5NTM5NTE5Nn0.8RkJ2A1oJ9DaSD0Y8CdiNwvcfcr7iWyQZf5eKD3kpAo';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser   = null;
let allPostsCache = [];
let scrollPositionBeforeRender = 0;
let currentRoom       = null;
let currentRoomId     = null;
let currentRoomHostId = null;
let isCurrentUserHost = false;

// ══════════════════════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════════════════════
function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatNumber(n) {
    if (!n) return '0';
    if (n >= 1000) return (n/1000).toFixed(1) + 'k';
    return String(n);
}

function showStatusMessage(msg, type = 'info') {
    const toast = document.getElementById('status-msg');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden','bg-black','bg-green-600','bg-red-600');
    if (type === 'success') toast.classList.add('bg-green-600');
    else if (type === 'error') toast.classList.add('bg-red-600');
    else toast.classList.add('bg-black');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function preserveScrollBeforeRender() {
    scrollPositionBeforeRender = window.scrollY;
}
function restoreScrollAfterRender() {
    window.scrollTo(0, scrollPositionBeforeRender);
}

function sortPostsByNetVotes(posts) {
    return [...posts].sort((a, b) => ((b.upvotes||0)-(b.downvotes||0)) - ((a.upvotes||0)-(a.downvotes||0)));
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTER
// ══════════════════════════════════════════════════════════════════════════════
function navigateTo(view) {
    ['timeline','rooms','sandbox','profile'].forEach(v => {
        const el = document.getElementById(v + '-view');
        if (el) el.classList.add('hidden');
    });
    const target = document.getElementById(view + '-view');
    if (target) target.classList.remove('hidden');

    if (view === 'rooms')   fetchRooms();
    if (view === 'profile') renderProfilePage();
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH MODAL
// ══════════════════════════════════════════════════════════════════════════════
function openAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.add('hidden');
}

function switchToSignup() {
    document.getElementById('login-form')?.classList.add('hidden');
    document.getElementById('signup-form')?.classList.remove('hidden');
    const title = document.getElementById('auth-modal-title');
    if (title) title.textContent = 'إنشاء حساب جديد';
}

function switchToLogin() {
    document.getElementById('signup-form')?.classList.add('hidden');
    document.getElementById('login-form')?.classList.remove('hidden');
    const title = document.getElementById('auth-modal-title');
    if (title) title.textContent = 'تسجيل الدخول';
}

async function handleLogin() {
    const email    = document.getElementById('login-email')?.value?.trim();
    const password = document.getElementById('login-password')?.value;
    if (!email || !password) return showStatusMessage('أدخل البريد وكلمة المرور', 'error');
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) return showStatusMessage('خطأ: ' + error.message, 'error');
    closeAuthModal();
    showStatusMessage('أهلاً بك! 🎉', 'success');
}

async function handleSignup() {
    const name     = document.getElementById('signup-name')?.value?.trim();
    const email    = document.getElementById('signup-email')?.value?.trim();
    const password = document.getElementById('signup-password')?.value;
    if (!name || !email || !password) return showStatusMessage('يرجى تعبئة جميع الحقول', 'error');
    if (password.length < 6) return showStatusMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
    const { error } = await db.auth.signUp({ email, password, options: { data: { full_name: name } } });
    if (error) return showStatusMessage('خطأ: ' + error.message, 'error');
    closeAuthModal();
    showStatusMessage('تم إنشاء الحساب! مرحباً بك 🎊', 'success');
}

async function handleLogout() {
    await db.auth.signOut();
    currentUser = null;
    showStatusMessage('تم تسجيل الخروج', 'info');
    navigateTo('timeline');
    updateUIForAuth();
}

db.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user ?? null;
    updateUIForAuth();
    if (event === 'SIGNED_IN') fetchPosts();
});

function updateUIForAuth() {
    const isLoggedIn = !!currentUser;
    const authBtn        = document.getElementById('auth-toggle-btn');
    const profileCard    = document.getElementById('user-profile-card');
    const composerIn     = document.getElementById('composer-logged-in');
    const composerOut    = document.getElementById('composer-logged-out');

    if (authBtn)     authBtn.classList.toggle('hidden', isLoggedIn);
    if (profileCard) profileCard.classList.toggle('hidden', !isLoggedIn);
    if (composerIn)  composerIn.classList.toggle('hidden', !isLoggedIn);
    if (composerOut) composerOut.classList.toggle('hidden', isLoggedIn);

    if (isLoggedIn && currentUser) {
        const name    = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'مستخدم';
        const initial = name[0].toUpperCase();
        const nameEl  = document.getElementById('user-display-name');
        const avatarEl= document.getElementById('user-avatar-letter');
        if (nameEl)   nameEl.textContent   = name;
        if (avatarEl) avatarEl.textContent = initial;
    }
    updateStats();
}

// ══════════════════════════════════════════════════════════════════════════════
// POSTS
// ══════════════════════════════════════════════════════════════════════════════
async function fetchPosts() {
    const { data, error } = await db.from('posts').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) { console.error('fetchPosts:', error); return; }
    allPostsCache = data || [];
    renderTimeline(allPostsCache);
    updateStats();
}

async function createPost() {
    if (!currentUser) return openAuthModal();
    const ta = document.getElementById('post-textarea');
    const content = ta?.value?.trim();
    if (!content) return showStatusMessage('اكتب شيئاً أولاً!', 'error');
    const btn = document.getElementById('post-submit-btn');
    if (btn) btn.disabled = true;
    const name = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'مستخدم';
    const { error } = await db.from('posts').insert({
        content,
        user_id: currentUser.id,
        author_name: name,
        upvotes: 0,
        downvotes: 0,
    });
    if (btn) btn.disabled = false;
    if (error) return showStatusMessage('فشل النشر: ' + error.message, 'error');
    if (ta) ta.value = '';
    showStatusMessage('تم النشر! ✅', 'success');
    fetchPosts();
}

function renderTimeline(posts) {
    const container = document.getElementById('posts-container');
    if (!container) return;
    if (!posts || posts.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa;font-size:0.9rem">لا توجد منشورات بعد. كن أول من يشارك! 🚀</div>';
        return;
    }
    preserveScrollBeforeRender();
    const sorted = sortPostsByNetVotes(posts);
    container.innerHTML = sorted.map(post => {
        const net     = (post.upvotes||0) - (post.downvotes||0);
        const date    = new Date(post.created_at).toLocaleDateString('ar-EG', { month:'short', day:'numeric' });
        const initial = (post.author_name||'م')[0].toUpperCase();
        const isOwner = currentUser && currentUser.id === post.user_id;
        return `<div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 fade-in">
            <div class="flex items-start gap-3">
                <div class="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center font-black text-sm shrink-0">${initial}</div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="font-bold text-sm text-black truncate">${esc(post.author_name||'مجهول')}</span>
                        <span class="text-xs text-gray-400 shrink-0">${date}</span>
                    </div>
                    <p class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">${esc(post.content)}</p>
                    <div class="flex items-center gap-3 mt-3">
                        <button onclick="handleVote('${post.id}','up')" class="flex items-center gap-1 text-xs text-gray-500 hover:text-green-600 transition font-bold">
                            <i class="fa-solid fa-arrow-up"></i> ${formatNumber(post.upvotes||0)}
                        </button>
                        <button onclick="handleVote('${post.id}','down')" class="flex items-center gap-1 text-xs text-gray-500 hover:text-red-500 transition font-bold">
                            <i class="fa-solid fa-arrow-down"></i> ${formatNumber(post.downvotes||0)}
                        </button>
                        <span class="text-xs text-gray-400 font-bold ml-auto">${net >= 0 ? '+' : ''}${net}</span>
                        ${isOwner ? `<button onclick="deletePost('${post.id}')" class="text-xs text-gray-300 hover:text-red-400 transition"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
    restoreScrollAfterRender();
}

async function handleVote(postId, voteType) {
    if (!currentUser) return openAuthModal();
    const field = voteType === 'up' ? 'upvotes' : 'downvotes';
    const post  = allPostsCache.find(p => p.id === postId);
    if (!post) return;
    const newVal = (post[field]||0) + 1;
    const { error } = await db.from('posts').update({ [field]: newVal }).eq('id', postId);
    if (error) return showStatusMessage('فشل التصويت', 'error');
    post[field] = newVal;
    renderTimeline(allPostsCache);
}

async function deletePost(postId) {
    if (!currentUser) return;
    if (!confirm('هل تريد حذف هذا المنشور؟')) return;
    const { error } = await db.from('posts').delete().eq('id', postId).eq('user_id', currentUser.id);
    if (error) return showStatusMessage('فشل الحذف: ' + error.message, 'error');
    allPostsCache = allPostsCache.filter(p => p.id !== postId);
    renderTimeline(allPostsCache);
    showStatusMessage('تم الحذف', 'info');
}

async function submitComment(postId) {
    // placeholder — extend if comments table exists
    showStatusMessage('التعليقات قريباً!', 'info');
}

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE
// ══════════════════════════════════════════════════════════════════════════════
function renderProfilePage() {
    if (!currentUser) return navigateTo('timeline');
    const name    = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'مستخدم';
    const initial = name[0].toUpperCase();
    const nameEl  = document.getElementById('profile-display-name');
    const userEl  = document.getElementById('profile-username');
    const avatEl  = document.getElementById('profile-avatar');
    if (nameEl)   nameEl.textContent   = name;
    if (userEl)   userEl.textContent   = currentUser.email || '';
    if (avatEl)   avatEl.textContent   = initial;

    const myPosts = allPostsCache.filter(p => p.user_id === currentUser.id);
    const countEl = document.getElementById('profile-posts-count');
    if (countEl)  countEl.textContent = myPosts.length;

    const listEl  = document.getElementById('profile-posts-list');
    if (!listEl) return;
    if (myPosts.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:30px;color:#aaa;font-size:0.9rem">لم تنشر شيئاً بعد</div>';
        return;
    }
    listEl.innerHTML = myPosts.map(post => {
        const date = new Date(post.created_at).toLocaleDateString('ar-EG', { month:'short', day:'numeric' });
        return `<div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p class="text-sm text-gray-700 leading-relaxed">${esc(post.content)}</p>
            <div class="flex items-center justify-between mt-3">
                <span class="text-xs text-gray-400">${date}</span>
                <button onclick="deletePost('${post.id}')" class="text-xs text-red-400 hover:text-red-600"><i class="fa-solid fa-trash ml-1"></i>حذف</button>
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
    if (postsEl) postsEl.textContent = formatNumber(allPostsCache.length);
    if (roomsEl) {
        const { count } = await db.from('audio_rooms').select('*', { count:'exact', head:true }).eq('is_active', true);
        roomsEl.textContent = formatNumber(count || 0);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// AUDIO ROOMS — CLUBHOUSE STYLE
// ══════════════════════════════════════════════════════════════════════════════
async function fetchRooms() {
    const { data, error } = await db.from('audio_rooms').select('*').eq('is_active', true).order('created_at', { ascending: false });
    if (error) { console.error('fetchRooms:', error); return; }
    renderRooms(data || []);
    updateStats();
}

function renderRooms(rooms) {
    const grid  = document.getElementById('rooms-grid');
    const empty = document.getElementById('rooms-empty-state');
    if (!grid) return;

    const active = rooms.filter(r => r.is_active);

    if (active.length === 0) {
        grid.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';

    const colors = ['#6366f1','#8b5cf6','#ec4899','#10b981','#f59e0b','#3b82f6','#ef4444','#14b8a6'];
    const getColor   = (name) => colors[Math.abs(Array.from(name||'A').reduce((a,c)=>a+c.charCodeAt(0),0)) % colors.length];
    const getInitial = (name) => (name||'?')[0].toUpperCase();

    grid.innerHTML = active.map(room => {
        const speakers  = room.speakers  || [];
        const listeners = room.listeners || [];
        const total     = room.participants_count || (speakers.length + listeners.length) || 0;
        const hostName  = speakers[0]?.name || room.host_name || 'المضيف';

        const speakersHTML = speakers.slice(0,4).map(sp => {
            const color = getColor(sp.name);
            return `<div style="text-align:center">
                <div style="width:52px;height:52px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:800;color:#fff;margin:0 auto 6px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.12)">${getInitial(sp.name)}</div>
                <div style="font-size:0.68rem;color:#555;font-weight:600;max-width:56px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(sp.name||'')}</div>
            </div>`;
        }).join('');

        const listenersHTML = listeners.slice(0,8).map(li => {
            const color = getColor(li.name);
            return `<div style="width:34px;height:34px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;color:#fff;border:2px solid #fff" title="${esc(li.name||'')}">${getInitial(li.name)}</div>`;
        }).join('');

        return `<div class="ch-room-card" onclick="joinRoom('${room.id}','${esc(room.title).replace(/'/g,"\\'")}','${room.host_id}')">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
                <div style="flex:1">
                    <h3 style="font-size:1rem;font-weight:800;color:#1a1a1a;margin:0 0 5px;line-height:1.35">${esc(room.title)}</h3>
                    <span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:20px;font-weight:700;font-size:0.66rem">🎤 ${esc(hostName)}</span>
                </div>
                <div style="display:flex;align-items:center;gap:4px;background:#fef2f2;border-radius:20px;padding:4px 10px;flex-shrink:0">
                    <span style="width:6px;height:6px;background:#ef4444;border-radius:50%;animation:blink 1.2s infinite;display:inline-block"></span>
                    <span style="font-size:0.7rem;font-weight:700;color:#dc2626">مباشر</span>
                </div>
            </div>
            ${speakersHTML ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">${speakersHTML}</div>` : ''}
            <div style="height:1px;background:#f5f5f5;margin:12px 0"></div>
            <div style="display:flex;align-items:center;justify-content:space-between">
                <div style="display:flex;gap:4px">${listenersHTML}</div>
                <div style="font-size:0.75rem;color:#aaa;font-weight:600"><i class="fa-solid fa-headphones" style="color:#d4a574;margin-left:4px"></i>${total} مشارك</div>
            </div>
        </div>`;
    }).join('');
}

async function createNewAudioRoom() {
    if (!currentUser) { openAuthModal(); return; }
    const input = document.getElementById('room-title-input');
    const title = input?.value?.trim();
    if (!title) return showStatusMessage('أدخل عنوان المجلس أولاً', 'error');

    const name = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'مضيف';
    const { data, error } = await db.from('audio_rooms').insert({
        title,
        host_id: currentUser.id,
        host_name: name,
        is_active: true,
        participants_count: 1,
    }).select().single();

    if (error) return showStatusMessage('فشل إنشاء الغرفة: ' + error.message, 'error');
    if (input) input.value = '';
    hideCreateRoomModal();
    showStatusMessage('تم إطلاق المجلس! 🚀', 'success');
    await fetchRooms();
    if (data) joinRoom(data.id, data.title, data.host_id);
}

// ── Clubhouse Modal ──
function showCreateRoomModal() {
    if (!currentUser) { openAuthModal(); return; }
    const modal = document.getElementById('create-room-modal');
    if (modal) modal.style.display = 'flex';
}

function hideCreateRoomModal(event) {
    const modal = document.getElementById('create-room-modal');
    if (!modal) return;
    if (event && event.target !== modal) return;
    modal.style.display = 'none';
}

function raiseHand() {
    const btn = document.getElementById('raise-hand-btn');
    if (!btn) return;
    const isRaised = btn.dataset.raised === 'true';
    if (isRaised) {
        btn.style.background = 'rgba(255,255,255,.08)';
        btn.style.border = 'none';
        btn.dataset.raised = 'false';
        showStatusMessage('أنزلت يدك', 'info');
    } else {
        btn.style.background = 'rgba(249,168,37,0.25)';
        btn.style.border = '2px solid rgba(249,168,37,0.5)';
        btn.dataset.raised = 'true';
        showStatusMessage('رفعت يدك ✋', 'success');
    }
}

// ── Join / Leave ──
async function joinRoom(roomId, title, hostId) {
    if (!currentUser) return openAuthModal();
    if (currentRoom) await leaveCurrentAudioRoom();

    const userName = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
    const roomName = `room_${roomId}`;

    try {
        const tokenRes = await fetch('/api/livekit-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomName, participantName: userName })
        });
        if (!tokenRes.ok) {
            let errMsg = `HTTP ${tokenRes.status}`;
            try { const d = await tokenRes.json(); errMsg = d.error || errMsg; } catch(e){}
            throw new Error(errMsg);
        }
        const { token, wsUrl } = await tokenRes.json();

        const room = new LivekitClient.Room();

        room.on('trackSubscribed', (track, _pub, _participant) => {
            if (track.kind === 'audio') {
                const audio = new Audio();
                track.attach(audio);
                audio.play().catch(e => console.warn('Autoplay:', e));
            }
        });

        await room.connect(wsUrl, token);

        try {
            await room.localParticipant.setMicrophoneEnabled(true);
        } catch(micErr) {
            console.error('Mic error:', micErr);
            showStatusMessage('تعذر الوصول للميكروفون — تحقق من الأذونات', 'error');
        }

        currentRoom       = room;
        currentRoomId     = roomId;
        currentRoomHostId = hostId;
        isCurrentUserHost = (currentUser.id === hostId);

        document.getElementById('active-room-title').textContent = title;
        document.getElementById('active-room-role').textContent  = isCurrentUserHost ? 'دورك: مضيف 👑' : 'دورك: مستمع';

        const panel = document.getElementById('active-room-panel');
        if (panel) { panel.style.display = 'flex'; panel.style.flexDirection = 'column'; }
        document.body.style.overflow = 'hidden';

        const closeBtn = document.getElementById('close-active-room-btn');
        if (closeBtn) closeBtn.style.display = isCurrentUserHost ? 'block' : 'none';

        updateParticipantsList(room);
        updateMicButtonState();

        room.on('participantConnected',    () => updateParticipantsList(room));
        room.on('participantDisconnected', () => updateParticipantsList(room));
        room.on('trackSubscribed',         () => updateParticipantsList(room));
        room.on('trackUnsubscribed',       () => updateParticipantsList(room));

        window.addEventListener('beforeunload', () => { if (currentRoom) currentRoom.disconnect(); });
        showStatusMessage(`دخلت إلى "${title}" 🎙️`, 'success');
    } catch(err) {
        console.error('joinRoom error:', err);
        showStatusMessage('تعذر الانضمام: ' + err.message, 'error');
    }
}

function updateParticipantsList(room) {
    const speakersGrid  = document.getElementById('speakers-grid');
    const listenersGrid = document.getElementById('listeners-grid');
    if (!speakersGrid || !listenersGrid) return;

    const colors     = ['#6366f1','#8b5cf6','#ec4899','#10b981','#f59e0b','#3b82f6','#ef4444','#14b8a6'];
    const getColor   = (name) => colors[Math.abs(Array.from(name||'A').reduce((a,c)=>a+c.charCodeAt(0),0)) % colors.length];
    const getInitial = (name) => (name||'?')[0].toUpperCase();

    const local   = room.localParticipant;
    const remotes = Array.from(room.participants.values());
    const all = [
        { identity: local.identity, isMicEnabled: local.isMicrophoneEnabled, isLocal: true },
        ...remotes.map(p => ({ identity: p.identity, isMicEnabled: p.isMicrophoneEnabled, isLocal: false }))
    ];

    const speakers  = all.slice(0, Math.min(6, all.length));
    const listeners = all.slice(Math.min(6, all.length));

    speakersGrid.innerHTML = speakers.map(p => {
        const color   = getColor(p.identity);
        const initial = getInitial(p.identity);
        const ring    = p.isMicEnabled
            ? 'border:3px solid #f9a825;animation:speakPulse 1.5s infinite;'
            : 'border:3px solid rgba(255,255,255,.15);';
        const micIcon = p.isMicEnabled
            ? `<span style="position:absolute;bottom:2px;right:2px;width:18px;height:18px;border-radius:50%;background:#22c55e;border:2px solid #0f3460;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-microphone" style="font-size:8px;color:#fff"></i></span>`
            : `<span style="position:absolute;bottom:2px;right:2px;width:18px;height:18px;border-radius:50%;background:#374151;border:2px solid #0f3460;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-microphone-slash" style="font-size:8px;color:#9ca3af"></i></span>`;
        return `<div style="text-align:center;min-width:80px">
            <div style="width:72px;height:72px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:900;color:#fff;margin:0 auto 8px;${ring}box-sizing:border-box;position:relative">${initial}${micIcon}</div>
            <div style="font-size:0.75rem;font-weight:700;color:rgba(255,255,255,.9);max-width:80px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0 auto">${esc(p.identity)}${p.isLocal ? ' 👤' : ''}</div>
            ${p.isLocal && isCurrentUserHost ? `<div style="font-size:0.62rem;color:#f9a825;font-weight:700;margin-top:2px">مضيف 👑</div>` : ''}
        </div>`;
    }).join('');

    listenersGrid.innerHTML = listeners.length > 0
        ? listeners.map(p => {
            const color   = getColor(p.identity);
            const initial = getInitial(p.identity);
            return `<div title="${esc(p.identity)}" style="text-align:center">
                <div style="width:48px;height:48px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:700;color:#fff;opacity:.85">${initial}</div>
                <div style="font-size:0.62rem;color:rgba(255,255,255,.5);margin-top:4px;max-width:48px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.identity)}</div>
            </div>`;
          }).join('')
        : `<div style="color:rgba(255,255,255,.35);font-size:0.8rem">لا يوجد جمهور بعد</div>`;
}

function updateMicButtonState() {
    const btn = document.getElementById('mute-btn');
    if (!btn || !currentRoom) return;
    const isOn = currentRoom.localParticipant.isMicrophoneEnabled;
    btn.dataset.muted = !isOn;
    btn.innerHTML = isOn ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
    btn.style.background   = isOn ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,.12)';
    btn.style.animation    = isOn ? 'micActive 1s infinite' : '';
}

async function toggleMic() {
    if (!currentRoom) return;
    const newState = !currentRoom.localParticipant.isMicrophoneEnabled;
    await currentRoom.localParticipant.setMicrophoneEnabled(newState);
    updateMicButtonState();
    updateParticipantsList(currentRoom);
}

async function leaveCurrentAudioRoom() {
    if (currentRoom) {
        currentRoom.disconnect();
        currentRoom = null;
        currentRoomId = null;
        currentRoomHostId = null;
        isCurrentUserHost = false;
    }
    const panel = document.getElementById('active-room-panel');
    if (panel) panel.style.display = 'none';
    document.body.style.overflow = '';
    const sg = document.getElementById('speakers-grid');
    const lg = document.getElementById('listeners-grid');
    if (sg) sg.innerHTML = '';
    if (lg) lg.innerHTML = '';
}

async function closeCurrentRoom() {
    if (!currentRoomId) return;
    if (!confirm('هل تريد إغلاق هذه الغرفة نهائياً؟')) return;
    const { error } = await db.from('audio_rooms').update({ is_active: false }).eq('id', currentRoomId);
    if (error) return showStatusMessage('فشل إغلاق الغرفة: ' + error.message, 'error');
    await leaveCurrentAudioRoom();
    fetchRooms();
}

// ══════════════════════════════════════════════════════════════════════════════
// SANDBOX
// ══════════════════════════════════════════════════════════════════════════════
let sandboxController = null;

async function runSandbox() {
    const url   = document.getElementById('sandbox-repo-url')?.value?.trim();
    const entry = document.getElementById('sandbox-entry-file')?.value?.trim();
    const term  = document.getElementById('sandbox-terminal');
    if (!url)  return showStatusMessage('أدخل رابط المستودع', 'error');
    if (!term) return;

    clearTerminal();
    appendLog(term, 'info', `⟳ جارٍ الاتصال بـ: ${url}`);

    sandboxController = new AbortController();
    try {
        const res = await fetch('/api/sandbox', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoUrl: url, entryFile: entry }),
            signal: sandboxController.signal,
        });
        if (!res.body) throw new Error('No stream');
        const reader = res.body.getReader();
        const dec    = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const lines = dec.decode(value).split('\n').filter(Boolean);
            for (const line of lines) {
                try {
                    const obj = JSON.parse(line);
                    appendLog(term, obj.type || 'log', obj.msg || line);
                } catch { appendLog(term, 'log', line); }
            }
        }
        appendLog(term, 'success', '✅ انتهى التشغيل');
    } catch(err) {
        if (err.name !== 'AbortError') appendLog(term, 'error', '❌ ' + err.message);
    }
}

function stopSandbox() {
    if (sandboxController) { sandboxController.abort(); sandboxController = null; }
    appendLog(document.getElementById('sandbox-terminal'), 'warn', '⏹ تم الإيقاف');
}

function appendLog(terminal, type, msg) {
    if (!terminal) return;
    const colors = { error:'#f87171', success:'#4ade80', warn:'#fbbf24', info:'#60a5fa', log:'#d1d5db' };
    const div = document.createElement('div');
    div.style.color = colors[type] || colors.log;
    div.textContent = msg;
    terminal.appendChild(div);
    terminal.scrollTop = terminal.scrollHeight;
}

function clearTerminal() {
    const term = document.getElementById('sandbox-terminal');
    if (term) term.innerHTML = '<div style="color:#4ade80">● Pulse Sandbox جاهز.</div>';
}

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL EXPORTS
// ══════════════════════════════════════════════════════════════════════════════
window.navigateTo            = navigateTo;
window.openAuthModal         = openAuthModal;
window.closeAuthModal        = closeAuthModal;
window.switchToSignup        = switchToSignup;
window.switchToLogin         = switchToLogin;
window.handleLogin           = handleLogin;
window.handleSignup          = handleSignup;
window.handleLogout          = handleLogout;
window.createPost            = createPost;
window.handleVote            = handleVote;
window.submitComment         = submitComment;
window.deletePost            = deletePost;
window.fetchRooms            = fetchRooms;
window.createNewAudioRoom    = createNewAudioRoom;
window.showCreateRoomModal   = showCreateRoomModal;
window.hideCreateRoomModal   = hideCreateRoomModal;
window.joinRoom              = joinRoom;
window.leaveCurrentAudioRoom = leaveCurrentAudioRoom;
window.closeCurrentRoom      = closeCurrentRoom;
window.toggleMic             = toggleMic;
window.raiseHand             = raiseHand;
window.runSandbox            = runSandbox;
window.stopSandbox           = stopSandbox;
window.clearTerminal         = clearTerminal;

// ══════════════════════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    // تحقق من جلسة موجودة
    const { data: { session } } = await db.auth.getSession();
    currentUser = session?.user ?? null;
    updateUIForAuth();

    document.getElementById('post-submit-btn')?.addEventListener('click', createPost);

    fetchPosts();

    // إغلاق مودال الغرفة بـ Escape أو النقر على الخلفية
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('create-room-modal');
            if (modal && modal.style.display === 'flex') modal.style.display = 'none';
        }
    });
});
