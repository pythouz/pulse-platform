// ══════════════════════════════════════════════════════════════════════════════
// Pulse Live — Frontend Engine v19 (Final LiveKit Audio Fix)
// ══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL      = 'https://jnwqokkzywrctdjsdzbl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impud3Fva2t6eXdyY3RkanNkemJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTkxOTYsImV4cCI6MjA5NTM5NTE5Nn0.8RkJ2A1oJ9DaSD0Y8CdiNwvcfcr7iWyQZf5eKD3kpAo';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser   = null;
let allPostsCache = [];
let scrollPositionBeforeRender = 0;

let currentRoom = null;
let currentRoomId = null;
let currentRoomHostId = null;

// ══════════════════════════════════════════════════════════════════════════════
// Helper functions
// ══════════════════════════════════════════════════════════════════════════════
function formatNumber(num) { /* ... no changes ... */ }
function sortPostsByNetVotes(posts) { /* ... no changes ... */ }
function preserveScrollBeforeRender() { /* ... no changes ... */ }
function restoreScrollAfterRender() { /* ... no changes ... */ }

function showStatusMessage(msg, type = 'info') {
    const toast = document.getElementById('status-msg');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden', 'bg-black', 'bg-green-600', 'bg-red-600');
    if (type === 'success') toast.classList.add('bg-green-600');
    else if (type === 'error') toast.classList.add('bg-red-600');
    else toast.classList.add('bg-black');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTER & AUTH
// ══════════════════════════════════════════════════════════════════════════════
function navigateTo(view) { /* ... no changes ... */ }
function openAuthModal()  { /* ... no changes ... */ }
function closeAuthModal() { /* ... no changes ... */ }
function switchToSignup() { /* ... no changes ... */ }
function switchToLogin() { /* ... no changes ... */ }
async function handleSignup() { /* ... no changes ... */ }
async function handleLogin() { /* ... no changes ... */ }
async function handleLogout() { /* ... no changes ... */ }
db.auth.onAuthStateChange((event, session) => { /* ... no changes ... */ });
function updateUIForAuth() { /* ... no changes ... */ }

// ══════════════════════════════════════════════════════════════════════════════
// POSTS
// ══════════════════════════════════════════════════════════════════════════════
async function fetchPosts() { /* ... no changes ... */ }
async function createPost() { /* ... no changes ... */ }
function renderTimeline(posts) { /* ... no changes ... */ }
async function handleVote(postId, voteType) { /* ... no changes ... */ }
async function submitComment(postId) { /* ... no changes ... */ }
async function deletePost(postId) { /* ... no changes ... */ }

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE
// ══════════════════════════════════════════════════════════════════════════════
function renderProfilePage() { /* ... no changes ... */ }

// ══════════════════════════════════════════════════════════════════════════════
// LIVEKIT AUDIO ROOMS (FIXED)
// ══════════════════════════════════════════════════════════════════════════════
async function fetchRooms() { /* ... no changes ... */ }
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
    const getColor = (name) => colors[Math.abs(Array.from(name||'A').reduce((a,c)=>a+c.charCodeAt(0),0)) % colors.length];
    const getInitial = (name) => (name||'?')[0].toUpperCase();

    grid.innerHTML = active.map(room => {
        const speakers  = room.speakers  || [];
        const listeners = room.listeners || [];
        const totalCount = room.participants_count || (speakers.length + listeners.length) || 0;

        const speakersHTML = speakers.slice(0,4).map(sp => {
            const color = getColor(sp.name);
            return `<div style="text-align:center">
                <div style="width:52px;height:52px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:800;color:#fff;margin:0 auto 6px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.12)">
                    ${getInitial(sp.name)}
                </div>
                <div style="font-size:0.68rem;color:#555;font-weight:600;max-width:56px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(sp.name||'')}</div>
            </div>`;
        }).join('');

        const listenersHTML = listeners.slice(0,8).map(li => {
            const color = getColor(li.name);
            return `<div style="width:36px;height:36px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:0.85rem;font-weight:700;color:#fff;border:2px solid #fff" title="${esc(li.name||'')}">
                ${getInitial(li.name)}
            </div>`;
        }).join('');

        const hostName = speakers[0]?.name || room.host_name || 'المضيف';

        return `<div class="ch-room-card" onclick="joinRoom('${room.id}','${esc(room.title)}','${room.host_id}')">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
                <div style="flex:1">
                    <h3 style="font-size:1rem;font-weight:800;color:#1a1a1a;margin:0 0 5px;line-height:1.35">${esc(room.title)}</h3>
                    <div style="font-size:0.72rem;color:#888;display:flex;align-items:center;gap:6px">
                        <span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:20px;font-weight:700;font-size:0.66rem">
                            🎤 ${esc(hostName)}
                        </span>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:4px;background:#fef2f2;border-radius:20px;padding:4px 10px">
                    <span style="width:6px;height:6px;background:#ef4444;border-radius:50%;animation:blink 1.2s infinite;display:inline-block"></span>
                    <span style="font-size:0.7rem;font-weight:700;color:#dc2626">مباشر</span>
                </div>
            </div>

            <!-- المتحدثون في الكارد -->
            ${speakersHTML ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">${speakersHTML}</div>` : ''}

            <div style="height:1px;background:#f5f5f5;margin:12px 0"></div>

            <div style="display:flex;align-items:center;justify-content:space-between">
                <div style="display:flex;gap:-8px">${listenersHTML}</div>
                <div style="font-size:0.75rem;color:#aaa;font-weight:600">
                    <i class="fa-solid fa-headphones" style="color:#d4a574;margin-left:4px"></i>
                    ${totalCount} مشارك
                </div>
            </div>
        </div>`;
    }).join('');
}
async function createNewAudioRoom() { /* ... no changes ... */ }

async function joinRoom(roomId, title, hostId) {
    if (!currentUser) return alert('يجب تسجيل الدخول للانضمام.');
    if (currentRoom) await leaveCurrentAudioRoom();

    const userName = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
    const roomName = `room_${roomId}`;

    try {
        console.log('📡 Requesting token for:', { roomName, participantName: userName });
        const tokenRes = await fetch('/api/livekit-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomName, participantName: userName })
        });
        if (!tokenRes.ok) {
            let errMsg = `HTTP ${tokenRes.status}`;
            try { const errData = await tokenRes.json(); errMsg = errData.error || errMsg; } catch(e) {}
            throw new Error(`فشل التوكن: ${errMsg}`);
        }
        const { token, wsUrl } = await tokenRes.json();
        console.log('✅ Token received');

        const room = new LivekitClient.Room();
        
        // الاستماع للأحداث الصوتية
        room.on('trackSubscribed', (track, publication, participant) => {
            console.log(`📢 Track subscribed from ${participant.identity} (${track.kind})`);
            if (track.kind === 'audio') {
                const audioElement = new Audio();
                track.attach(audioElement);
                audioElement.play().catch(e => console.warn('Autoplay failed:', e));
            }
        });
        room.on('trackPublished', (publication, participant) => {
            console.log(`🎙️ ${participant.identity} published ${publication.kind}`);
        });
        room.on('trackUnpublished', (publication, participant) => {
            console.log(`🔇 ${participant.identity} unpublished ${publication.kind}`);
        });

        await room.connect(wsUrl, token);
        console.log('🔌 Connected to LiveKit');

        // ✅ FIXED: استخدام الدالة الصحيحة مع إدارة الأذونات
        try {
            await room.localParticipant.setMicrophoneEnabled(true);
            console.log('🎤 Microphone enabled successfully');
        } catch (micErr) {
            console.error('❌ Microphone error:', micErr);
            alert('لم نتمكن من الوصول إلى الميكروفون. تأكد من منح الإذن.');
        }

        currentRoom = room;
        currentRoomId = roomId;
        currentRoomHostId = hostId;

        document.getElementById('active-room-title').textContent = title;
        const isHost = (currentUser.id === hostId);
        document.getElementById('active-room-role').textContent = isHost ? 'دورك: مضيف' : 'دورك: مستمع';
        document.getElementById('active-room-panel').style.display = 'flex';
        document.getElementById('active-room-panel').style.flexDirection = 'column';
        document.body.style.overflow = 'hidden';
        isCurrentUserHost = isHost;
        const closeBtn = document.getElementById('close-active-room-btn');
        if (isHost) closeBtn.style.display = 'flex';
        else closeBtn.style.display = 'none';

        updateParticipantsList(room);
        room.on('participantConnected', () => updateParticipantsList(room));
        room.on('participantDisconnected', () => updateParticipantsList(room));
        room.on('trackSubscribed', () => updateParticipantsList(room));
        room.on('trackUnsubscribed', () => updateParticipantsList(room));
        room.on('localParticipant.microphoneMuted', () => updateMicButtonState());
        room.on('localParticipant.microphoneUnmuted', () => updateMicButtonState());

        window.addEventListener('beforeunload', () => { if (currentRoom) currentRoom.disconnect(); });
        showStatusMessage(`دخلت إلى غرفة "${title}"`, 'success');
    } catch (err) {
        console.error('❌ Join room error:', err);
        alert('تعذر الانضمام إلى الغرفة الصوتية: ' + err.message);
    }
}

function updateParticipantsList(room) {
    const speakersGrid  = document.getElementById('speakers-grid');
    const listenersGrid = document.getElementById('listeners-grid');
    if (!speakersGrid || !listenersGrid) return;

    const colors = ['#6366f1','#8b5cf6','#ec4899','#10b981','#f59e0b','#3b82f6','#ef4444','#14b8a6'];
    const getColor = (name) => colors[Math.abs(Array.from(name||'A').reduce((a,c)=>a+c.charCodeAt(0),0)) % colors.length];
    const getInitial = (name) => (name||'?')[0].toUpperCase();

    const local = room.localParticipant;
    const remotes = Array.from(room.participants.values());
    const all = [{ identity: local.identity, isMicEnabled: local.isMicrophoneEnabled, isLocal: true }, ...remotes.map(p => ({ identity: p.identity, isMicEnabled: p.isMicrophoneEnabled, isLocal: false }))];

    // المضيف والمتحدثون (أول 2 مشاركين) → كبير
    const speakers  = all.slice(0, Math.min(6, all.length));
    const listeners = all.slice(Math.min(6, all.length));

    speakersGrid.innerHTML = speakers.map(p => {
        const color = getColor(p.identity);
        const initial = getInitial(p.identity);
        const isActive = p.isMicEnabled;
        const ring = isActive ? `border:3px solid #f9a825;animation:speakPulse 1.5s infinite;` : `border:3px solid rgba(255,255,255,.15);`;
        return `<div style="text-align:center;min-width:80px">
            <div style="width:72px;height:72px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:900;color:#fff;margin:0 auto 8px;${ring}box-sizing:border-box;position:relative">
                ${initial}
                ${isActive ? `<span style="position:absolute;bottom:2px;right:2px;width:18px;height:18px;border-radius:50%;background:#22c55e;border:2px solid #0f3460;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-microphone" style="font-size:8px;color:#fff"></i></span>` : `<span style="position:absolute;bottom:2px;right:2px;width:18px;height:18px;border-radius:50%;background:#374151;border:2px solid #0f3460;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-microphone-slash" style="font-size:8px;color:#9ca3af"></i></span>`}
            </div>
            <div style="font-size:0.75rem;font-weight:700;color:rgba(255,255,255,.9);max-width:80px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0 auto">${esc(p.identity)}${p.isLocal ? ' 👤' : ''}</div>
            ${p.isLocal && isCurrentUserHost ? `<div style="font-size:0.62rem;color:#f9a825;font-weight:700;margin-top:2px">مضيف</div>` : ''}
        </div>`;
    }).join('');

    listenersGrid.innerHTML = listeners.length > 0
        ? listeners.map(p => {
            const color = getColor(p.identity);
            const initial = getInitial(p.identity);
            return `<div title="${esc(p.identity)}" style="text-align:center">
                <div style="width:48px;height:48px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:700;color:#fff;opacity:.85">
                    ${initial}
                </div>
                <div style="font-size:0.62rem;color:rgba(255,255,255,.5);margin-top:4px;max-width:48px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.identity)}</div>
            </div>`;
          }).join('')
        : `<div style="color:rgba(255,255,255,.35);font-size:0.8rem">لا يوجد جمهور بعد</div>`;
}

