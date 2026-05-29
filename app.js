async function joinRoom(roomId, title, hostId) {
    if (!currentUser) return alert('يجب تسجيل الدخول للانضمام.');
    if (currentRoom) await leaveCurrentAudioRoom();

    const userName = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
    const roomName = `room_${roomId}`;

    try {
        console.log('📡 Requesting token...');
        const tokenRes = await fetch('/api/livekit-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomName, participantName: userName })
        });
        if (!tokenRes.ok) throw new Error(`HTTP ${tokenRes.status}`);
        const { token, wsUrl } = await tokenRes.json();

        const room = new LivekitClient.Room();

        // معالجة المقاطع الصوتية القادمة (للاستماع إلى الآخرين)
        room.on('trackSubscribed', (track, publication, participant) => {
            console.log(`📢 Track from ${participant.identity} (${track.kind})`);
            if (track.kind === 'audio') {
                const audioElement = new Audio();
                track.attach(audioElement);
                // محاولة التشغيل، وإذا فشل سنعرض رسالة
                audioElement.play().catch(e => {
                    console.warn(`Autoplay blocked for ${participant.identity}`, e);
                    // نخزن أن هذا المستخدم يحتاج إلى تفعيل يدوي
                    if (!window._pendingAudioUsers) window._pendingAudioUsers = new Set();
                    window._pendingAudioUsers.add(participant.identity);
                    showStatusMessage(`⚠️ لتسمع ${participant.identity}، اضغط على زر "تفعيل الصوت"`, 'info');
                });
            }
        });

        room.on('trackPublished', (publication, participant) => {
            console.log(`🎙️ ${participant.identity} published ${publication.kind}`);
        });

        await room.connect(wsUrl, token);
        console.log('🔌 Connected');

        // طلب الإذن للميكروفون (للتحدث)
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            await room.localParticipant.setMicrophoneEnabled(true);
            console.log('🎤 Microphone enabled');
            showStatusMessage('الميكروفون نشط، يمكنك التحدث', 'success');
        } catch (micErr) {
            console.error('Mic permission denied:', micErr);
            alert('الرجاء السماح باستخدام الميكروفون لتتمكن من التحدث في الغرفة.');
        }

        currentRoom = room;
        currentRoomId = roomId;
        currentRoomHostId = hostId;

        // تحديث واجهة المستخدم
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

        // إضافة زر تفعيل الصوت في لوحة الغرفة (إذا لم يكن موجوداً)
        let enableAudioBtn = document.getElementById('enable-audio-btn');
        if (!enableAudioBtn) {
            const panel = document.getElementById('active-room-panel');
            const btnDiv = document.createElement('div');
            btnDiv.className = 'mt-3 text-center';
            btnDiv.innerHTML = `<button id="enable-audio-btn" class="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-xl text-sm font-bold w-full"><i class="fa-solid fa-volume-up ml-1"></i> تفعيل الصوت (إذا كنت لا تسمع أحداً)</button>`;
            panel.appendChild(btnDiv);
            enableAudioBtn = document.getElementById('enable-audio-btn');
        }
        
        // وظيفة تفعيل الصوت لجميع المقاطع المعلقة
        const enableAllAudio = () => {
            if (!currentRoom) return;
            let activated = false;
            currentRoom.remoteParticipants.forEach(p => {
                p.audioTracks.forEach(trackPub => {
                    if (trackPub.track && !trackPub.track.isPlaying) {
                        const audioEl = new Audio();
                        trackPub.track.attach(audioEl);
                        audioEl.play().then(() => {
                            console.log(`✅ Audio enabled for ${p.identity}`);
                            activated = true;
                        }).catch(e => console.warn(`Still failed for ${p.identity}`, e));
                    }
                });
            });
            if (activated) showStatusMessage('✅ تم تفعيل الصوت بنجاح', 'success');
            else showStatusMessage('لا توجد مقاطع صوتية متوقفة، حاول مرة أخرى', 'info');
        };
        
        enableAudioBtn.onclick = enableAllAudio;
        
        // محاولة تلقائية بعد 2 ثانية (ربما تنجح)
        setTimeout(enableAllAudio, 2000);

        window.addEventListener('beforeunload', () => {
            if (currentRoom) currentRoom.disconnect();
        });
        
        showStatusMessage(`دخلت غرفة "${title}"`, 'success');
    } catch (err) {
        console.error('Join error:', err);
        alert('تعذر الانضمام: ' + err.message);
    }
}
