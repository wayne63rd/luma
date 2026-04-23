const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const { Low, JSONFile } = require('lowdb');
const { nanoid } = require('nanoid');

const JWT_SECRET = process.env.JWT_SECRET ||'23d3487a705259c28232dc60757134228f96c3d107aee4c8e65164c7622ab5877c889fe2dfd19322cd4e6c44d0c047130060bf81294d5fa06ae5f90ef80d41f';
  
const app = express();
const PORT = process.env.PORT || 3000;
const MAX_USERS = process.env.MAX_USERS ? Number(process.env.MAX_USERS) : Infinity; // set to numeric value to cap accounts, default unlimited

// Setup lowdb
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const file = path.join(__dirname, 'data', 'db.json');
const adapter = new JSONFile(file);
const db = new Low(adapter);

// Ensure data directory and db exist
// Ensure DB and directories exist
(async () => {
  await db.read();
  db.data = db.data || { users: [], videos: [], comments: [], notifications: [] };
  await db.write();
  // ensure uploads directory exists
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
})();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve front-end static files
app.use(express.static(path.join(__dirname, 'Frontend')));
// Serve uploaded files
app.use('db.json', express.static(path.join(__dirname, 'data', 'db.json')));

// Multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${nanoid(8)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 1 * 1024 * 1024 * 1024 } }); // 1GB limit
const uploadMultiple = multer({ storage, limits: { fileSize: 1 * 1024 * 1024 * 1024 } });

// Helpers
function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing Authorization' });
  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'Invalid Authorization' });
  const token = parts[1];
  try {
    const data = jwt.verify(token, JWT_SECRET);
    await db.read();
    const user = db.data.users.find(u => u.id === data.id);
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    req.user = { id: user.id, username: user.username, email: user.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Routes
app.post('/api/register', upload.single('profile_pic'), async (req, res) => {
  const { username, email, password, bio } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  await db.read();

  // Ensure we can scale up: no hard lock at 1000 users in default configuration
  if (Number.isFinite(MAX_USERS) && db.data.users.length >= MAX_USERS) {
    return res.status(503).json({ error: 'User capacity reached. Try later or set MAX_USERS higher on server.' });
  }

  const exists = db.data.users.find(u => u.email === email);
  if (exists) return res.status(400).json({ error: 'Email already registered' });
  const hashed = await bcrypt.hash(password, 10);
  let profilePicPath = '';
  if (req.file) {
    profilePicPath = `/uploads/${req.file.filename}`;
  }
  const user = { id: nanoid(), username, email, password_hash: hashed, profile_pic: profilePicPath, bio: bio || '', subscribers: 0 };
  db.data.users.push(user);
  await db.write();
  const token = generateToken(user);
  res.json({ token, user: { id: user.id, username: user.username, email: user.email, profile_pic: user.profile_pic, bio: user.bio } });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  await db.read();
  const user = db.data.users.find(u => u.email === email);
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
  const token = generateToken(user);
  res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
});

// Videos
app.get('/api/videos', async (req, res) => {
  await db.read();
  // Return lightweight video info with channel details
  const videos = db.data.videos.map(v => {
    const uploader = db.data.users.find(u => u.id === v.uploader_id);
    return { 
      id: v.id, 
      title: v.title, 
      description: v.description, 
      video_url: v.video_url, 
      thumbnail: v.thumbnail, 
      uploader_id: v.uploader_id,
      channel: uploader ? uploader.username : 'Unknown',
      uploader_avatar: uploader ? uploader.profile_pic : '',
      subscribers: uploader ? (uploader.subscribers || 0) : 0,
      views: v.views, 
      likes: (v.likes || []).length, 
      tags: v.tags || [],
      upload_date: v.upload_date,
      duration: v.duration || 0
    };
  });
  res.json(videos);
});

app.get('/api/videos/:id', async (req, res) => {
  const id = req.params.id;
  await db.read();
  const v = db.data.videos.find(x => x.id === id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  res.json(v);
});

app.get('/api/videos/trending', async (req, res) => {
  await db.read();
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  const videos = db.data.videos
    .filter(v => new Date(v.upload_date || v.createdAt || 0).getTime() >= oneDayAgo)
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 50);
  res.json(videos);
});

app.get('/api/my-videos', authMiddleware, async (req, res) => {
  await db.read();
  const videos = db.data.videos.filter(v => v.uploader_id === req.user.id);
  res.json(videos);
});

app.get('/api/subscriptions', authMiddleware, async (req, res) => {
  await db.read();
  const user = db.data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const subs = user.subscriptions || [];
  const videos = db.data.videos.filter(v => subs.includes(v.uploader_id));
  res.json(videos);
});

app.get('/api/watch-history', authMiddleware, async (req, res) => {
  res.json([]);
});

app.get('/api/liked-videos', authMiddleware, async (req, res) => {
  await db.read();
  const videos = db.data.videos.filter(v => Array.isArray(v.likes) && v.likes.includes(req.user.id));
  res.json(videos);
});

app.post('/api/users/:id/message', authMiddleware, async (req, res) => {
  const channelId = req.params.id;
  const { text, videoId } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing message text' });
  await db.read();
  const channel = db.data.users.find(u => u.id === channelId);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });
  const notif = {
    id: nanoid(),
    user_id: channel.id,
    from_user_id: req.user.id,
    from_username: req.user.username,
    type: 'message',
    message: text,
    video_id: videoId || null,
    title: `${req.user.username} sent you a message`,
    timestamp: new Date().toISOString(),
    read: false
  };
  db.data.notifications.push(notif);
  await db.write();
  res.json({ success: true });
});