let isCurrentUserHost = false;

function updateMicButtonState() {
    const btn = document.getElementById('mute-btn');
    if (!btn || !currentRoom) return;
    const isMuted = !currentRoom.localParticipant.isMicrophoneEnabled;
    btn.dataset.muted = isMuted;
    if (isMuted) {
        btn.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
        btn.style.background = 'rgba(255,255,255,.12)';
        btn.style.animation = '';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        btn.style.background = 'rgba(34,197,94,0.25)';
        btn.style.animation = 'micActive 1s infinite';
        btn.style.boxShadow = '0 0 0 0 rgba(34,197,94,0.7)';
    }
}

async function toggleMic() {
    if (!currentRoom) return;
    if (currentRoom.localParticipant.isMicrophoneEnabled) {
        await currentRoom.localParticipant.setMicrophoneEnabled(false);
    } else {
        await currentRoom.localParticipant.setMicrophoneEnabled(true);
    }
    updateMicButtonState();
}

async function leaveCurrentAudioRoom() {
    if (currentRoom) {
        currentRoom.disconnect();
        currentRoom = null;
        currentRoomId = null;
        currentRoomHostId = null;
    }
    const panel = document.getElementById('active-room-panel');
    if (panel) panel.style.display = 'none';
    document.body.style.overflow = '';
    isCurrentUserHost = false;
    const sg = document.getElementById('speakers-grid');
    const lg = document.getElementById('listeners-grid');
    if (sg) sg.innerHTML = '';
    if (lg) lg.innerHTML = '';
}

