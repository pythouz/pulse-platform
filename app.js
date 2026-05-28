// ══════════════════════════════════════════════════════════════════════════════
// Pulse Live — Frontend Engine v13 (Professional number formatting, floor-based)
// ══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL      = 'https://jnwqokkzywrctdjsdzbl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impud3Fva2t6eXdyY3RkanNkemJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTkxOTYsImV4cCI6MjA5NTM5NTE5Nn0.8RkJ2A1oJ9DaSD0Y8CdiNwvcfcr7iWyQZf5eKD3kpAo';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser   = null;
let allPostsCache = [];
let scrollPositionBeforeRender = 0;

// ══════════════════════════════════════════════════════════════════════════════
// Professional number formatter (like YouTube/Facebook)
// ══════════════════════════════════════════════════════════════════════════════
function formatNumber(num) {
    if (num === undefined || num === null) return '0';
    const sign = num < 0 ? '-' : '';
    let absNum = Math.abs(num);
    
    if (absNum >= 1_000_000_000) {
        let val = absNum / 1_000_000_000;
        val = Math.floor(val * 10) / 10;
        if (val >= 1000) return sign + Math.floor(val) + 'B';
        return sign + val.toFixed(1).replace(/\.0$/, '') + 'B';
    }
    if (absNum >= 1_000_000) {
        let val = absNum / 1_000_000;
        val = Math.floor(val * 10) / 10;
        if (val >= 1000) return sign + Math.floor(val) + 'M';
        return sign + val.toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (absNum >= 1000) {
        let val = absNum / 1000;
        val = Math.floor(val * 10) / 10;
        if (val >= 1000) return sign + Math.floor(val) + 'k';
        return sign + val.toFixed(1).replace(/\.0$/, '') + 'k';
    }
    return sign + absNum.toString();
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════
function sortPostsByNetVotes(posts) {
    return [...posts].sort((a, b) => {
        const netA = (a.upvotes || 0) - (a.downvotes || 0);
        const netB = (b.upvotes || 0) - (b.downvotes || 0);
        if (netA !== netB) return netB - netA;
        return new Date(b.created_at) - new Date(a.created_at);
    });
}

function preserveScrollBeforeRender() { scrollPositionBeforeRender = window.scrollY; }
function restoreScrollAfterRender() { window.scrollTo({ top: scrollPositionBeforeRender, behavior: 'instant' }); }

// ══════════════════════════════════════════════════════════════════════════════
// ROUTER & AUTH
// ══════════════════════════════════════════════════════════════════════════════
function navigateTo(view) {
    ['timeline','profile','rooms','sandbox'].forEach(v =>
        document.getElementById(`${v}-view`)?.classList.add('hidden')
    );
    document.getElementById(`${view}-view`)?.classList.remove('hidden');
    if (view === 'timeline') fetchPosts();
    if (view === 'rooms')    fetchRooms();
    if (view === 'profile')  renderProfilePage();
}

function openAuthModal()  { document.getElementById('auth-modal').classList.remove('hidden'); }
function closeAuthModal() { document.getElementById('auth-modal').classList.add('hidden'); }
function switchToSignup() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('signup-form').classList.remove('hidden');
    document.getElementById('auth-modal-title').textContent = 'إنشاء حساب جديد';
}
function switchToLogin() {
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('auth-modal-title').textContent = 'تسجيل الدخول';
}

async function handleSignup() {
    const email    = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const fullName = document.getElementById('signup-name').value.trim();
    if (!email || !password || !fullName) return alert('يرجى تعبئة جميع الحقول.');
    const { error } = await db.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) return alert('خطأ: ' + error.message);
    alert('تم التسجيل! يمكنك الدخول الآن.');
    switchToLogin();
}

async function handleLogin() {
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) return alert('أدخل البريد وكلمة المرور.');
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) return alert('بيانات غير صحيحة: ' + error.message);
    closeAuthModal();
}

async function handleLogout() {
    await db.auth.signOut();
    location.reload();
}

db.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    updateUIForAuth();
});