app.post('/api/videos', authMiddleware, uploadMultiple.fields([{ name: 'video', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), async (req, res) => {
  const { title = '', description = '', tags = '' } = req.body;
  
  // Check if video file exists
  if (!req.files || !req.files.video || req.files.video.length === 0) {
    return res.status(400).json({ error: 'Missing video file' });
  }
  
  const videoFile = req.files.video[0];
  const videoFilepath = `/uploads/${videoFile.filename}`;
  
  // Handle thumbnail if provided
  let thumbnailPath = '';
  if (req.files.thumbnail && req.files.thumbnail.length > 0) {
    thumbnailPath = `/uploads/${req.files.thumbnail[0].filename}`;
  }
  
  // Parse hashtags from tags or description
  const hashtagRegex = /#\w+/g;
  const tagsList = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];
  const descriptionTags = description.match(hashtagRegex) || [];
  const allTags = [...new Set([...tagsList, ...descriptionTags])];
  
  const vid = { 
    id: nanoid(), 
    title, 
    description, 
    video_url: videoFilepath, 
    thumbnail: thumbnailPath,
    uploader_id: req.user.id, 
    views: 0, 
    likes: [], 
    tags: allTags,
    duration: 0,
    upload_date: new Date().toISOString() 
  };
  
  await db.read();
  db.data.videos.push(vid);
  await db.write();
  
  res.json(vid);
});

// Delete video
app.delete('/api/videos/:id', authMiddleware, async (req, res) => {
  const vidId = req.params.id;
  await db.read();
  const video = db.data.videos.find(v => v.id === vidId);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  if (video.uploader_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized to delete this video' });
  
  // Delete video file and thumbnail if they exist
  if (video.video_url) {
    const videoPath = path.join(__dirname, video.video_url.replace(/^\//, ''));
    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
  }
  if (video.thumbnail) {
    const thumbPath = path.join(__dirname, video.thumbnail.replace(/^\//, ''));
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  }
  
  // Remove from database
  db.data.videos = db.data.videos.filter(v => v.id !== vidId);
  // Also remove associated comments and likes
  db.data.comments = db.data.comments.filter(c => c.video_id !== vidId);
  await db.write();
  
  res.json({ success: true, message: 'Video deleted' });
});

// Update video duration
app.patch('/api/videos/:id/duration', authMiddleware, async (req, res) => {
  const vidId = req.params.id;
  const { duration } = req.body;
  if (duration === undefined || duration === null) {
    return res.status(400).json({ error: 'Missing duration' });
  }
  await db.read();
  const video = db.data.videos.find(v => v.id === vidId);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  if (video.uploader_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });
  video.duration = Math.round(duration);
  await db.write();
  res.json({ success: true, duration: video.duration });
});

// Comments
app.get('/api/videos/:id/comments', async (req, res) => {
  const vidId = req.params.id;
  await db.read();
  const comments = db.data.comments
    .filter(c => c.video_id === vidId)
    .map(c => {
      const user = db.data.users.find(u => u.id === c.user_id) || { username: 'Unknown', profile_pic: '' };
      return { id: c.id, video_id: c.video_id, user_id: c.user_id, username: user.username, profile_pic: user.profile_pic, text: c.text, timestamp: c.timestamp };
    });
  res.json(comments);
});

app.post('/api/videos/:id/comments', authMiddleware, async (req, res) => {
  const vidId = req.params.id;
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });
  await db.read();
  const video = db.data.videos.find(v => v.id === vidId);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  const comment = { id: nanoid(), video_id: vidId, user_id: req.user.id, text, timestamp: new Date().toISOString() };
  db.data.comments.push(comment);

  // Create notification for video uploader
  if (video.uploader_id !== req.user.id) {
    const notif = {
      id: nanoid(),
      user_id: video.uploader_id,
      from_user_id: req.user.id,
      from_username: req.user.username,
      type: 'comment',
      video_id: vidId,
      video_title: video.title,
      title: `${req.user.username} commented on your video`,
      message: `"${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
      avatar: '💬',
      timestamp: new Date().toISOString(),
      read: false
    };
    db.data.notifications.push(notif);
  }

  await db.write();
  res.json(comment);
});

// Like a comment
app.post('/api/videos/:id/comments/:commentId/like', authMiddleware, async (req, res) => {
  const { id: vidId, commentId } = req.params;
  await db.read();
  const comment = db.data.comments.find(c => c.id === commentId && c.video_id === vidId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  comment.likes = comment.likes || [];
  const idx = comment.likes.indexOf(req.user.id);
  if (idx === -1) {
    comment.likes.push(req.user.id);
  } else {
    comment.likes.splice(idx, 1);
  }
  await db.write();
  res.json({ likes: comment.likes.length, liked: idx === -1 });
});

// Reply to a comment
app.post('/api/videos/:id/comments/:commentId/replies', authMiddleware, async (req, res) => {
  const { id: vidId, commentId } = req.params;
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });
  await db.read();
  const comment = db.data.comments.find(c => c.id === commentId && c.video_id === vidId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  
  comment.replies = comment.replies || [];
  const reply = {
    id: nanoid(),
    user_id: req.user.id,
    text,
    timestamp: new Date().toISOString()
  };
  comment.replies.push(reply);
  
  // Create notification for comment author
  const commentAuthor = db.data.users.find(u => u.id === comment.user_id);
  if (commentAuthor && commentAuthor.id !== req.user.id) {
    const notif = {
      id: nanoid(),
      user_id: commentAuthor.id,
      from_user_id: req.user.id,
      from_username: req.user.username,
      type: 'reply',
      video_id: vidId,
      title: `${req.user.username} replied to your comment`,
      avatar: '💬',
      timestamp: new Date().toISOString(),
      read: false
    };
    db.data.notifications.push(notif);
  }
  
  await db.write();
  res.json({ ...reply, username: req.user.username });
});

// Get comment replies
app.get('/api/videos/:id/comments/:commentId/replies', async (req, res) => {
  const { id: vidId, commentId } = req.params;
  await db.read();
  const comment = db.data.comments.find(c => c.id === commentId && c.video_id === vidId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  
  const replies = (comment.replies || []).map(r => {
    const user = db.data.users.find(u => u.id === r.user_id) || { username: 'Unknown' };
    return {
      id: r.id,
      user_id: r.user_id,
      username: user.username,
      text: r.text,
      timestamp: r.timestamp,
      likes: (r.likes || []).length
    };
  });
  res.json(replies);
});

// Likes toggle
app.post('/api/videos/:id/likes', authMiddleware, async (req, res) => {
  const vidId = req.params.id;
  await db.read();
  const video = db.data.videos.find(v => v.id === vidId);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  video.likes = video.likes || [];
  const idx = video.likes.indexOf(req.user.id);
  if (idx === -1) {
    video.likes.push(req.user.id);
    // Create notification for video uploader
    const uploader = db.data.users.find(u => u.id === video.uploader_id);
    if (uploader && uploader.id !== req.user.id) {
      const notif = {
        id: nanoid(),
        user_id: uploader.id,
        from_user_id: req.user.id,
        from_username: req.user.username,
        type: 'like',
        video_id: vidId,
        video_title: video.title,
        title: `${req.user.username} liked your video`,
        message: `"${video.title}" got a new like`,
        avatar: '👍',
        timestamp: new Date().toISOString(),
        read: false
      };
      db.data.notifications.push(notif);
    }
  } else {
    video.likes.splice(idx, 1);
  }
  await db.write();
  res.json({ likes: video.likes.length, liked: idx === -1 });
});

// Subscribe/Unsubscribe endpoints
app.post('/api/users/:id/subscribe', authMiddleware, async (req, res) => {
  const channelId = req.params.id;
  const userId = req.user.id;
  
  if (channelId === userId) return res.status(400).json({ error: 'Cannot subscribe to yourself' });
  
  await db.read();
  const channel = db.data.users.find(u => u.id === channelId);
  const currentUser = db.data.users.find(u => u.id === userId);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });
  if (!currentUser) return res.status(404).json({ error: 'User not found' });

  // Initialize subscriptions array if it doesn't exist
  if (!channel.subscriptions) channel.subscriptions = [];
  if (!channel.subscribers) channel.subscribers = 0;
  if (!currentUser.subscriptions) currentUser.subscriptions = [];

  const idx = channel.subscriptions.indexOf(userId);
  let subscribed = false;

  if (idx === -1) {
    // Subscribe
    channel.subscriptions.push(userId);
    channel.subscribers = channel.subscriptions.length;
    if (!currentUser.subscriptions.includes(channelId)) currentUser.subscriptions.push(channelId);
    subscribed = true;

    // Create notification for channel owner
    const notif = {
      id: nanoid(),
      user_id: channelId,
      from_user_id: userId,
      from_username: req.user.username,
      type: 'subscribe',
      title: `${req.user.username} subscribed to your channel`,
      message: `You gained a new subscriber`,
      avatar: '🔔',
      timestamp: new Date().toISOString(),
      read: false
    };
    db.data.notifications.push(notif);
  } else {
    // Unsubscribe
    channel.subscriptions.splice(idx, 1);
    channel.subscribers = channel.subscriptions.length;
    const ownIdx = currentUser.subscriptions.indexOf(channelId);
    if (ownIdx !== -1) currentUser.subscriptions.splice(ownIdx, 1);
    subscribed = false;
  }

  await db.write();
  res.json({ subscribed, subscribers: channel.subscribers });
});

app.get('/api/users/:id/subscribers', async (req, res) => {
  const userId = req.params.id;
  await db.read();
  const user = db.data.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ subscribers: user.subscribers || 0, subscribed_to: user.subscriptions || [] });
});

app.get('/api/users/:id/is-subscribed', authMiddleware, async (req, res) => {
  const channelId = req.params.id;
  const userId = req.user.id;
  await db.read();
  const channel = db.data.users.find(u => u.id === channelId);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });
  const isSubscribed = (channel.subscriptions || []).includes(userId);
  res.json({ subscribed: isSubscribed, subscribers: channel.subscribers || 0 });
});

// Notifications endpoints
app.get('/api/notifications', authMiddleware, async (req, res) => {
  await db.read();
  const notifs = db.data.notifications
    .filter(n => n.user_id === req.user.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 50);
  res.json(notifs);
});

app.post('/api/notifications/:id/read', authMiddleware, async (req, res) => {
  const notifId = req.params.id;
  await db.read();
  const notif = db.data.notifications.find(n => n.id === notifId && n.user_id === req.user.id);
  if (!notif) return res.status(404).json({ error: 'Notification not found' });
  notif.read = true;
  await db.write();
  res.json({ success: true });
});

app.delete('/api/notifications/:id', authMiddleware, async (req, res) => {
  const notifId = req.params.id;
  await db.read();
  const idx = db.data.notifications.findIndex(n => n.id === notifId && n.user_id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Notification not found' });
  db.data.notifications.splice(idx, 1);
  await db.write();
  res.json({ success: true });
});

app.delete('/api/notifications', authMiddleware, async (req, res) => {
  await db.read();
  db.data.notifications = db.data.notifications.filter(n => n.user_id !== req.user.id);
  await db.write();
  res.json({ success: true });
});

app.post('/api/notifications/mark-all-read', authMiddleware, async (req, res) => {
  await db.read();
  db.data.notifications
    .filter(n => n.user_id === req.user.id)
    .forEach(n => n.read = true);
  await db.write();
  res.json({ success: true });
});

app.get('/api/notifications/count', authMiddleware, async (req, res) => {
  await db.read();
  const unread = db.data.notifications.filter(n => n.user_id === req.user.id && !n.read).length;
  const total = db.data.notifications.filter(n => n.user_id === req.user.id).length;
  res.json({ unread, total });
});

// Simple user endpoint
app.get('/api/me', authMiddleware, async (req, res) => {
  await db.read();
  const user = db.data.users.find(u => u.id === req.user.id);
  res.json({ id: user.id, username: user.username, email: user.email, profile_pic: user.profile_pic, bio: user.bio, subscribers: user.subscribers });
});

// Upload profile picture
app.post('/api/me/profile-pic', authMiddleware, upload.single('profile_pic'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Missing image file' });
  const filepath = `/uploads/${req.file.filename}`;
  await db.read();
  const user = db.data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.profile_pic = filepath;
  await db.write();
  res.json({ profile_pic: filepath });
});

// Update bio
app.post('/api/me/bio', authMiddleware, async (req, res) => {
  const { bio } = req.body;
  if (typeof bio !== 'string' || bio.length > 200) return res.status(400).json({ error: 'Invalid bio' });
  await db.read();
  const user = db.data.users.find(u => u.id === req.user.id);
  user.bio = bio;
  await db.write();
  res.json({ bio: user.bio });
});

// Get current user's uploaded videos
app.get('/api/me/videos', authMiddleware, async (req, res) => {
  await db.read();
  const videos = db.data.videos.filter(v => v.uploader_id === req.user.id);
  res.json(videos);
});

// Public user info
app.get('/api/users/:id', async (req, res) => {
  const id = req.params.id;
  await db.read();
  const user = db.data.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, username: user.username, profile_pic: user.profile_pic, bio: user.bio, subscribers: user.subscribers });
});

// Fallback
app.use((req, res) => {
  // If it's an API request that wasn't matched, return 404
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  // Otherwise, serve index.html for client-side routing
  res.sendFile(path.join(__dirname, 'Frontend/index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://localhost:${PORT} and accessible via http://localhost:3000 (avoid 127.0.0.1 if you prefer)`.replace('http://localhost:3000', `http://localhost:${PORT}`)));