async function closeCurrentRoom() {
    if (!currentRoomId) return;
    if (!confirm('هل تريد إغلاق هذه الغرفة نهائياً؟')) return;
    const { error } = await db.from('audio_rooms').update({ is_active: false }).eq('id', currentRoomId);
    if (error) return alert('فشل إغلاق الغرفة: ' + error.message);
    await leaveCurrentAudioRoom();
    fetchRooms();
    navigateTo('rooms');
}

// ══════════════════════════════════════════════════════════════════════════════
// SANDBOX
// ══════════════════════════════════════════════════════════════════════════════
let sandboxController = null;

async function runSandbox() { /* ... no changes ... */ }
function stopSandbox() { /* ... no changes ... */ }
function appendLog(terminal, type, msg) { /* ... no changes ... */ }
function clearTerminal() { /* ... no changes ... */ }

// ══════════════════════════════════════════════════════════════════════════════
// STATS & UTILS
// ══════════════════════════════════════════════════════════════════════════════
function updateStats() { /* ... no changes ... */ }
function esc(str) { /* ... no changes ... */ }

// ══════════════════════════════════════════════════════════════════════════════
// CLUBHOUSE HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function showCreateRoomModal() {
    if (!currentUser) { openAuthModal(); return; }
    const modal = document.getElementById('create-room-modal');
    if (modal) { modal.style.display = 'flex'; }
}

