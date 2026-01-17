const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'temp/' });

const WEBHOOK_URL = 'https://discord.com/api/webhooks/1461435915674320947/Mb6MWGm2iMtFJ5ttpxU8Z9wXS5GjywTmu1xygEd5Nl4husKAFVLRb7hK3sB60eKQCbGD';

// UPDATED: Set to exactly 9.8 MB
const CHUNK_SIZE = 9.99 * 1024 * 1024; 

const DB_FILE = path.join(__dirname, 'database.json');

// Helper to prevent Discord rate limits
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let uploadStatus = { current: 0, total: 0, startTime: null, active: false };

app.use(express.static('public'));
app.use(express.json());

const getDb = () => fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : [];
const saveDb = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

app.get('/upload-status', (req, res) => res.json(uploadStatus));

app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const fileBuffer = fs.readFileSync(req.file.path);
        const totalChunks = Math.ceil(fileBuffer.length / CHUNK_SIZE);
        const chunks = [];

        // Instant update for the X/Y frontend counter
        uploadStatus = { current: 0, total: totalChunks, startTime: Date.now(), active: true };

        for (let i = 0; i < totalChunks; i++) {
            const part = fileBuffer.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            const form = new FormData();
            form.append('file', part, `${req.file.originalname}.p${i}`);
            
            const response = await axios.post(`${WEBHOOK_URL}?wait=true`, form, {
                headers: form.getHeaders(),
                maxBodyLength: Infinity
            });
            
            chunks.push({ url: response.data.attachments[0].url, msgId: response.data.id });
            
            // Increment slice counter
            uploadStatus.current = i + 1;
        }

        const db = getDb();
        db.push({
            id: Date.now().toString(),
            name: req.file.originalname,
            size: req.file.size,
            chunks: chunks,
            date: new Date().toLocaleString()
        });
        saveDb(db);
        fs.unlinkSync(req.file.path);
        uploadStatus.active = false;
        res.json({ success: true });
    } catch (err) {
        uploadStatus.active = false;
        res.status(500).send("Upload failed");
    }
});

app.get('/download/:id', async (req, res) => {
    const file = getDb().find(f => f.id === req.params.id);
    if (!file) return res.status(404).send("File not found");
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    for (const chunk of file.chunks) {
        const response = await axios.get(chunk.url, { responseType: 'stream' });
        response.data.pipe(res, { end: false });
        await new Promise((resolve) => response.data.on('end', resolve));
    }
    res.end();
});

app.get('/files', (req, res) => res.json(getDb()));

app.delete('/files/:id', async (req, res) => {
    let db = getDb();
    const file = db.find(f => f.id === req.params.id);
    if (file) {
        for (const chunk of file.chunks) {
            try { 
                await sleep(400); // Wait 0.4s between deletes to avoid rate limits
                await axios.delete(`${WEBHOOK_URL}/messages/${chunk.msgId}`); 
            } catch (e) {
                console.error(`Failed to delete slice ${chunk.msgId}:`, e.message);
            }
        }
        db = db.filter(f => f.id !== req.params.id);
        saveDb(db);
    }
    res.json({ success: true });
});

app.listen(3000, () => console.log('✅ Wesams Vault Ready'));
