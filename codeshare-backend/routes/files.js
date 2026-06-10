const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const supabase = require('../utils/supabase');
const { optionalToken } = require('../middleware/auth');

const router = express.Router();

// Memory storage to process files directly in buffer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files (jpg, jpeg, png, webp) are allowed!'));
  }
});

// Ensure public/uploads folder exists for local mock fallback
const localUploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(localUploadDir)) {
  fs.mkdirSync(localUploadDir, { recursive: true });
}

// ── POST /api/rooms/:roomId/files (Upload Screenshot) ────────────────────────
router.post('/:roomId/files', optionalToken, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File is too large. Max size allowed is 2MB.' });
      }
      return res.status(400).json({ error: err.message });
    }

    try {
      const { roomId } = req.params;
      const { caption } = req.body;
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
      }

      // Check if room exists
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('id')
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        return res.status(404).json({ error: 'Room not found.' });
      }

      const filename = `cs_ss_${Date.now()}_${Math.random().toString(36).slice(2)}${path.extname(req.file.originalname).toLowerCase()}`;
      let fileUrl = '';

      // Check if we are running in Mock Supabase mode (which doesn't have storage properties)
      const isMock = !supabase.storage;

      if (isMock) {
        // Local Mock upload: save to file system and serve locally
        const localFilePath = path.join(localUploadDir, filename);
        fs.writeFileSync(localFilePath, req.file.buffer);
        
        const port = process.env.PORT || 4000;
        fileUrl = `${req.protocol}://${req.hostname}:${port}/uploads/${filename}`;
        console.log(`[MOCK UPLOAD] File saved locally: ${localFilePath} -> ${fileUrl}`);
      } else {
        // Live Supabase upload: upload to bucket
        const filePath = `rooms/${roomId}/${filename}`;
        const { data, error: uploadError } = await supabase.storage
          .from('codeshare-files')
          .upload(filePath, req.file.buffer, {
            contentType: req.file.mimetype,
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Supabase Storage upload error:', uploadError);
          return res.status(500).json({ error: 'Failed to upload image to cloud storage.' });
        }

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from('codeshare-files')
          .getPublicUrl(filePath);

        fileUrl = publicUrlData.publicUrl;
        console.log(`[LIVE UPLOAD] File uploaded to Supabase Storage: ${fileUrl}`);
      }

      // Record file entry in the database
      const { data: fileEntry, error: insertError } = await supabase
        .from('files')
        .insert({
          room_id: roomId,
          uploader_id: req.userId || null,
          file_name: req.file.originalname,
          file_url: fileUrl,
          file_type: req.file.mimetype,
          caption: caption || null
        })
        .select()
        .single();

      if (insertError) {
        console.error('Record file metadata in DB error:', insertError);
        return res.status(500).json({ error: 'Failed to record file details.' });
      }

      // Get uploader username
      let uploaderName = 'Guest';
      if (fileEntry.uploader_id) {
        const { data: user } = await supabase
          .from('users')
          .select('username')
          .eq('id', fileEntry.uploader_id)
          .single();
        if (user) uploaderName = user.username;
      }

      res.status(201).json({
        ...fileEntry,
        uploaderName
      });
    } catch (err) {
      console.error('File upload catch error:', err.message);
      res.status(500).json({ error: err.message || 'Server error uploading file.' });
    }
  });
});