function hideCreateRoomModal(event) {
    const modal = document.getElementById('create-room-modal');
    if (!modal) return;
    // إغلاق عند الضغط على الخلفية فقط
    if (event && event.target !== modal) return;
    modal.style.display = 'none';
}

function raiseHand() {
    const btn = document.getElementById('raise-hand-btn');
    if (!btn) return;
    const isRaised = btn.dataset.raised === 'true';
    if (isRaised) {
        btn.style.background = 'rgba(255,255,255,.08)';
        btn.dataset.raised = 'false';
        showStatusMessage('أنزلت يدك', 'info');
    } else {
        btn.style.background = 'rgba(249,168,37,0.25)';
        btn.style.border = '2px solid rgba(249,168,37,0.5)';
        btn.dataset.raised = 'true';
        showStatusMessage('رفعت يدك ✋', 'success');
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL EXPORTS
// ══════════════════════════════════════════════════════════════════════════════
window.showCreateRoomModal   = showCreateRoomModal;
window.hideCreateRoomModal   = hideCreateRoomModal;
window.raiseHand             = raiseHand;
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

    // إغلاق مودال الغرفة عند الضغط على Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('create-room-modal');
            if (modal && modal.style.display === 'flex') hideCreateRoomModal({ target: modal });
        }
    });
});