function updateUIForAuth() {
    const in_ = !!currentUser;
    document.getElementById('auth-toggle-btn')?.classList.toggle('hidden', in_);
    document.getElementById('user-profile-card')?.classList.toggle('hidden', !in_);
    document.getElementById('composer-logged-in')?.classList.toggle('hidden', !in_);
    document.getElementById('composer-logged-out')?.classList.toggle('hidden', in_);
    if (in_) {
        const name = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
        document.getElementById('user-display-name').textContent  = name;
        document.getElementById('user-avatar-letter').textContent = name.charAt(0).toUpperCase();
        updateActiveRoomCloseButton();
    } else {
        navigateTo('timeline');
        document.getElementById('active-room-panel')?.classList.add('hidden');
        window.currentActiveRoom = null;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// POSTS
// ══════════════════════════════════════════════════════════════════════════════

async function fetchPosts() {
    const { data, error } = await db
        .from('posts')
        .select('*, comments(*)')
        .order('created_at', { ascending: false });
    if (error) { console.error('fetchPosts:', error.message); return; }
    allPostsCache = sortPostsByNetVotes(data || []);
    renderTimeline(allPostsCache);
    updateStats();
}

async function createPost() {
    const ta      = document.getElementById('post-textarea');
    const content = ta?.value.trim();
    if (!content)     return alert('اكتب شيئاً قبل النشر.');
    if (!currentUser) return alert('يجب تسجيل الدخول.');

    const author_name = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
    const newPost = {
        id: Date.now(),
        author_name,
        title: content.substring(0, 80),
        content,
        upvotes: 0,
        downvotes: 0,
        created_at: new Date().toISOString(),
        comments: []
    };
    allPostsCache = sortPostsByNetVotes([newPost, ...allPostsCache]);
    renderTimeline(allPostsCache);
    ta.value = '';

    const { data, error } = await db.from('posts').insert({
        author_name,
        title: newPost.title,
        content
    }).select().single();

    if (error) {
        console.error('createPost error:', error.message);
        alert('فشل النشر، حاول مجدداً.');
        allPostsCache = allPostsCache.filter(p => p.id !== newPost.id);
        renderTimeline(allPostsCache);
    } else {
        allPostsCache = allPostsCache.map(p => p.id === newPost.id ? data : p);
        allPostsCache = sortPostsByNetVotes(allPostsCache);
        renderTimeline(allPostsCache);
    }
}

function renderTimeline(posts) {
    const container = document.getElementById('posts-container');
    if (!container) return;
    container.innerHTML = '';

    if (!posts.length) {
        container.innerHTML = `<div class="bg-white p-8 rounded-2xl text-center text-gray-400 border border-dashed">لا توجد منشورات بعد. كن أول من ينشر!</div>`;
        return;
    }

    const topNet = posts.length > 0 ? (posts[0].upvotes - posts[0].downvotes) : -Infinity;
    const hasPositiveTop = topNet > 0;

    posts.forEach(post => {
        let commentsHTML = '';
        if (post.comments?.length) {
            [...post.comments]
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                .forEach(c => {
                    commentsHTML += `
                        <div class="bg-gray-50 p-3 rounded-xl border border-gray-100 text-sm">
                            <span class="font-bold block text-xs text-black mb-1">${esc(c.author_name)}</span>
                            <p class="text-gray-700">${esc(c.content)}</p>
                        </div>`;
                });
        } else {
            commentsHTML = `<p class="text-xs text-gray-400 italic text-center py-2">لا توجد تعليقات بعد.</p>`;
        }

        const myName   = currentUser?.user_metadata?.full_name || currentUser?.email?.split('@')[0];
        const canDelete = currentUser && myName === post.author_name;

        const netVote = (post.upvotes || 0) - (post.downvotes || 0);
        const isTopPost = (netVote === topNet && hasPositiveTop);

        let cardClasses = 'bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 fade-in transition-all';
        if (isTopPost) {
            cardClasses += ' shadow-[0_0_15px_rgba(255,215,0,0.6)] border border-yellow-300/50';
        }

        const card = document.createElement('div');
        card.className = cardClasses;
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-2">
                    <div class="w-9 h-9 bg-black text-white font-black text-sm rounded-full flex items-center justify-center flex-shrink-0">
                        ${esc(post.author_name).charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <span class="font-bold text-black text-sm">
                            ${isTopPost ? '<i class="fa-solid fa-crown text-yellow-500 ml-1"></i>' : ''}
                            ${esc(post.author_name)}
                        </span>
                        <span class="block text-xs text-gray-400">${new Date(post.created_at).toLocaleDateString('ar-EG', { hour:'2-digit', minute:'2-digit' })}</span>
                    </div>
                </div>
                ${canDelete ? `<button onclick="deletePost(${post.id})" class="text-red-400 hover:text-red-600 text-xs p-1 rounded-lg hover:bg-red-50 transition"><i class="fa-solid fa-trash"></i></button>` : ''}
            </div>
            <p class="text-gray-800 leading-relaxed text-sm whitespace-pre-wrap">${esc(post.content)}</p>
            <div class="flex gap-2 border-y border-gray-100 py-2.5">
                <button onclick="handleVote(${post.id},'upvote')"
                    class="flex items-center gap-1.5 text-sm bg-green-50 text-green-700 font-bold px-4 py-2 rounded-xl hover:bg-green-100 active:scale-95 transition">
                    <i class="fa-solid fa-arrow-up text-xs"></i> ${formatNumber(post.upvotes)}
                </button>
                <button onclick="handleVote(${post.id},'downvote')"
                    class="flex items-center gap-1.5 text-sm bg-red-50 text-red-600 font-bold px-4 py-2 rounded-xl hover:bg-red-100 active:scale-95 transition">
                    <i class="fa-solid fa-arrow-down text-xs"></i> ${formatNumber(post.downvotes)}
                </button>
            </div>
            <div class="space-y-2">
                <h4 class="text-xs font-bold uppercase text-gray-400 tracking-wider">
                    <i class="fa-regular fa-comments ml-1"></i>التعليقات (${post.comments?.length || 0})
                </h4>
                <div class="space-y-2 max-h-48 overflow-y-auto" id="comments-box-${post.id}">${commentsHTML}</div>
                <div class="flex gap-2 pt-1">
                    <input type="text" id="comment-input-${post.id}"
                        placeholder="${currentUser ? 'اكتب تعليقاً...' : '🔒 سجل دخولك للتعليق'}"
                        ${currentUser ? '' : 'disabled'}
                        class="flex-1 text-sm p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black disabled:opacity-50">
                    <button onclick="submitComment(${post.id})" ${currentUser ? '' : 'disabled'}
                        class="bg-black text-white text-sm px-4 rounded-xl font-bold hover:bg-gray-800 active:scale-95 transition disabled:opacity-40">
                        إرسال
                    </button>
                </div>
            </div>`;
        container.appendChild(card);
    });
}

async function handleVote(postId, voteType) {
    if (!currentUser) return alert('يجب تسجيل الدخول للتصويت.');
    preserveScrollBeforeRender();

    const { data: existing } = await db.from('post_votes')
        .select('id, vote_type').eq('post_id', postId).eq('user_id', currentUser.id).maybeSingle();

    const { data: currentPost } = await db.from('posts')
        .select('upvotes, downvotes').eq('id', postId).single();

    let up = currentPost.upvotes || 0;
    let down = currentPost.downvotes || 0;

    if (existing) {
        if (existing.vote_type === voteType) {
            await db.from('post_votes').delete().eq('id', existing.id);
            if (voteType === 'upvote') up = Math.max(0, up - 1);
            else down = Math.max(0, down - 1);
        } else {
            await db.from('post_votes').update({ vote_type: voteType }).eq('id', existing.id);
            if (voteType === 'upvote') { up += 1; down = Math.max(0, down - 1); }
            else { down += 1; up = Math.max(0, up - 1); }
        }
    } else {
        await db.from('post_votes').insert({ post_id: postId, user_id: currentUser.id, vote_type: voteType });
        if (voteType === 'upvote') up += 1; else down += 1;
    }

    await db.from('posts').update({ upvotes: up, downvotes: down }).eq('id', postId);
    
    const { data: refreshed } = await db.from('posts')
        .select('*, comments(*)')
        .order('created_at', { ascending: false });
    if (refreshed) {
        allPostsCache = sortPostsByNetVotes(refreshed);
        renderTimeline(allPostsCache);
        updateStats();
    }
    restoreScrollAfterRender();
}

async function submitComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const content = input?.value.trim();
    if (!content) return;
    if (!currentUser) return alert('سجل دخولك أولاً.');

    const author_name = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
    const tempId = Date.now();
    const newComment = {
        id: tempId,
        post_id: postId,
        author_name,
        content,
        created_at: new Date().toISOString()
    };
    
    preserveScrollBeforeRender();
    const postIndex = allPostsCache.findIndex(p => p.id == postId);
    if (postIndex !== -1) {
        if (!allPostsCache[postIndex].comments) allPostsCache[postIndex].comments = [];
        allPostsCache[postIndex].comments.push(newComment);
        renderTimeline(allPostsCache);
    }
    input.value = '';
    restoreScrollAfterRender();

    const { data, error } = await db.from('comments').insert({
        post_id: postId,
        author_name,
        content
    }).select().single();

    if (error) {
        console.error('comment error:', error.message);
        alert('فشل إرسال التعليق، حاول مجدداً.');
        if (postIndex !== -1) {
            allPostsCache[postIndex].comments = allPostsCache[postIndex].comments.filter(c => c.id !== tempId);
            renderTimeline(allPostsCache);
        }
    } else {
        if (postIndex !== -1) {
            allPostsCache[postIndex].comments = allPostsCache[postIndex].comments.map(c => c.id === tempId ? data : c);
            renderTimeline(allPostsCache);
        }
    }
}

async function deletePost(postId) {
    if (!confirm('هل أنت متأكد من الحذف؟')) return;
    await db.from('posts').delete().eq('id', postId);
    fetchPosts();
}

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE
// ══════════════════════════════════════════════════════════════════════════════
function renderProfilePage() {
    if (!currentUser) return;
    const name = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
    document.getElementById('profile-display-name').textContent = name;
    document.getElementById('profile-username').textContent     = currentUser.email;
    document.getElementById('profile-avatar').textContent       = name.charAt(0).toUpperCase();

    const mine = allPostsCache.filter(p => p.author_name === name);
    document.getElementById('profile-posts-count').textContent = mine.length;

    const list = document.getElementById('profile-posts-list');
    list.innerHTML = '';
    if (!mine.length) {
        list.innerHTML = `<div class="bg-white p-8 rounded-2xl text-center text-gray-400 border border-dashed">لم تنشر شيئاً بعد.</div>`;
        return;
    }
    mine.forEach(post => {
        const card = document.createElement('div');
        card.className = 'bg-white p-5 rounded-2xl border border-gray-100 shadow-sm fade-in';
        card.innerHTML = `
            <div class="text-xs text-gray-400 mb-2">
                ${new Date(post.created_at).toLocaleDateString('ar-EG', { hour:'2-digit', minute:'2-digit' })}
            </div>
            <p class="text-gray-800 text-sm leading-relaxed">${esc(post.content)}</p>
            <div class="flex gap-4 mt-3 text-xs text-gray-400">
                <span>👍 ${formatNumber(post.upvotes)}</span>
                <span>👎 ${formatNumber(post.downvotes)}</span>
                <span>💬 ${post.comments?.length || 0}</span>
            </div>`;
        list.appendChild(card);
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOMS (unchanged, keep previous version)
// ══════════════════════════════════════════════════════════════════════════════
let currentActiveRoom = null;

async function fetchRooms() {
    const { data, error } = await db.from('audio_rooms')
        .select('*').eq('is_active', true).order('created_at', { ascending: false });
    if (error) { console.error('fetchRooms:', error.message); return; }
    renderRooms(data || []);
    const el = document.getElementById('stat-rooms');
    if (el) el.textContent = (data || []).length;
    updateActiveRoomCloseButton();
}

function renderRooms(rooms) {
    const grid = document.getElementById('rooms-grid');
    if (!grid) return;
    grid.innerHTML = '';
    if (!rooms.length) {
        grid.innerHTML = `<div class="col-span-2 bg-white p-8 rounded-2xl text-center text-gray-400 border border-dashed">لا توجد غرف نشطة. أنشئ أول غرفة!</div>`;
        return;
    }
    rooms.forEach(room => {
        const card = document.createElement('div');
        card.className = 'bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-3 fade-in';
        card.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-md font-bold flex items-center gap-1">
                    <span class="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span> مباشر
                </span>
                <span class="text-xs text-gray-400">${new Date(room.created_at).toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit' })}</span>
            </div>
            <h3 class="font-bold text-black">${esc(room.title)}</h3>
            <p class="text-xs text-gray-500">المضيف: ${esc(room.host_name)}</p>
            <button onclick="joinRoom(${room.id}, '${esc(room.title)}', '${room.host_id}')"
                class="w-full bg-black text-white py-2.5 rounded-xl text-sm font-bold hover:bg-gray-800 transition">
                <i class="fa-solid fa-headphones ml-1"></i> انضمام للجلسة
            </button>`;
        grid.appendChild(card);
    });
}

async function createNewAudioRoom() {
    if (!currentUser) return alert('يجب تسجيل الدخول.');
    const input = document.getElementById('room-title-input');
    const title = input?.value.trim();
    if (!title) return alert('أدخل عنوان الغرفة.');
    const host_name = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
    const { data, error } = await db.from('audio_rooms').insert({
        title, host_name, host_id: currentUser.id, is_active: true
    }).select().single();
    if (error) { console.error('createRoom:', error.message); return alert('فشل إنشاء الغرفة: ' + error.message); }
    input.value = '';
    fetchRooms();
    joinRoom(data.id, data.title, data.host_id);
}

function joinRoom(roomId, title, hostId) {
    if (!currentUser) return alert('يجب تسجيل الدخول للانضمام.');
    currentActiveRoom = { id: roomId, hostId };
    document.getElementById('active-room-title').textContent = title;
    const isHost = (currentUser.id === hostId);
    document.getElementById('active-room-role').textContent = isHost ? 'دورك: مضيف' : 'دورك: مستمع';
    document.getElementById('active-room-panel').classList.remove('hidden');
    updateActiveRoomCloseButton();
}

function updateActiveRoomCloseButton() {
    const closeBtn = document.getElementById('close-active-room-btn');
    if (!closeBtn) return;
    if (currentActiveRoom && currentUser && currentUser.id === currentActiveRoom.hostId) {
        closeBtn.classList.remove('hidden');
    } else {
        closeBtn.classList.add('hidden');
    }
}

async function closeCurrentRoom() {
    if (!currentActiveRoom || !currentUser || currentUser.id !== currentActiveRoom.hostId) {
        alert('ليس لديك صلاحية لإغلاق هذه الغرفة.');
        return;
    }
    if (!confirm('هل تريد إغلاق هذه الغرفة؟')) return;
    const { error } = await db.from('audio_rooms').update({ is_active: false }).eq('id', currentActiveRoom.id);
    if (error) {
        alert('فشل إغلاق الغرفة: ' + error.message);
    } else {
        leaveCurrentAudioRoom();
        fetchRooms();
    }
}

function leaveCurrentAudioRoom() {
    document.getElementById('active-room-panel').classList.add('hidden');
    currentActiveRoom = null;
}

function toggleMic() {
    const btn = document.getElementById('mute-btn');
    const muted = btn.dataset.muted === 'true';
    btn.dataset.muted = String(!muted);
    btn.innerHTML = muted ? `<i class="fa-solid fa-microphone ml-1"></i> الميك شغال` : `<i class="fa-solid fa-microphone-slash ml-1"></i> كتم`;
}

// ══════════════════════════════════════════════════════════════════════════════
// SANDBOX
// ══════════════════════════════════════════════════════════════════════════════
let sandboxController = null;

async function runSandbox() {
    const urlInput = document.getElementById('sandbox-repo-url');
    const fileInput = document.getElementById('sandbox-entry-file');
    const terminal = document.getElementById('sandbox-terminal');
    const runBtn = document.getElementById('sandbox-run-btn');
    const repoUrl = urlInput?.value.trim();
    const entryFile = fileInput?.value.trim() || '';
    if (!repoUrl) return alert('أدخل رابط المستودع.');
    if (!currentUser) return alert('يجب تسجيل الدخول.');
    if (sandboxController) sandboxController.abort();
    terminal.innerHTML = '';
    runBtn.disabled = true;
    runBtn.textContent = '⏳ جاري التشغيل...';
    sandboxController = new AbortController();
    try {
        const res = await fetch('http://localhost:5000/api/sandbox/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoUrl, entryFile: entryFile || undefined }),
            signal: sandboxController.signal
        });
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop();
            lines.forEach(line => {
                if (!line.startsWith('data:')) return;
                try {
                    const { type, msg } = JSON.parse(line.slice(5).trim());
                    appendLog(terminal, type, msg);
                } catch (_) {}
            });
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            appendLog(terminal, 'error', '❌ الباك إند غير متاح. شغّل server.js أولاً:\n   node server.js');
        }
    } finally {
        runBtn.disabled = false;
        runBtn.textContent = '▶ تشغيل';
        sandboxController = null;
    }
}

function stopSandbox() {
    if (sandboxController) sandboxController.abort();
    const runBtn = document.getElementById('sandbox-run-btn');
    if (runBtn) { runBtn.disabled = false; runBtn.textContent = '▶ تشغيل'; }
    appendLog(document.getElementById('sandbox-terminal'), 'info', '⏹ تم إيقاف التنفيذ.');
}

function appendLog(terminal, type, msg) {
    if (!terminal) return;
    const colors = { info:'text-blue-400', success:'text-green-400', error:'text-red-400', log:'text-gray-200' };
    const line = document.createElement('div');
    line.className = `font-mono text-xs leading-relaxed whitespace-pre-wrap ${colors[type] || 'text-gray-200'}`;
    line.textContent = msg;
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

function clearTerminal() {
    const t = document.getElementById('sandbox-terminal');
    if (t) t.innerHTML = `<div class="text-green-400">● جاهز للتشغيل.</div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// STATS & UTILS
// ══════════════════════════════════════════════════════════════════════════════
function updateStats() {
    const el = document.getElementById('stat-posts');
    if (el) el.textContent = allPostsCache.length;
}

function esc(str) {
    return String(str ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL EXPORTS
// ══════════════════════════════════════════════════════════════════════════════
window.navigateTo            = navigateTo;
window.openAuthModal         = openAuthModal;
window.closeAuthModal        = closeAuthModal;
window.switchToSignup        = switchToSignup;
window.switchToLogin         = switchToLogin;
window.handleSignup          = handleSignup;
window.handleLogin           = handleLogin;
window.handleLogout          = handleLogout;
window.createPost            = createPost;
window.handleVote            = handleVote;
window.submitComment         = submitComment;
window.deletePost            = deletePost;
window.createNewAudioRoom    = createNewAudioRoom;
window.joinRoom              = joinRoom;
window.leaveCurrentAudioRoom = leaveCurrentAudioRoom;
window.closeCurrentRoom      = closeCurrentRoom;
window.toggleMic             = toggleMic;
window.runSandbox            = runSandbox;
window.stopSandbox           = stopSandbox;
window.clearTerminal         = clearTerminal;

// ══════════════════════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    updateUIForAuth();
    document.getElementById('post-submit-btn')?.addEventListener('click', createPost);
    fetchPosts();
    // No auto-refresh
});