// ── GET /api/rooms/:roomId/files (Retrieve Gallery) ──────────────────────────
router.get('/:roomId/files', async (req, res) => {
  try {
    const { roomId } = req.params;

    // Fetch files from database
    const { data: files, error: fetchError } = await supabase
      .from('files')
      .select('*')
      .eq('room_id', roomId);

    if (fetchError) {
      console.error('Fetch room files error:', fetchError);
      return res.status(500).json({ error: 'Failed to retrieve files.' });
    }

    if (!files || files.length === 0) {
      return res.json([]);
    }

    // Fetch all user details to map names
    const uploaderIds = [...new Set(files.filter(f => f.uploader_id).map(f => f.uploader_id))];
    let userMap = {};

    if (uploaderIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, username')
        .in('id', uploaderIds);
      
      if (users) {
        users.forEach(u => {
          userMap[u.id] = u.username;
        });
      }
    }

    const result = files.map(f => ({
      ...f,
      uploaderName: f.uploader_id ? (userMap[f.uploader_id] || 'User') : 'Guest'
    }));

    res.json(result);
  } catch (err) {
    console.error('Fetch files catch error:', err);
    res.status(500).json({ error: 'Server error retrieving files.' });
  }
});

// ── DELETE /api/rooms/:roomId/files/:fileId (Delete Screenshot) ─────────────────
router.delete('/:roomId/files/:fileId', optionalToken, async (req, res) => {
  try {
    const { roomId, fileId } = req.params;

    // 1. Fetch file details
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .eq('room_id', roomId)
      .single();

    if (fileError || !file) {
      return res.status(404).json({ error: 'File not found.' });
    }

    // 2. Fetch room to find its workspace
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('owner_id, workspace_id')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    // 3. Authorize deletion: uploader, room creator, or workspace owner/admin
    let isAuthorized = false;

    if (req.userId) {
      // Check if current user is uploader
      if (file.uploader_id && file.uploader_id === req.userId) {
        isAuthorized = true;
      }
      // Check if current user is room owner
      else if (room.owner_id && room.owner_id === req.userId) {
        isAuthorized = true;
      }
      // Check if current user is workspace owner/admin
      else if (room.workspace_id) {
        const { data: membership } = await supabase
          .from('workspace_members')
          .select('role')
          .eq('workspace_id', room.workspace_id)
          .eq('user_id', req.userId)
          .single();

        if (membership && ['owner', 'admin'].includes(membership.role)) {
          isAuthorized = true;
        }
      }
    } else {
      // If anonymous guest, they must provide the owner token in headers or body to delete room files
      const clientOwnerToken = req.headers['x-owner-token'] || req.body.ownerToken;
      const { data: fullRoom } = await supabase.from('rooms').select('owner_token').eq('id', roomId).single();
      if (fullRoom && clientOwnerToken && fullRoom.owner_token === clientOwnerToken) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to delete this file.' });
    }

    // 4. Delete from storage (Supabase or local filesystem)
    const isMock = !supabase.storage;
    if (isMock) {
      // Local Mock deletion: extract filename from public URL
      const urlParts = file.file_url.split('/');
      const filename = urlParts[urlParts.length - 1];
      const localFilePath = path.join(localUploadDir, filename);
      if (fs.existsSync(localFilePath)) {
        try {
          fs.unlinkSync(localFilePath);
          console.log(`[MOCK DELETE] Local file deleted: ${localFilePath}`);
        } catch (err) {
          console.error('Failed to delete local file:', err.message);
        }
      }
    } else {
      // Live Supabase storage deletion: extract path from public URL
      const urlPath = file.file_url.split('/public/codeshare-files/')[1];
      if (urlPath) {
        const { error: storageError } = await supabase.storage
          .from('codeshare-files')
          .remove([urlPath]);

        if (storageError) {
          console.error('Supabase Storage delete error:', storageError);
        } else {
          console.log(`[LIVE DELETE] Supabase Storage file deleted: ${urlPath}`);
        }
      }
    }

    // 5. Delete from database
    const { error: deleteError } = await supabase
      .from('files')
      .delete()
      .eq('id', fileId);

    if (deleteError) {
      console.error('Failed to delete DB file record:', deleteError);
      return res.status(500).json({ error: 'Failed to delete file record from database.' });
    }

    res.json({ message: 'File deleted successfully.', fileId });
  } catch (err) {
    console.error('File delete catch error:', err);
    res.status(500).json({ error: 'Server error deleting file.' });
  }
});

module.exports = router;
