import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { execFile, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';
import os from 'os';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app  = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Supabase (Service Role للباك إند فقط) ───────────────────────────────────
const SUPABASE_URL      = 'https://jnwqokkzywrctdjsdzbl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impud3Fva2t6eXdyY3RkanNkemJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTkxOTYsImV4cCI6MjA5NTM5NTE5Nn0.8RkJ2A1oJ9DaSD0Y8CdiNwvcfcr7iWyQZf5eKD3kpAo';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ success: true, message: 'Pulse Live Backend v3' }));

// ══════════════════════════════════════════════════════════════════════════════
// POSTS API
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/posts', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('posts')
            .select('*, comments(*)')
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/posts/create', async (req, res) => {
    const { author_name, title, content } = req.body;
    if (!content) return res.status(400).json({ success: false, message: 'المحتوى مطلوب' });
    try {
        const { data, error } = await supabase
            .from('posts')
            .insert([{ author_name: author_name || 'مستخدم', title: title || content.substring(0, 60), content }])
            .select();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/posts/comment', async (req, res) => {
    const { postId, author_name, content } = req.body;
    if (!postId || !content) return res.status(400).json({ success: false, message: 'بيانات ناقصة' });
    try {
        const { data, error } = await supabase
            .from('comments')
            .insert([{ post_id: postId, author_name: author_name || 'مستخدم', content }])
            .select();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/posts/vote', async (req, res) => {
    const { postId, userId, voteType } = req.body;
    if (!postId || !userId || !voteType)
        return res.status(400).json({ success: false, message: 'بيانات ناقصة' });
    try {
        const { data: existingVote } = await supabase
            .from('post_votes').select('*')
            .eq('post_id', postId).eq('user_id', userId).maybeSingle();

        const { data: post } = await supabase
            .from('posts').select('upvotes, downvotes').eq('id', postId).single();

        let up   = post.upvotes   || 0;
        let down = post.downvotes || 0;

        if (existingVote) {
            if (existingVote.vote_type === voteType) {
                await supabase.from('post_votes').delete().eq('id', existingVote.id);
                if (voteType === 'upvote') up   = Math.max(0, up   - 1);
                else                       down = Math.max(0, down - 1);
            } else {
                await supabase.from('post_votes').update({ vote_type: voteType }).eq('id', existingVote.id);
                if (voteType === 'upvote') { up += 1; down = Math.max(0, down - 1); }
                else                       { down += 1; up = Math.max(0, up - 1); }
            }
        } else {
            await supabase.from('post_votes').insert([{ post_id: postId, user_id: userId, vote_type: voteType }]);
            if (voteType === 'upvote') up += 1; else down += 1;
        }

        const { data: updated, error } = await supabase
            .from('posts').update({ upvotes: up, downvotes: down }).eq('id', postId).select();
        if (error) throw error;
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/posts/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { error } = await supabase.from('posts').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// AUDIO ROOMS API
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/rooms', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('audio_rooms').select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/rooms/create', async (req, res) => {
    const { title, host_name, host_id } = req.body;
    if (!title || !host_id)
        return res.status(400).json({ success: false, message: 'بيانات الغرفة غير مكتملة' });
    try {
        const { data, error } = await supabase
            .from('audio_rooms')
            .insert([{ title, host_name: host_name || 'مضيف', host_id, is_active: true }])
            .select();
        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/rooms/close', async (req, res) => {
    const { roomId } = req.body;
    try {
        const { error } = await supabase
            .from('audio_rooms').update({ is_active: false }).eq('id', roomId);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// SANDBOX ENGINE — تشغيل مستودعات GitHub معزولة
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/sandbox/run  { repoUrl, entryFile? }
// يستجيب بـ SSE stream للـ logs الحية
app.post('/api/sandbox/run', async (req, res) => {
    const { repoUrl, entryFile } = req.body;

    if (!repoUrl || !repoUrl.startsWith('https://github.com/'))
        return res.status(400).json({ success: false, message: 'رابط GitHub غير صالح' });

    // SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (type, msg) => {
        res.write(`data: ${JSON.stringify({ type, msg })}\n\n`);
    };

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-sandbox-'));

    try {
        // 1. Clone
        send('info', `📦 جاري استنساخ المستودع...`);
        await execFileAsync('git', ['clone', '--depth=1', repoUrl, tmpDir], { timeout: 30000 });
        send('success', `✅ تم الاستنساخ بنجاح`);

        // 2. كشف نوع المشروع
        const files = await fs.readdir(tmpDir);
        const hasPkg  = files.includes('package.json');
        const hasPy   = files.includes('requirements.txt') || files.some(f => f.endsWith('.py'));

        // 3. تحديد نقطة الدخول
        let runner, args, installCmd, installArgs;

        if (hasPkg) {
            send('info', '📦 مشروع Node.js — تثبيت الحزم...');
            await execFileAsync('npm', ['install', '--prefix', tmpDir], { timeout: 60000 });
            send('success', '✅ تم التثبيت');

            const pkgRaw  = await fs.readFile(path.join(tmpDir, 'package.json'), 'utf8');
            const pkg     = JSON.parse(pkgRaw);
            const entry   = entryFile || pkg.main || 'index.js';
            runner = 'node';
            args   = [path.join(tmpDir, entry)];
        } else if (hasPy) {
            send('info', '🐍 مشروع Python — تثبيت المتطلبات...');
            const reqFile = path.join(tmpDir, 'requirements.txt');
            const hasReq  = files.includes('requirements.txt');
            if (hasReq) {
                await execFileAsync('pip', ['install', '-r', reqFile, '--break-system-packages', '-q'], { timeout: 60000 });
                send('success', '✅ تم التثبيت');
            }
            const entry = entryFile || files.find(f => f === 'main.py' || f === 'app.py' || f.endsWith('.py'));
            runner = 'python3';
            args   = [path.join(tmpDir, entry)];
        } else {
            send('error', '❌ لم يتم التعرف على نوع المشروع (Python أو Node.js)');
            res.end();
            return;
        }

        // 4. تشغيل مع stream للـ output
        send('info', `🚀 جاري التشغيل: ${runner} ${args.join(' ')}`);

        const child = spawn(runner, args, {
            cwd: tmpDir,
            timeout: 60000,
            env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });

        child.stdout.on('data', d => send('log',   d.toString()));
        child.stderr.on('data', d => send('error', d.toString()));

        child.on('close', async (code) => {
            send(code === 0 ? 'success' : 'error', `\n⏹ انتهى التنفيذ — كود الخروج: ${code}`);
            res.end();
            await fs.rm(tmpDir, { recursive: true, force: true });
        });

        // إيقاف العملية لو العميل قطع الاتصال
        req.on('close', () => {
            child.kill('SIGTERM');
            fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        });

    } catch (err) {
        send('error', `❌ خطأ: ${err.message}`);
        res.end();
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
});

app.listen(PORT, () => console.log(`✅ Pulse Live Backend v3 — Port ${PORT}`));
