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
function renderRooms(rooms) { /* ... no changes ... */ }
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
        document.getElementById('active-room-panel').classList.remove('hidden');
        const closeBtn = document.getElementById('close-active-room-btn');
        if (isHost) closeBtn.classList.remove('hidden');
        else closeBtn.classList.add('hidden');

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
    const container = document.getElementById('room-participants-list');
    if (!container) return;
    const participants = Array.from(room.participants.values());
    const local = room.localParticipant;
    let html = `
        <div class="flex items-center justify-between p-2 rounded-lg bg-gray-800 participant-item">
            <div class="flex items-center gap-2">
                <i class="fa-solid fa-circle-user text-gray-300"></i>
                <span class="font-medium text-white">${esc(local.identity)} (أنت)</span>
            </div>
            <div>
                ${local.isMicrophoneEnabled ? '<i class="fa-solid fa-microphone text-green-400"></i>' : '<i class="fa-solid fa-microphone-slash text-red-400"></i>'}
            </div>
        </div>
    `;
    for (const p of participants) {
        html += `
            <div class="flex items-center justify-between p-2 rounded-lg bg-gray-700 participant-item">
                <div class="flex items-center gap-2">
                    <i class="fa-solid fa-circle-user text-gray-300"></i>
                    <span class="font-medium text-white">${esc(p.identity)}</span>
                </div>
                <div>
                    ${p.isMicrophoneEnabled ? '<i class="fa-solid fa-microphone text-green-400"></i>' : '<i class="fa-solid fa-microphone-slash text-red-400"></i>'}
                </div>
            </div>
        `;
    }
    container.innerHTML = html || '<div class="text-gray-400 text-sm text-center">لا يوجد مشاركون آخرون</div>';
}

function updateMicButtonState() {
    const btn = document.getElementById('mute-btn');
    if (!btn || !currentRoom) return;
    const isMuted = !currentRoom.localParticipant.isMicrophoneEnabled;
    btn.dataset.muted = isMuted;
    btn.innerHTML = isMuted ? `<i class="fa-solid fa-microphone-slash ml-1"></i> كتم` : `<i class="fa-solid fa-microphone ml-1"></i> الميك شغال`;
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
    document.getElementById('active-room-panel').classList.add('hidden');
    const container = document.getElementById('room-participants-list');
    if (container) container.innerHTML = '<div class="text-gray-400 text-sm text-center">لم تنضم إلى أي غرفة</div>';
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
});
