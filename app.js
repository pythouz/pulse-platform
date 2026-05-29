// ══════════════════════════════════════════════════════════════════════════════
// Pulse Live — Frontend Engine v4.0 (معدّل لتشخيص الأخطاء)
// ══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL      = 'https://jnwqokkzywrctdjsdzbl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impud3Fva2t6eXdyY3RkanNkemJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTkxOTYsImV4cCI6MjA5NTM5NTE5Nn0.8RkJ2A1oJ9DaSD0Y8CdiNwvcfcr7iWyQZf5eKD3kpAo';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Global state ──
let currentUser       = null;
let allPostsCache     = [];
let myVotesCache      = {};
let currentTab        = 'latest';
let currentRoom       = null;
let currentRoomId     = null;
let currentRoomHostId = null;
let isCurrentUserHost = false;
let scrollY           = 0;

// ── Palette ──
const COLORS     = ['#6366f1','#8b5cf6','#ec4899','#10b981','#f59e0b','#3b82f6','#ef4444','#14b8a6','#f97316','#06b6d4'];
const getColor   = s => COLORS[Math.abs(Array.from(s||'A').reduce((a,c)=>a+c.charCodeAt(0),0))%COLORS.length];
const getInitial = s => (s||'?')[0].toUpperCase();

// ══════════════════════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════════════════════
function esc(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n/1e6).toFixed(1)+'M';
    if (n >= 1e3) return (n/1e3).toFixed(1)+'k';
    return String(n);
}

function fmtDate(iso) {
    if (!iso) return '';
    const sec = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (sec < 60)    return 'الآن';
    if (sec < 3600)  return `${Math.floor(sec/60)} د`;
    if (sec < 86400) return `${Math.floor(sec/3600)} س`;
    return new Date(iso).toLocaleDateString('ar-EG',{month:'short',day:'numeric'});
}

function toast(msg, type='info') {
    const el = document.getElementById('status-msg');
    if (!el) return;
    el.textContent = msg;
    el.style.background = type==='success'?'#16a34a':type==='error'?'#dc2626':'#0f0f0f';
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(()=>el.classList.add('hidden'), 5000);
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH مع تحسين الجلسة
// ══════════════════════════════════════════════════════════════════════════════
function openAuthModal()  { document.getElementById('auth-modal').classList.remove('hidden'); }
function closeAuthModal() { document.getElementById('auth-modal').classList.add('hidden'); }
function outsideCloseAuth(e) { if (e.target.id==='auth-modal') closeAuthModal(); }

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
    const btn = document.querySelector('#login-form .btn');
    if (btn) { btn.textContent='...'; btn.disabled=true; }
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (btn) { btn.innerHTML='دخول <i class="fa-solid fa-arrow-left"></i>'; btn.disabled=false; }
    if (error) {
        console.error('Login error:', error);
        return toast(error.message, 'error');
    }
    console.log('Login success:', data.user);
    currentUser = data.user;
    updateUIForAuth();
    closeAuthModal();
    toast('أهلاً بك! 🎉', 'success');
    await fetchPosts();
    await fetchMyVotes();
}

async function handleSignup() {
    const name     = document.getElementById('signup-name')?.value?.trim();
    const email    = document.getElementById('signup-email')?.value?.trim();
    const password = document.getElementById('signup-password')?.value;
    if (!name||!email||!password) return toast('يرجى تعبئة جميع الحقول','error');
    if (password.length<6) return toast('كلمة المرور 6 أحرف على الأقل','error');
    const btn = document.querySelector('#signup-form .btn');
    if (btn) { btn.textContent='...'; btn.disabled=true; }
    const { data, error } = await db.auth.signUp({ 
        email, 
        password, 
        options: { data: { full_name: name } } 
    });
    if (btn) { btn.innerHTML='إنشاء الحساب ✨'; btn.disabled=false; }
    if (error) {
        console.error('Signup error:', error);
        return toast(error.message,'error');
    }
    console.log('Signup success:', data);
    if (data.user) {
        currentUser = data.user;
        updateUIForAuth();
    }
    closeAuthModal();
    toast('مرحباً بك في Pulse! 🎊','success');
    await fetchPosts();
}

async function handleLogout() {
    await db.auth.signOut();
    currentUser = null;
    myVotesCache = {};
    updateUIForAuth();
    navigateTo('timeline');
    toast('إلى اللقاء! 👋','info');
}

db.auth.onAuthStateChange(async (event, session) => {
    console.log('Auth state change:', event, session?.user?.email);
    currentUser = session?.user ?? null;
    updateUIForAuth();
    if (event === 'SIGNED_IN') {
        await fetchPosts();
        await fetchMyVotes();
    }
    if (event === 'SIGNED_OUT') {
        allPostsCache = [];
        renderTimeline();
    }
});

function updateUIForAuth() {
    const on = !!currentUser;
    document.getElementById('auth-toggle-btn')?.classList.toggle('hidden', on);
    document.getElementById('user-profile-card')?.classList.toggle('hidden', !on);
    document.getElementById('composer-logged-in')?.classList.toggle('hidden', !on);
    document.getElementById('composer-logged-out')?.classList.toggle('hidden', on);

    if (on && currentUser) {
        const name = displayName();
        const c    = getColor(name);
        const set  = (id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
        const css  = (id,p,v)=>{ const el=document.getElementById(id); if(el) el.style[p]=v; };
        set('user-display-name', name);
        set('user-email-display', currentUser.email||'');
        set('user-avatar-letter', getInitial(name));
        set('composer-avatar', getInitial(name));
        css('user-avatar-letter','background',c);
        css('composer-avatar','background',c);
    }
    updateStats();
}

function displayName() {
    return currentUser?.user_metadata?.full_name
        || currentUser?.email?.split('@')[0]
        || 'مستخدم';
}

// ══════════════════════════════════════════════════════════════════════════════
// POSTS (مع تشخيص أخطاء الإدراج)
// ══════════════════════════════════════════════════════════════════════════════
async function fetchPosts() {
    const { data, error } = await db
        .from('posts')
        .select('id,author_id,author_name,title,content,upvotes,downvotes,created_at')
        .order('created_at', { ascending: false })
        .limit(80);

    if (error) {
        console.error('fetchPosts error:', error);
        const c = document.getElementById('posts-container');
        if (c) c.innerHTML = `<div class="card" style="padding:28px;text-align:center;color:#ef4444;font-size:.85rem">
            ⚠️ فشل تحميل المنشورات: ${esc(error.message)}</div>`;
        return;
    }
    allPostsCache = data || [];
    renderTimeline();
    updateStats();
}

async function fetchMyVotes() {
    if (!currentUser) return;
    const { data, error } = await db
        .from('post_votes')
        .select('post_id,vote_type')
        .eq('user_id', currentUser.id);
    if (error) console.error('fetchMyVotes error:', error);
    myVotesCache = {};
    (data||[]).forEach(v => { myVotesCache[v.post_id] = v.vote_type; });
    renderTimeline();
}

async function createPost() {
    if (!currentUser) {
        toast('يجب تسجيل الدخول أولاً', 'error');
        return openAuthModal();
    }

    const titleEl   = document.getElementById('post-title-input');
    const contentEl = document.getElementById('post-textarea');
    const title   = titleEl?.value?.trim() || '';
    const content = contentEl?.value?.trim() || '';

    if (!content) return toast('اكتب محتوى المنشور أولاً', 'error');

    const btn = document.getElementById('post-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    const newPost = {
        title:        title || content.slice(0,60),
        content,
        author_id:    currentUser.id,
        author_name:  displayName(),
        upvotes:      0,
        downvotes:    0,
    };

    console.log('Inserting post:', newPost);

    const { data, error } = await db.from('posts').insert(newPost).select();

    if (btn) { btn.disabled = false; btn.innerHTML = 'نشر <i class="fa-solid fa-paper-plane"></i>'; }

    if (error) {
        console.error('Insert error:', error);
        toast('فشل النشر: ' + error.message, 'error');
        return;
    }

    console.log('Post inserted successfully:', data);
    if (titleEl) titleEl.value = '';
    if (contentEl) contentEl.value = '';
    toast('تم النشر! ✅', 'success');
    await fetchPosts();
}

async function handleVote(postId, voteType) {
    if (!currentUser) return openAuthModal();

    const post = allPostsCache.find(p => p.id === postId);
    if (!post) return;
    const current = myVotesCache[postId];

    if (current === voteType) {
        // إلغاء التصويت
        const { error: delErr } = await db.from('post_votes')
            .delete().eq('post_id', postId).eq('user_id', currentUser.id);
        if (delErr) return toast('فشل إلغاء التصويت: '+delErr.message, 'error');

        const field = voteType === 'upvote' ? 'upvotes' : 'downvotes';
        const newVal = Math.max(0, (post[field]||0) - 1);
        await db.from('posts').update({ [field]: newVal }).eq('id', postId);
        post[field] = newVal;
        delete myVotesCache[postId];
    } else {
        if (current) {
            // تغيير التصويت
            await db.from('post_votes')
                .update({ vote_type: voteType })
                .eq('post_id', postId).eq('user_id', currentUser.id);
            const oldField = current === 'upvote' ? 'upvotes' : 'downvotes';
            const newField = voteType === 'upvote' ? 'upvotes' : 'downvotes';
            post[oldField] = Math.max(0, (post[oldField]||0) - 1);
            post[newField] = (post[newField]||0) + 1;
            await db.from('posts').update({
                [oldField]: post[oldField],
                [newField]: post[newField],
            }).eq('id', postId);
        } else {
            // تصويت جديد
            const { error: insErr } = await db.from('post_votes')
                .insert({ post_id: postId, user_id: currentUser.id, vote_type: voteType });
            if (insErr) return toast('فشل التصويت: '+insErr.message, 'error');
            const field = voteType === 'upvote' ? 'upvotes' : 'downvotes';
            post[field] = (post[field]||0) + 1;
            await db.from('posts').update({ [field]: post[field] }).eq('id', postId);
        }
        myVotesCache[postId] = voteType;
    }

    renderTimeline();
}

async function deletePost(postId) {
    if (!currentUser) return;
    if (!confirm('حذف هذا المنشور؟')) return;
    const { error } = await db.from('posts').delete()
        .eq('id', postId).eq('author_id', currentUser.id);
    if (error) return toast('فشل الحذف: '+error.message, 'error');
    allPostsCache = allPostsCache.filter(p => p.id !== postId);
    delete myVotesCache[postId];
    renderTimeline();
    toast('تم الحذف', 'info');
}

function switchTab(tab) {
    currentTab = tab;
    document.getElementById('tab-latest')?.classList.toggle('active', tab==='latest');
    document.getElementById('tab-top')?.classList.toggle('active', tab==='top');
    renderTimeline();
}

function getSorted() {
    if (currentTab === 'top')
        return [...allPostsCache].sort((a,b)=>
            ((b.upvotes||0)-(b.downvotes||0)) - ((a.upvotes||0)-(a.downvotes||0)));
    return [...allPostsCache];
}

function renderTimeline() {
    const c = document.getElementById('posts-container');
    if (!c) return;
    const posts = getSorted();
    if (!posts.length) {
        c.innerHTML = `<div class="card" style="padding:50px 20px;text-align:center">
            <div style="font-size:2.5rem;margin-bottom:12px">📭</div>
            <p style="color:var(--muted);font-size:.9rem">لا توجد منشورات بعد.<br>كن أول من يشارك!</p>
        </div>`;
        return;
    }
    scrollY = window.scrollY;
    c.innerHTML = posts.map(postCard).join('');
    window.scrollTo(0, scrollY);
}

function postCard(post) {
    const name    = post.author_name || 'مجهول';
    const upv     = post.upvotes   || 0;
    const downv   = post.downvotes || 0;
    const net     = upv - downv;
    const myVote  = myVotesCache[post.id];
    const isOwner = currentUser && currentUser.id === post.author_id;
    const content = esc(post.content)
        .replace(/#(\S+)/g,'<span style="color:var(--accent2);cursor:pointer;font-weight:700" onclick="filterByTag(\'$1\')">#$1</span>');

    return `<div class="card fade-up" style="padding:0" data-id="${post.id}">
        <div style="padding:18px 20px 14px">
            <div style="display:flex;gap:12px">
                <div class="avatar av-sm" style="background:${getColor(name)};margin-top:2px">${getInitial(name)}</div>
                <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                            <span style="font-weight:800;font-size:.88rem;color:var(--dark)">${esc(name)}</span>
                            <span style="font-size:.72rem;color:var(--muted)">${fmtDate(post.created_at)}</span>
                        </div>
                        ${isOwner ? `<button onclick="deletePost(${post.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.8rem;padding:4px 8px;border-radius:8px;transition:color .15s" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='var(--muted)'"><i class="fa-regular fa-trash-can"></i></button>` : ''}
                    </div>
                    ${post.title ? `<div style="font-weight:800;font-size:.92rem;color:var(--dark);margin-bottom:5px">${esc(post.title)}</div>` : ''}
                    <p style="font-size:.87rem;line-height:1.7;color:#2a2a2a;white-space:pre-wrap;margin:0">${content}</p>
                </div>
            </div>
        </div>
        <div style="padding:10px 20px 14px;border-top:1px solid var(--border);display:flex;align-items:center;gap:8px">
            <button class="reaction-btn ${myVote==='upvote'?'liked':''}" onclick="handleVote(${post.id},'upvote')">
                <i class="fa-solid fa-arrow-up"></i> ${fmtNum(upv)}
            </button>
            <button class="reaction-btn ${myVote==='downvote'?'disliked':''}" onclick="handleVote(${post.id},'downvote')">
                <i class="fa-solid fa-arrow-down"></i> ${fmtNum(downv)}
            </button>
            <span style="font-size:.75rem;color:var(--muted);font-weight:700;margin-right:auto">${net>=0?'+':''}${net}</span>
        </div>
    </div>`;
}

function filterByTag(tag) {
    navigateTo('timeline');
    currentTab = 'latest';
    const filtered = allPostsCache.filter(p =>
        p.content?.includes('#'+tag) || p.title?.includes('#'+tag));
    const c = document.getElementById('posts-container');
    if (!c) return;
    if (!filtered.length) {
        c.innerHTML = `<div class="card" style="padding:32px;text-align:center;color:var(--muted)">
            لا توجد منشورات بوسم #${esc(tag)}</div>`;
        return;
    }
    c.innerHTML = filtered.map(postCard).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPLORE, PROFILE, STATS (نفس السابق مع تحسينات بسيطة)
// ══════════════════════════════════════════════════════════════════════════════
function renderExplorePage() {
    const el = document.getElementById('explore-posts');
    if (!el) return;
    const top = [...allPostsCache]
        .sort((a,b)=>((b.upvotes||0)-(b.downvotes||0))-((a.upvotes||0)-(a.downvotes||0)))
        .slice(0,10);
    el.innerHTML = top.length ? top.map(postCard).join('') :
        '<p style="color:var(--muted);font-size:.85rem;text-align:center;padding:20px">لا توجد منشورات بعد.</p>';
}

function renderProfilePage() {
    if (!currentUser) return;
    const name    = displayName();
    const initial = getInitial(name);
    const color   = getColor(name);

    const set = (id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
    const css = (id,p,v)=>{ const el=document.getElementById(id); if(el) el.style[p]=v; };

    set('profile-display-name', name);
    set('profile-username', currentUser.email||'');
    set('profile-avatar', initial);
    css('profile-avatar','background',color);

    const myPosts = allPostsCache.filter(p => p.author_id === currentUser.id);
    const myVotes = myPosts.reduce((s,p)=>s+(p.upvotes||0),0);
    set('profile-posts-count', myPosts.length);
    set('profile-votes-count', fmtNum(myVotes));
    set('profile-rooms-count','—');

    const listEl = document.getElementById('profile-posts-list');
    if (!listEl) return;
    listEl.innerHTML = myPosts.length
        ? myPosts.map(p=>`<div class="card" style="padding:16px">
            ${p.title?`<div style="font-weight:800;font-size:.88rem;margin-bottom:5px;color:var(--dark)">${esc(p.title)}</div>`:''}
            <p style="font-size:.85rem;line-height:1.65;color:#2a2a2a;margin:0 0 10px;white-space:pre-wrap">${esc(p.content)}</p>
            <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:.72rem;color:var(--muted)">${fmtDate(p.created_at)}</span>
                <div style="display:flex;gap:10px;align-items:center">
                    <span style="font-size:.75rem;color:var(--muted);font-weight:700">
                        <i class="fa-solid fa-arrow-up" style="color:#22c55e"></i> ${p.upvotes||0}
                    </span>
                    <button onclick="deletePost(${p.id})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:.8rem">
                        <i class="fa-regular fa-trash-can"></i>
                    </button>
                </div>
            </div>
        </div>`).join('')
        : '<p style="text-align:center;color:var(--muted);padding:24px 0;font-size:.88rem">لم تنشر شيئاً بعد 📝</p>';
}

async function updateStats() {
    const postsEl = document.getElementById('stat-posts');
    const roomsEl = document.getElementById('stat-rooms');
    if (postsEl) postsEl.textContent = fmtNum(allPostsCache.length);
    if (roomsEl) {
        const { count, error } = await db.from('audio_rooms')
            .select('id', { count:'exact', head:true })
            .eq('is_active', true);
        if (error) console.error('updateStats rooms error:', error);
        roomsEl.textContent = fmtNum(count||0);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// AUDIO ROOMS (مع تشخيص)
// ══════════════════════════════════════════════════════════════════════════════
async function fetchRooms() {
    const { data, error } = await db
        .from('audio_rooms')
        .select('id,title,host_name,host_id,is_active,created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
    if (error) { console.error('fetchRooms error:', error); return; }
    renderRooms(data||[]);
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
        return `<div class="room-card card-hover" onclick="joinRoom('${room.id}','${esc(room.title).replace(/'/g,"\\'")}','${room.host_id}')">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px">
                <div style="flex:1;min-width:0">
                    <h3 style="font-size:1rem;font-weight:800;color:var(--dark);margin:0 0 8px;line-height:1.4">${esc(room.title)}</h3>
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                        <div class="avatar av-sm" style="background:${getColor(hostName)}">${getInitial(hostName)}</div>
                        <span class="badge badge-host">🎤 ${esc(hostName)}</span>
                        <span style="font-size:.7rem;color:var(--muted)">${fmtDate(room.created_at)}</span>
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
                    <i class="fa-solid fa-headphones" style="color:var(--accent)"></i> انقر للانضمام
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
    setTimeout(()=>document.getElementById('room-title-input')?.focus(),300);
}
function hideCreateRoomModal() {
    document.getElementById('create-room-modal').classList.add('hidden');
}
function outsideCloseRoom(e) {
    if (e.target.id==='create-room-modal') hideCreateRoomModal();
}

async function createNewAudioRoom() {
    if (!currentUser) { openAuthModal(); return; }
    const input = document.getElementById('room-title-input');
    const title = input?.value?.trim();
    if (!title) return toast('أدخل عنوان المجلس','error');

    const btn = document.querySelector('#create-room-modal .btn-accent');
    if (btn) { btn.textContent='...'; btn.disabled=true; }

    const name = displayName();

    const { data, error } = await db.from('audio_rooms').insert({
        title,
        host_id:   currentUser.id,
        host_name: name,
        is_active: true,
    }).select('id,title,host_id').single();

    if (btn) { btn.innerHTML='ابدأ الآن 🚀'; btn.disabled=false; }
    if (error) {
        console.error('Create room error:', error);
        return toast('فشل إنشاء الغرفة: '+error.message,'error');
    }

    if (input) input.value='';
    hideCreateRoomModal();
    toast('تم إطلاق المجلس! 🚀','success');
    await fetchRooms();
    if (data) joinRoom(data.id, data.title, data.host_id);
}

async function joinRoom(roomId, title, hostId) {
    if (!currentUser) return openAuthModal();
    if (currentRoom) await leaveCurrentAudioRoom(true);

    const userName = displayName();
    const roomName = `room_${roomId}`;

    try {
        const res = await fetch('/api/livekit-token', {
            method:  'POST',
            headers: { 'Content-Type':'application/json' },
            body:    JSON.stringify({ roomName, participantName: userName }),
        });
        if (!res.ok) {
            const text = await res.text();
            console.error('Token fetch failed:', res.status, text);
            throw new Error(`HTTP ${res.status}: ${text}`);
        }
        const { token, wsUrl } = await res.json();
        if (!token || !wsUrl) throw new Error('Invalid token response');

        const room = new LivekitClient.Room({ adaptiveStream:true, dynacast:true });

        room.on(LivekitClient.RoomEvent.TrackSubscribed, track => {
            if (track.kind === LivekitClient.Track.Kind.Audio) {
                track.attach().play().catch(e=>console.warn('Audio play error:', e));
            }
        });

        const onRoomChange = () => refreshRoomUI(room);
        room.on(LivekitClient.RoomEvent.ParticipantConnected,    onRoomChange);
        room.on(LivekitClient.RoomEvent.ParticipantDisconnected, onRoomChange);
        room.on(LivekitClient.RoomEvent.TrackMuted,              onRoomChange);
        room.on(LivekitClient.RoomEvent.TrackUnmuted,            onRoomChange);

        await room.connect(wsUrl, token);
        await room.localParticipant.setMicrophoneEnabled(false).catch(()=>{});

        currentRoom       = room;
        currentRoomId     = roomId;
        currentRoomHostId = hostId;
        isCurrentUserHost = currentUser.id === hostId;

        document.getElementById('active-room-panel').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        document.getElementById('active-room-title').textContent = title;
        document.getElementById('active-room-role').textContent  =
            isCurrentUserHost ? 'أنت المضيف 👑' : 'مستمع في الجمهور';

        const closeBtn = document.getElementById('close-active-room-btn');
        if (closeBtn) closeBtn.style.display = isCurrentUserHost ? 'inline-flex' : 'none';

        updateMicBtn();
        refreshRoomUI(room);
        window.addEventListener('beforeunload', quietLeave);
        toast(`دخلت "${title}" 🎙️`,'success');

    } catch(err) {
        console.error('joinRoom error:', err);
        toast('تعذر الانضمام: '+err.message,'error');
    }
}

function refreshRoomUI(room) {
    const sg = document.getElementById('speakers-grid');
    const lg = document.getElementById('listeners-grid');
    if (!sg||!lg) return;

    const local   = room.localParticipant;
    const remotes = Array.from(room.remoteParticipants?.values() || []);
    const all = [
        { identity: local.identity, isMicOn: local.isMicrophoneEnabled, isLocal: true },
        ...remotes.map(p=>({ identity: p.identity, isMicOn: p.isMicrophoneEnabled, isLocal: false })),
    ];

    const stage    = all.slice(0, Math.min(8, all.length));
    const audience = all.slice(Math.min(8, all.length));

    sg.innerHTML = stage.map(p => {
        const c    = getColor(p.identity);
        const init = getInitial(p.identity);
        const spk  = p.isMicOn ? 'speaking' : '';
        return `<div class="speaker-bubble">
            <div class="speaker-avatar ${spk}" style="background:${c}">
                ${init}
                <span class="speaker-mic ${p.isMicOn?'on':'off'}">
                    <i class="fa-solid ${p.isMicOn?'fa-microphone':'fa-microphone-slash'}" style="color:#fff;font-size:8px"></i>
                </span>
            </div>
            <div style="font-size:.72rem;font-weight:700;color:rgba(255,255,255,.85);max-width:78px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                ${esc(p.identity)}${p.isLocal?' 👤':''}
            </div>
            ${p.isLocal&&isCurrentUserHost?'<div style="font-size:.6rem;color:#f59e0b;font-weight:800">مضيف 👑</div>':''}
        </div>`;
    }).join('');

    lg.innerHTML = audience.length
        ? audience.map(p=>`<div class="listener-bubble" style="background:${getColor(p.identity)}" title="${esc(p.identity)}">${getInitial(p.identity)}</div>`).join('')
        : '<span style="font-size:.78rem;color:rgba(255,255,255,.3)">لا يوجد جمهور بعد</span>';
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
        toast(next?'🎙️ الميكروفون شغّال':'🔇 الميكروفون صامت','info');
    } catch(e) { toast('تعذر التحكم في الميكروفون','error'); }
}

function raiseHand() {
    const btn = document.getElementById('raise-hand-btn');
    if (!btn) return;
    const raised = btn.classList.toggle('raised');
    toast(raised?'✋ رفعت يدك':'أنزلت يدك','info');
}

async function leaveCurrentAudioRoom(silent=false) {
    if (currentRoom) {
        try { currentRoom.disconnect(); } catch(e){}
        currentRoom=null; currentRoomId=null; currentRoomHostId=null; isCurrentUserHost=false;
    }
    window.removeEventListener('beforeunload', quietLeave);
    document.getElementById('active-room-panel')?.classList.add('hidden');
    document.body.style.overflow = '';
    const sg=document.getElementById('speakers-grid');
    const lg=document.getElementById('listeners-grid');
    if (sg) sg.innerHTML='';
    if (lg) lg.innerHTML='';
    if (!silent) { toast('غادرت المجلس 👋','info'); fetchRooms(); }
}

function quietLeave() {
    if (currentRoom) try { currentRoom.disconnect(); } catch(e){}
}

async function closeCurrentRoom() {
    if (!currentRoomId||!isCurrentUserHost) return;
    if (!confirm('إغلاق الغرفة نهائياً؟')) return;
    const { error } = await db.from('audio_rooms')
        .update({ is_active:false }).eq('id', currentRoomId);
    if (error) return toast('فشل الإغلاق: '+error.message,'error');
    await leaveCurrentAudioRoom();
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTER
// ══════════════════════════════════════════════════════════════════════════════
const VIEWS = ['timeline','rooms','explore','profile'];

function navigateTo(view) {
    VIEWS.forEach(v => {
        document.getElementById(v+'-view')?.classList.add('hidden');
        document.getElementById('nav-'+v)?.classList.remove('active');
        document.getElementById('mob-nav-'+v)?.classList.remove('active');
    });
    document.getElementById(view+'-view')?.classList.remove('hidden');
    document.getElementById('nav-'+view)?.classList.add('active');
    document.getElementById('mob-nav-'+view)?.classList.add('active');

    if (view === 'rooms')   fetchRooms();
    if (view === 'explore') renderExplorePage();
    if (view === 'profile') {
        if (!currentUser) { openAuthModal(); return; }
        renderProfilePage();
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTS + BOOT
// ══════════════════════════════════════════════════════════════════════════════
Object.assign(window, {
    navigateTo, openAuthModal, closeAuthModal, outsideCloseAuth,
    switchToSignup, switchToLogin, handleLogin, handleSignup, handleLogout,
    createPost, handleVote, deletePost, switchTab, filterByTag,
    showCreateRoomModal, hideCreateRoomModal, outsideCloseRoom,
    createNewAudioRoom, joinRoom, leaveCurrentAudioRoom, closeCurrentRoom,
    toggleMic, raiseHand,
});

document.addEventListener('DOMContentLoaded', async () => {
    console.log('App starting...');
    const { data:{ session } } = await db.auth.getSession();
    currentUser = session?.user ?? null;
    console.log('Initial session user:', currentUser?.email);
    updateUIForAuth();
    await fetchPosts();
    if (currentUser) fetchMyVotes();

    document.getElementById('post-submit-btn')?.addEventListener('click', createPost);

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (!document.getElementById('create-room-modal')?.classList.contains('hidden')) hideCreateRoomModal();
        if (!document.getElementById('auth-modal')?.classList.contains('hidden'))        closeAuthModal();
    });
});
