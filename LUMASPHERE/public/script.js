// Main front-end interactions for index.html
const API_BASE = window.API_BASE || '';
// Global state for current view
let currentView = 'home';
let currentViewTitle = 'Home';

// Helper function to format upload time (relative or absolute after 1 week)
function formatUploadTime(uploadDate) {
	const now = new Date();
	const upload = new Date(uploadDate);
	const diff = now - upload;
	const weekInMs = 7 * 24 * 60 * 60 * 1000;
	
	// If more than a week, show actual date
	if (diff >= weekInMs) {
		return upload.toLocaleDateString();
	}
	
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	
	if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
	if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
	if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
	return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
}

document.addEventListener('DOMContentLoaded', () => {
	const sidebar = document.getElementById('sidebar');
	const menuBtn = document.querySelector('.menu-btn');
	const uploadInput = document.getElementById('videoUpload');
	const videoGrid = document.getElementById('videoGrid');
	const searchInput = document.querySelector('.search-box input');
	const searchBtn = document.querySelector('.search-box button');
	const tagBar = document.querySelector('.tag-bar');

	// Restore sidebar state (support legacy 'sidebarCollapsed' key but prefer 'sidebarClosed')
	const closed = localStorage.getItem('sidebarClosed') === 'true' || localStorage.getItem('sidebarCollapsed') === 'true';
	if (closed) {
		sidebar.classList.add('closed');
		sidebar.classList.remove('collapsed');
		if (menuBtn) menuBtn.classList.add('open');
	}
	// create a small handle to re-open the sidebar when closed
	(function createSidebarHandle() {
		const handle = document.createElement('div');
		handle.className = 'sidebar-handle';
		handle.addEventListener('click', (e) => { e.stopPropagation(); sidebar.classList.remove('closed'); menuBtn && menuBtn.classList.remove('open'); localStorage.setItem('sidebarClosed', 'false'); handle.classList.remove('visible'); });
		document.body.appendChild(handle);
		// set initial visibility
		if (sidebar.classList.contains('closed')) handle.classList.add('visible');
	})();

	// Prepare existing cards with tags (basic heuristics)
	document.querySelectorAll('.video-card').forEach(card => {
		const title = (card.querySelector('.details h4') || {}).innerText || '';
		const channel = (card.querySelector('.details p') || {}).innerText || '';
		const tags = [];
		const txt = (title + ' ' + channel).toLowerCase();
		if (txt.includes('music')) tags.push('Music');
		if (txt.includes('game') || txt.includes('gaming')) tags.push('Gaming');
		if (txt.includes('news')) tags.push('News');
		if (txt.includes('sport')) tags.push('Sports');
		if (tags.length === 0) tags.push('ALL');
		card.dataset.tags = tags.join(',');
		// Make cards clickable to open player (if they contain a video element later)
		card.addEventListener('click', () => openPlayer(card));

		// If the card has no thumbnail image, mark it so CSS shows a nice placeholder.
		const thumb = card.querySelector('.thumbnail');
		if (thumb) {
			const img = thumb.querySelector('img');
			if (!img || !img.getAttribute('src') || img.getAttribute('src').trim() === '') {
				thumb.classList.add('no-thumb');
				if (tags.includes('Music')) thumb.classList.add('music');
			}
			const dur = thumb.querySelector('.duration');
			if (dur && (!dur.innerText || dur.innerText.trim() === '')) dur.style.display = 'none';
		}
	});

	// Load videos from server and render
	(async function loadServerVideos() {
		try {
			const videos = await API.getVideos();
			videos.reverse().forEach(v => {
				const card = createVideoCardFromRemote(v);
				videoGrid.appendChild(card);
			});
			// Update tag bar with hashtags from videos
			updateTagBarWithHashtags(videos);
		} catch (err) {
			// ignore if server not running
			// console.warn('Could not load server videos', err);
		}
	})();

	// Check URL parameters for auto-view (e.g., ?view=library)
	const urlParams = new URLSearchParams(window.location.search);
	const requestedView = urlParams.get('view');
	let autoLoadView = null;

	// Setup sidebar navigation
	const sidebarLinks = sidebar.querySelectorAll('a');
	sidebarLinks.forEach((link, index) => {
		const linkText = link.innerText.trim().toLowerCase();
		
		// Check if this link matches the requested view
		if (requestedView) {
			if ((requestedView === 'library' && linkText.includes('library')) ||
				(requestedView === 'home' && linkText.includes('home')) ||
				(requestedView === 'trending' && linkText.includes('trending')) ||
				(requestedView === 'subscriptions' && linkText.includes('subscriptions')) ||
				(requestedView === 'history' && linkText.includes('history')) ||
				(requestedView === 'liked' && linkText.includes('liked'))) {
				autoLoadView = link;
			}
		}
	});

	// Attach click handlers to sidebar links
	sidebarLinks.forEach((link, index) => {
		link.addEventListener('click', async (e) => {
			e.preventDefault();
			// Remove active class from all links
			sidebarLinks.forEach(l => l.classList.remove('active'));
			link.classList.add('active');
			// Hide tag bar and search for non-home views
			const linkText = link.innerText.trim().toLowerCase();
			if (linkText.includes('home')) {
				currentView = 'home';
				currentViewTitle = 'Home';
				tagBar.style.display = '';
				searchInput.parentElement.style.display = '';
				loadHome();
			} else if (linkText.includes('trending')) {
				currentView = 'trending';
				currentViewTitle = 'Trending - Videos gaining lots of watches in 24 hours';
				tagBar.style.display = 'none';
				searchInput.parentElement.style.display = 'none';
				loadTrending();
			} else if (linkText.includes('subscriptions')) {
				currentView = 'subscriptions';
				currentViewTitle = 'Subscriptions';
				tagBar.style.display = 'none';
				searchInput.parentElement.style.display = 'none';
				loadSubscriptions();
			} else if (linkText.includes('library')) {
				currentView = 'library';
				currentViewTitle = 'Library - Your uploaded videos';
				tagBar.style.display = 'none';
				searchInput.parentElement.style.display = 'none';
				loadLibrary();
			} else if (linkText.includes('history')) {
				currentView = 'history';
				currentViewTitle = 'History - Videos you watched';
				tagBar.style.display = 'none';
				searchInput.parentElement.style.display = 'none';
				loadHistory();
			} else if (linkText.includes('liked')) {
				currentView = 'likedVideos';
				currentViewTitle = 'Liked Videos';
				tagBar.style.display = 'none';
				searchInput.parentElement.style.display = 'none';
				loadLikedVideos();
			}
		});
	});

	// Trigger auto-load view if URL parameter specified
	if (autoLoadView) {
		autoLoadView.click();
		// Clear the URL parameter
		window.history.replaceState({}, document.title, window.location.pathname);
	}

	// Login/Logout UI hooks
	const loginBtn = document.getElementById('loginBtn');
	const logoutBtn = document.getElementById('logoutBtn');
	const navUsername = document.getElementById('navUsername');
	const authModal = document.getElementById('authModal');
	const tabLogin = document.getElementById('tabLogin');
	const tabRegister = document.getElementById('tabRegister');
	const loginForm = document.getElementById('loginForm');
	const registerForm = document.getElementById('registerForm');
	const modalClose = authModal && authModal.querySelector('.modal-close');
	const notificationBtn = document.getElementById('notificationBtn');
	const notificationPanel = document.getElementById('notificationPanel');
	const notificationsList = document.getElementById('notificationsList');
	const closeNotifications = document.getElementById('closeNotifications');
	const notificationBadge = document.getElementById('notificationBadge');
	const userAvatar = document.querySelector('.user-avatar');
	const profilePanel = document.getElementById('profilePanel');
	const closeProfile = document.getElementById('closeProfile');
	const profileUsername = document.getElementById('profileUsername');
	const profileEmail = document.getElementById('profileEmail');
	const profileBio = document.getElementById('profileBio');
	const saveBioBtn = document.getElementById('saveBioBtn');
	const signOutBtn = document.getElementById('signOutBtn');
	const profilePicInput = document.getElementById('profilePicInput');
	const uploadProfilePicBtn = document.getElementById('uploadProfilePicBtn');
	const profilePicture = document.getElementById('profilePicture');
	const profileAvatarFallback = document.getElementById('profileAvatarFallback');
	const profileViewModal = document.getElementById('profileViewModal');
	const closeProfileView = document.getElementById('closeProfileView');
	const profileViewUsername = document.getElementById('profileViewUsername');
	const profileViewSubscribers = document.getElementById('profileViewSubscribers');
	const profileViewVideos = document.getElementById('profileViewVideos');
	const profileViewBio = document.getElementById('profileViewBio');
	const profileViewPicture = document.getElementById('profileViewPicture');
	const profileViewAvatarFallback = document.getElementById('profileViewAvatarFallback');
	const profileViewSubscribeBtn = document.getElementById('profileViewSubscribeBtn');
	const profileViewVideosCount = document.getElementById('profileViewVideosCount');
	let currentUserEmail = '';
	let currentUsername = '';
	let currentUserProfilePic = '';
	let currentUserBio = '';
	let currentUserId = '';

	loginBtn && loginBtn.addEventListener('click', async () => {
		// show auth modal (login tab)
		if (!authModal) return alert('Auth modal not available');
		tabLogin.classList.add('active'); tabRegister.classList.remove('active');
		loginForm.style.display = ''; registerForm.style.display = 'none';
		authModal.style.display = 'flex';
	});

	logoutBtn && logoutBtn.addEventListener('click', () => { API.logout(); updateAuthUI(); alert('Logged out'); });

	// Auth modal interactions
	if (modalClose) modalClose.addEventListener('click', () => { authModal.style.display = 'none'; });
	tabLogin && tabLogin.addEventListener('click', () => { tabLogin.classList.add('active'); tabRegister.classList.remove('active'); loginForm.style.display = ''; registerForm.style.display = 'none'; });
	tabRegister && tabRegister.addEventListener('click', () => { tabRegister.classList.add('active'); tabLogin.classList.remove('active'); registerForm.style.display = ''; loginForm.style.display = 'none'; });

	// Profile pic preview for register
	const regProfilePic = document.getElementById('regProfilePic');
	const regProfilePicPreview = document.getElementById('regProfilePicPreview');
	regProfilePic && regProfilePic.addEventListener('change', (e) => {
		const file = e.target.files[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = (e) => {
				regProfilePicPreview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
			};
			reader.readAsDataURL(file);
		} else {
			regProfilePicPreview.innerHTML = '👤';
		}
	});

	loginForm && loginForm.addEventListener('submit', async (e) => { e.preventDefault(); const email = document.getElementById('loginEmail').value; const password = document.getElementById('loginPassword').value; try { await API.login(email, password); authModal.style.display = 'none'; updateAuthUI(); alert('Logged in'); } catch (err) { alert('Login failed'); } });
	registerForm && registerForm.addEventListener('submit', async (e) => { e.preventDefault(); const username = document.getElementById('regUsername').value; const email = document.getElementById('regEmail').value; const password = document.getElementById('regPassword').value; const bio = document.getElementById('regBio').value; const profilePicFile = regProfilePic.files[0]; try { await API.register(username, email, password, bio, profilePicFile); authModal.style.display = 'none'; updateAuthUI(); alert('Registered and logged in'); } catch (err) { alert('Registration failed'); } });

	// updateAuthUI enhanced: show username when available
	async function fetchMe() {
		const token = localStorage.getItem('mvp_token');
		if (!token) return null;
		try {
			const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
			if (!res.ok) return null;
			return await res.json();
		} catch (err) {
			return null;
		}
	}
	async function updateAuthUI() {
		const t = localStorage.getItem('mvp_token');
		if (t) {
			loginBtn.style.display = 'none'; logoutBtn.style.display = '';
			try {
				const me = await fetchMe();
				if (me) {
					navUsername.innerText = me.username || '';
					currentUsername = me.username || '';
					currentUserEmail = me.email || '';
					currentUserProfilePic = me.profile_pic || '';
					currentUserBio = me.bio || '';
					currentUserId = me.id || me.user_id || '';
					// Update navbar avatar with profile picture
					if (me.profile_pic) {
						userAvatar.style.backgroundImage = `url('${me.profile_pic}')`;
						userAvatar.style.backgroundSize = 'cover';
						userAvatar.style.backgroundPosition = 'center';
						userAvatar.innerText = '';
					} else {
						userAvatar.style.backgroundImage = '';
						userAvatar.innerText = '👤';
					}
				}
			} catch (err) {
				try {
					const payload = JSON.parse(atob((t.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/')) || '{}');
					navUsername.innerText = payload.username || '';
					currentUsername = payload.username || '';
					currentUserEmail = payload.email || '';
					currentUserProfilePic = payload.profile_pic || '';
					currentUserId = payload.id || '';
					if (currentUserProfilePic) {
						userAvatar.style.backgroundImage = `url('${currentUserProfilePic}')`;
						userAvatar.style.backgroundSize = 'cover';
						userAvatar.style.backgroundPosition = 'center';
						userAvatar.innerText = '';
					} else {
						userAvatar.style.backgroundImage = '';
						userAvatar.innerText = '👤';
					}
				} catch (e) {
					navUsername.innerText = '';
				}
			}
		} else { 
			loginBtn.style.display = ''; 
			logoutBtn.style.display = 'none'; 
			navUsername.innerText = ''; 
			currentUsername = '';
			currentUserEmail = '';
			currentUserProfilePic = '';
			userAvatar.style.backgroundImage = '';
			userAvatar.innerText = '👤';
		}
	}
	// initial call
	updateAuthUI();

	// View loading functions
	async function loadHome() {
		videoGrid.innerHTML = '';
		const videos = await API.getVideos();
		videos.reverse().forEach(v => {
			const card = createVideoCardFromRemote(v);
			videoGrid.appendChild(card);
		});
	}

	async function loadTrending() {
		videoGrid.innerHTML = '<div class="section-header">📈 Trending</div>';
		try {
			const videos = await API.getTrending();
			if (videos.length === 0) {
				videoGrid.innerHTML = '<div class="empty-state">No trending videos yet</div>';
				return;
			}
			videos.forEach(v => {
				const card = createVideoCardFromRemote(v);
				videoGrid.appendChild(card);
			});
		} catch (err) {
			console.error('Failed to load trending videos', err);
			videoGrid.innerHTML = '<div class="empty-state">Could not load trending videos</div>';
		}
	}

	async function loadSubscriptions() {
		videoGrid.innerHTML = '<div class="section-header">🎬 Subscriptions</div>';
		try {
			const videos = await API.getSubscriptions();
			if (videos.length === 0) {
				videoGrid.innerHTML = '<div class="empty-state">Subscribe to channels to see their videos here</div>';
				return;
			}
			videos.forEach(v => {
				const card = createVideoCardFromRemote(v);
				videoGrid.appendChild(card);
			});
		} catch (err) {
			console.error('Failed to load subscriptions', err);
			videoGrid.innerHTML = '<div class="empty-state">Could not load subscriptions</div>';
		}
	}

	async function loadLibrary() {
		videoGrid.innerHTML = '<div class="section-header">📂 Library - Your Videos</div>';
		try {
			// If we know the current user id, show user's videos sorted similar to trending
			if (currentUserId) {
				const all = await API.getVideos();
				const mine = all.filter(v => String(v.uploader_id || v.uploaderId || v.uploader) === String(currentUserId));
				if (mine.length === 0) {
					videoGrid.innerHTML = '<div class="empty-state">You haven\'t uploaded any videos yet</div>';
					return;
				}
				// sort by recent views or date
				mine.sort((a, b) => (new Date(b.upload_date || b.createdAt).getTime() - new Date(a.upload_date || a.createdAt).getTime()));
				mine.forEach(v => videoGrid.appendChild(createVideoCardFromRemote(v)));
				return;
			}
			// fallback to server-provided library endpoint
			const videos = await API.getLibrary();
			if (videos.length === 0) {
				videoGrid.innerHTML = '<div class="empty-state">You haven\'t uploaded any videos yet</div>';
				return;
			}
			videos.forEach(v => {
				const card = createVideoCardFromRemote(v);
				videoGrid.appendChild(card);
			});
		} catch (err) {
			console.error('Failed to load library', err);
			videoGrid.innerHTML = '<div class="empty-state">Log in to see your uploaded videos</div>';
		}
	}

	async function loadHistory() {
		videoGrid.innerHTML = '<div class="section-header">🕒 History - Videos You Watched</div>';
		try {
			const videos = await API.getHistory();
			if (videos.length === 0) {
				videoGrid.innerHTML = '<div class="empty-state">Your watch history is empty</div>';
				return;
			}
			videos.forEach(v => {
				const card = createVideoCardFromRemote(v);
				videoGrid.appendChild(card);
			});
		} catch (err) {
			console.error('Failed to load history', err);
			videoGrid.innerHTML = '<div class="empty-state">Log in to see your watch history</div>';
		}
	}

	async function loadLikedVideos() {
		videoGrid.innerHTML = '<div class="section-header">❤️ Liked Videos</div>';
		try {
			const videos = await API.getLikedVideos();
			if (videos.length === 0) {
				videoGrid.innerHTML = '<div class="empty-state">You haven\'t liked any videos yet</div>';
				return;
			}
			videos.forEach(v => {
				const card = createVideoCardFromRemote(v);
				videoGrid.appendChild(card);
			});
		} catch (err) {
			console.error('Failed to load liked videos', err);
			videoGrid.innerHTML = '<div class="empty-state">Log in to see your liked videos</div>';
		}
	}

	// Search
	function filterBySearch(query) {
		const q = (query || '').trim().toLowerCase();
		document.querySelectorAll('.video-card').forEach(card => {
			const text = (card.innerText || '').toLowerCase();
			card.style.display = q === '' || text.includes(q) ? '' : 'none';
		});
	}

	searchInput && searchInput.addEventListener('input', (e) => filterBySearch(e.target.value));
	searchBtn && searchBtn.addEventListener('click', () => filterBySearch(searchInput.value));
	searchInput && searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') filterBySearch(searchInput.value); });

	// Notification handling
	notificationBtn && notificationBtn.addEventListener('click', async () => {
		if (notificationPanel.style.display === 'none') {
			notificationPanel.style.display = 'flex';
			await loadNotifications();
		} else {
			notificationPanel.style.display = 'none';
		}
	});

	closeNotifications && closeNotifications.addEventListener('click', () => {
		notificationPanel.style.display = 'none';
	});

	// Profile panel handling
	userAvatar && userAvatar.addEventListener('click', async () => {
		if (localStorage.getItem('mvp_token')) {
			profilePanel.style.display = 'flex';
			profileUsername.innerText = currentUsername || 'User';
			profileEmail.innerText = currentUserEmail || 'No email';
			profileBio.value = currentUserBio || '';
			displayProfilePicture(currentUserProfilePic);
		}
	});

	navUsername && navUsername.addEventListener('click', async () => {
		if (localStorage.getItem('mvp_token')) {
			profilePanel.style.display = 'flex';
			profileUsername.innerText = currentUsername || 'User';
			profileEmail.innerText = currentUserEmail || 'No email';
			profileBio.value = currentUserBio || '';
			displayProfilePicture(currentUserProfilePic);
			profileEmail.innerText = currentUserEmail || 'No email';
		}
	});

	closeProfile && closeProfile.addEventListener('click', () => {
		profilePanel.style.display = 'none';
	});

	closeProfileView && closeProfileView.addEventListener('click', () => {
		profileViewModal.style.display = 'none';
	});

	// Profile view modal handling
	async function openProfileView(userId) {
		try {
			const res = await fetch(`/api/users/${userId}`);
			if (!res.ok) throw new Error('User not found');
			const user = await res.json();
			profileViewUsername.innerText = user.username;
			profileViewSubscribers.innerText = `${user.subscribers} subscribers`;
			profileViewBio.innerText = user.bio || 'No bio available.';
			displayProfileViewPicture(user.profile_pic);

			// Load user's videos
			const videosRes = await fetch(`/api/users/${userId}/videos`);
			const videos = videosRes.ok ? await videosRes.json() : [];
			profileViewVideosCount.innerText = `${videos.length} videos`;
			profileViewVideos.innerHTML = '';
			videos.forEach(video => {
				const videoCard = createVideoCardFromRemote(video);
				profileViewVideos.appendChild(videoCard);
			});

			// Subscribe button
			const token = localStorage.getItem('mvp_token');
			if (token && currentUserId !== userId) {
				profileViewSubscribeBtn.style.display = 'block';
				// Check if subscribed
				try {
					const subRes = await fetch(`/api/users/${userId}/subscribe`, { headers: authHeaders() });
					const subData = subRes.ok ? await subRes.json() : {};
					profileViewSubscribeBtn.innerText = subData.subscribed ? 'Subscribed' : 'Subscribe';
					profileViewSubscribeBtn.classList.toggle('subscribed', subData.subscribed);
				} catch (e) {
					profileViewSubscribeBtn.innerText = 'Subscribe';
				}
			} else {
				profileViewSubscribeBtn.style.display = 'none';
			}

			profileViewModal.dataset.userId = userId;
			profileViewModal.style.display = 'flex';
		} catch (err) {
			alert('Failed to load profile');
		}
	}

	function displayProfileViewPicture(pic) {
		if (pic) {
			profileViewPicture.src = pic;
			profileViewPicture.style.display = 'block';
			profileViewAvatarFallback.style.display = 'none';
		} else {
			profileViewPicture.style.display = 'none';
			profileViewAvatarFallback.style.display = 'flex';
		}
	}

	profileViewSubscribeBtn && profileViewSubscribeBtn.addEventListener('click', async () => {
		const token = localStorage.getItem('mvp_token');
		if (!token) { alert('Please login to subscribe'); return; }
		try {
			const res = await fetch(`/api/users/${profileViewModal.dataset.userId}/subscribe`, { method: 'POST', headers: authHeaders() });
			if (res.ok) {
				const data = await res.json();
				profileViewSubscribeBtn.innerText = data.subscribed ? 'Subscribed' : 'Subscribe';
				profileViewSubscribeBtn.classList.toggle('subscribed', data.subscribed);
				profileViewSubscribers.innerText = `${data.subscribers} subscribers`;
			}
		} catch (err) {
			alert('Failed to subscribe');
		}
	});

	signOutBtn && signOutBtn.addEventListener('click', () => {
		API.logout();
		profilePanel.style.display = 'none';
		updateAuthUI();
		alert('Signed out');
	});

	saveBioBtn && saveBioBtn.addEventListener('click', async () => {
		const bio = profileBio.value.trim();
		try {
			const token = localStorage.getItem('mvp_token');
			const res = await fetch('/api/me/bio', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ bio })
			});
			if (res.ok) {
				currentUserBio = bio;
				alert('Bio updated!');
			} else {
				alert('Failed to update bio');
			}
		} catch (err) {
			alert('Error updating bio');
		}
	});

	// Profile picture upload handlers
	uploadProfilePicBtn && uploadProfilePicBtn.addEventListener('click', () => {
		profilePicInput.click();
	});

	profilePicInput && profilePicInput.addEventListener('change', async (e) => {
		const file = e.target.files[0];
		if (!file) return;
		
		// Show cropper
		const reader = new FileReader();
		reader.onload = (event) => {
			ImageCropper.open(event.target.result, async (croppedBlob) => {
				try {
					const formData = new FormData();
					formData.append('profile_pic', croppedBlob, 'profile.jpg');
					const token = localStorage.getItem('mvp_token');
					const res = await fetch('/api/me/profile-pic', {
						method: 'POST',
						headers: { Authorization: `Bearer ${token}` },
						body: formData
					});
					if (res.ok) {
						const data = await res.json();
						currentUserProfilePic = data.profile_pic;
						displayProfilePicture(data.profile_pic);
						
						// Update navbar avatar with profile picture
						if (data.profile_pic) {
							userAvatar.style.backgroundImage = `url('${data.profile_pic}')`;
							userAvatar.style.backgroundSize = 'cover';
							userAvatar.style.backgroundPosition = 'center';
							userAvatar.innerText = '';
						}
						
						alert('Profile picture updated!');
					} else {
						alert('Failed to upload profile picture');
					}
				} catch (err) {
					console.error('Error uploading profile picture:', err);
					alert('Error uploading profile picture');
				}
			});
		};
		reader.readAsDataURL(file);
		profilePicInput.value = '';
	});

	function displayProfilePicture(picUrl) {
		if (picUrl) {
			profilePicture.src = picUrl;
			profilePicture.style.display = '';
			profileAvatarFallback.style.display = 'none';
		} else {
			profilePicture.style.display = 'none';
			profileAvatarFallback.style.display = 'flex';
		}
	}

	// Close profile panel when clicking outside
	document.addEventListener('click', (e) => {
		if (profilePanel && profilePanel.style.display === 'flex' && !profilePanel.contains(e.target) && !userAvatar.contains(e.target) && !navUsername.contains(e.target)) {
			profilePanel.style.display = 'none';
		}
	});

	// Close notification panel when clicking outside
	document.addEventListener('click', (e) => {
		if (notificationPanel && notificationPanel.style.display === 'flex' && !notificationPanel.contains(e.target) && !notificationBtn.contains(e.target)) {
			notificationPanel.style.display = 'none';
		}
	});

	async function loadNotifications() {
		notificationsList.innerHTML = '<div class="loading">Loading notifications...</div>';
		try {
			const notifications = await API.getNotifications();
			if (notifications.length === 0) {
				notificationsList.innerHTML = '<div class="no-notifications">No notifications yet</div>';
				notificationBadge.style.display = 'none';
				return;
			}

			notificationBadge.innerText = notifications.length;
			notificationBadge.style.display = notifications.length > 0 ? 'flex' : 'none';

			notificationsList.innerHTML = '';
			notifications.forEach(notif => {
				const notifEl = document.createElement('div');
				notifEl.className = 'notification-item';
				const avatar = notif.avatar || '👤';
				const timestamp = new Date(notif.timestamp || Date.now()).toLocaleString();
				notifEl.innerHTML = `
					<div class="notif-avatar">${avatar}</div>
					<div class="notif-content">
						<div class="notif-title">${escapeHtml(notif.title)}</div>
						<div class="notif-message">${escapeHtml(notif.message)}</div>
						<div class="notif-time">${timestamp}</div>
					</div>
				`;
				notificationsList.appendChild(notifEl);
			});
		} catch (err) {
			console.error('Failed to load notifications', err);
			notificationsList.innerHTML = '<div class="no-notifications">Could not load notifications</div>';
		}
	}

	// Refresh notifications periodically (every 30 seconds)
	setInterval(async () => {
		if (localStorage.getItem('mvp_token')) {
			try {
				const notifications = await API.getNotifications();
				notificationBadge.innerText = notifications.length;
				notificationBadge.style.display = notifications.length > 0 ? 'flex' : 'none';
			} catch (err) {
				// silently fail
			}
		}
	}, 30000);
	// Check on load
	(async () => {
		if (localStorage.getItem('mvp_token')) {
			try {
				const notifications = await API.getNotifications();
				notificationBadge.innerText = notifications.length;
				notificationBadge.style.display = notifications.length > 0 ? 'flex' : 'none';
			} catch (err) {
				// silently fail
			}
		}
	})();

	// Tag filtering
	tagBar && tagBar.addEventListener('click', (e) => {
		const btn = e.target.closest('button');
		if (!btn) return;
		// Toggle active
		tagBar.querySelectorAll('button').forEach(b => b.classList.remove('tagactive'));
		btn.classList.add('tagactive');
		const tag = btn.innerText.trim();
		if (tag === 'ALL') {
			document.querySelectorAll('.video-card').forEach(c => c.style.display = '');
		} else {
			document.querySelectorAll('.video-card').forEach(c => {
				const tags = (c.dataset.tags || '').split(',');
				c.style.display = tags.includes(tag) ? '' : 'none';
			});
		}
	});

	// Upload handling
	uploadInput && uploadInput.addEventListener('change', async (e) => {
		const files = Array.from(e.target.files || []);
		for (const file of files) {
			if (!file.type.startsWith('video/')) continue;
			const card = await createVideoCardFromFile(file);
			videoGrid.insertBefore(card, videoGrid.firstChild);
		}
		// clear input so same file can be uploaded again if needed
		uploadInput.value = '';
	});

	// Expose functions to global scope for inline onclick attributes
	window.triggerUpload = function triggerUpload() {
		// Navigate to upload page instead of triggering file input
		window.location.href = 'upload.html';
	};

	window.toogleSidebar = function toogleSidebar() {
		// Keep original misspelled name from HTML; fully close the sidebar when toggled
		const nowClosed = sidebar.classList.toggle('closed');
		// remove any collapsed state so classes don't conflict
		sidebar.classList.remove('collapsed');
		// animate menu btn
		if (menuBtn) menuBtn.classList.toggle('open');
		localStorage.setItem('sidebarClosed', sidebar.classList.contains('closed'));
		// keep legacy key cleared
		localStorage.removeItem('sidebarCollapsed');
		// show or hide the handle
		const handle = document.querySelector('.sidebar-handle');
		if (handle) {
			if (sidebar.classList.contains('closed')) handle.classList.add('visible'); else handle.classList.remove('visible');
		}
	};
});

// Image Cropper functionality
const ImageCropper = (function() {
	let currentImage = null;
	let currentCallback = null;
	let zoom = 1;
	let panX = 0;
	let panY = 0;
	let isDragging = false;
	let dragStartX = 0;
	let dragStartY = 0;

	const modal = document.getElementById('cropperModal');
	const canvas = document.getElementById('cropperCanvas');
	const ctx = canvas ? canvas.getContext('2d') : null;
	const zoomSlider = document.getElementById('zoomSlider');
	const zoomValue = document.getElementById('zoomValue');
	const saveCropperBtn = document.getElementById('saveCropper');
	const cancelCropperBtn = document.getElementById('cancelCropper');
	const closeBtn = document.getElementById('closeCropper');

	function init() {
		if (zoomSlider) {
			zoomSlider.addEventListener('input', (e) => {
				zoom = parseFloat(e.target.value);
				zoomValue.textContent = Math.round(zoom * 100) + '%';
				redraw();
			});
		}

		canvas?.addEventListener('mousedown', (e) => {
			isDragging = true;
			dragStartX = e.clientX - panX;
			dragStartY = e.clientY - panY;
		});

		document.addEventListener('mousemove', (e) => {
			if (isDragging && canvas) {
				panX = e.clientX - dragStartX;
				panY = e.clientY - dragStartY;
				redraw();
			}
		});

		document.addEventListener('mouseup', () => {
			isDragging = false;
		});

		saveCropperBtn?.addEventListener('click', saveCrop);
		cancelCropperBtn?.addEventListener('click', closeCropper);
		closeBtn?.addEventListener('click', closeCropper);
	}

	function open(imageSrc, callback) {
		const img = new Image();
		img.onload = () => {
			currentImage = img;
			currentCallback = callback;
			zoom = 1;
			panX = 0;
			panY = 0;
			if (zoomSlider) {
				zoomSlider.value = 1;
				zoomValue.textContent = '100%';
			}
			modal.style.display = 'flex';
			redraw();
		};
		img.src = imageSrc;
	}

	function redraw() {
		if (!canvas || !ctx || !currentImage) return;

		// Set canvas size
		canvas.width = 300;
		canvas.height = 300;

		ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Calculate dimensions to fit aspect ratio
		const imageAspect = currentImage.width / currentImage.height;
		let drawWidth, drawHeight;

		if (imageAspect > 1) {
			drawHeight = canvas.height / zoom;
			drawWidth = drawHeight * imageAspect;
		} else {
			drawWidth = canvas.width / zoom;
			drawHeight = drawWidth / imageAspect;
		}

		const x = (canvas.width - drawWidth) / 2 + panX;
		const y = (canvas.height - drawHeight) / 2 + panY;

		ctx.drawImage(currentImage, x, y, drawWidth, drawHeight);

		// Draw crop frame (center square)
		ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
		ctx.lineWidth = 2;
		ctx.setLineDash([5, 5]);
		ctx.strokeRect(25, 25, canvas.width - 50, canvas.height - 50);
		ctx.setLineDash([]);
	}

	function saveCrop() {
		if (!canvas || !ctx || !currentImage || !currentCallback) return;

		// Create output canvas (square crop)
		const outputCanvas = document.createElement('canvas');
		outputCanvas.width = 300;
		outputCanvas.height = 300;
		const outputCtx = outputCanvas.getContext('2d');

		// Calculate image dimensions
		const imageAspect = currentImage.width / currentImage.height;
		let drawWidth, drawHeight;

		if (imageAspect > 1) {
			drawHeight = 300 / zoom;
			drawWidth = drawHeight * imageAspect;
		} else {
			drawWidth = 300 / zoom;
			drawHeight = drawWidth / imageAspect;
		}

		const x = (300 - drawWidth) / 2 + panX;
		const y = (300 - drawHeight) / 2 + panY;

		outputCtx.drawImage(currentImage, x, y, drawWidth, drawHeight);

		// Convert to blob and callback
		outputCanvas.toBlob((blob) => {
			currentCallback(blob);
			closeCropper();
		}, 'image/jpeg', 0.95);
	}

	function closeCropper() {
		modal.style.display = 'none';
		currentImage = null;
		currentCallback = null;
	}

	// Initialize when DOM is ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

	return { open, closeCropper };
})();

// Helpers
function formatDuration(seconds) {
	if (!isFinite(seconds)) return '';
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
	return `${mins}:${secs}`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

function updateTagBarWithHashtags(videos) {
	const tagBar = document.querySelector('.tag-bar');
	if (!tagBar) return;
	
	// Collect all unique hashtags from videos
	const hashtags = new Set();
	videos.forEach(v => {
		if (v.tags && Array.isArray(v.tags)) {
			v.tags.forEach(tag => {
				if (tag.startsWith('#')) {
					hashtags.add(tag);
				}
			});
		}
	});
	
	// Preserve existing category buttons
	const existingButtons = Array.from(tagBar.querySelectorAll('button'));
	const categoryButtons = [];
	const hashtagButtons = [];
	
	existingButtons.forEach(btn => {
		const text = btn.innerText.trim();
		if (['ALL', 'Music', 'Gaming', 'News', 'Sports'].includes(text)) {
			categoryButtons.push(btn);
		} else if (text.startsWith('#')) {
			hashtagButtons.push(btn);
		}
	});
	
	// Remove old hashtag buttons
	hashtagButtons.forEach(btn => btn.remove());
	
	// Add new hashtag buttons
	const sortedHashtags = Array.from(hashtags).sort();
	sortedHashtags.forEach(hashtag => {
		const btn = document.createElement('button');
		btn.className = 'tag';
		btn.innerText = hashtag;
		tagBar.appendChild(btn);
	});
}

async function createVideoCardFromFile(file) {
	// Create elements
	const card = document.createElement('div');
	card.className = 'video-card';

	const thumbnailWrap = document.createElement('div');
	thumbnailWrap.className = 'thumbnail';
	const img = document.createElement('img');
	img.alt = 'Video Thumbnail';
	img.src = ''; // will set after capture
	// upload progress element (hidden until upload starts)
	const progressWrap = document.createElement('div');
	progressWrap.className = 'upload-progress';
	progressWrap.style.display = 'none';
	progressWrap.style.position = 'absolute';
	progressWrap.style.left = '0';
	progressWrap.style.right = '0';
	progressWrap.style.bottom = '0';
	progressWrap.style.height = '6px';
	progressWrap.style.background = 'rgba(0,0,0,0.15)';
	const progressBar = document.createElement('div');
	progressBar.className = 'upload-progress-bar';
	progressBar.style.width = '0%';
	progressBar.style.height = '100%';
	progressBar.style.background = '#29a3ff';
	progressWrap.appendChild(progressBar);
	const durationSpan = document.createElement('span');
	durationSpan.className = 'duration';
	durationSpan.innerText = '';
	thumbnailWrap.appendChild(img);
	thumbnailWrap.appendChild(durationSpan);
	thumbnailWrap.style.position = 'relative';
	thumbnailWrap.appendChild(progressWrap);

	const info = document.createElement('div');
	info.className = 'video-info';
	const avatar = document.createElement('div');
	avatar.className = 'avatar';
	avatar.innerText = '👤';
	const details = document.createElement('div');
	details.className = 'details';
	const h4 = document.createElement('h4');
	h4.innerText = file.name;
	const p1 = document.createElement('p');
	p1.innerText = 'You';
	const p2 = document.createElement('p');
	p2.innerText = '0 views • just now';
	details.appendChild(h4);
	details.appendChild(p1);
	details.appendChild(p2);

	info.appendChild(avatar);
	info.appendChild(details);

	card.appendChild(thumbnailWrap);
	card.appendChild(info);

	// Store file as data so clicking can open player
	card._file = file;
	card.dataset.tags = 'ALL';

	// Create object URL and capture a frame for thumbnail + get duration asynchronously
	const url = URL.createObjectURL(file);
	(async () => {
		try {
			const {poster, duration} = await captureThumbnailAndDuration(url);
			if (poster) {
				img.src = poster;
				thumbnailWrap.classList.remove('no-thumb');
			} else {
				thumbnailWrap.classList.add('no-thumb');
			}
			if (duration) {
				durationSpan.innerText = formatDuration(duration);
				durationSpan.style.display = '';
			} else {
				durationSpan.style.display = 'none';
			}
		} catch (err) {
			thumbnailWrap.classList.add('no-thumb');
			durationSpan.style.display = 'none';
		} finally {
			try { URL.revokeObjectURL(url); } catch (e) {}
		}
	})();
	// If filename suggests music, show a music placeholder icon
	if (file.name && /music|song|audio/i.test(file.name)) thumbnailWrap.classList.add('music');

	// click to play
	card.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openPlayer(card); });

	// enable hover preview playback
	enableCardPreview(card);

	return card;
}

// Enable hover preview for a card: plays muted looping video over the thumbnail
function enableCardPreview(card) {
	try {
		const thumb = card.querySelector('.thumbnail');
		if (!thumb) return;
		let previewEl = null;
		const showPreview = () => {
			// don't create multiple
			if (previewEl) return;
			const v = document.createElement('video');
			v.className = 'card-preview-video';
			v.muted = true;
			v.loop = true;
			v.playsInline = true;
			// choose source: local file or remote
			if (card._file) {
				try { v.src = URL.createObjectURL(card._file); } catch (e) { return; }
			} else if (card._remoteVideoUrl) {
				v.src = card._remoteVideoUrl;
			} else {
				// try to find an existing video element inside card
				const vEl = card.querySelector('video');
				if (vEl && vEl.src) v.src = vEl.src; else return;
			}
			// hide thumbnail image
			const img = thumb.querySelector('img');
			if (img) img.style.opacity = '0';
			// small overlay indicator
			let overlay = thumb.querySelector('.play-overlay');
			if (!overlay) {
				overlay = document.createElement('div'); overlay.className = 'play-overlay'; overlay.innerText = '▶'; thumb.appendChild(overlay);
			}
			// make preview ignore pointer events so clicks reach the card
			v.style.pointerEvents = 'none';
			thumb.appendChild(v);
			previewEl = v;
			// ensure overlay icon doesn't block clicks
			const ov = thumb.querySelector('.play-overlay'); if (ov) ov.style.pointerEvents = 'none';
			v.play().catch(() => {});
		};
		const hidePreview = () => {
			try {
				if (!previewEl) return;
				previewEl.pause();
				if (previewEl.src && previewEl.src.startsWith('blob:')) try { URL.revokeObjectURL(previewEl.src); } catch (e) {}
				previewEl.remove();
				previewEl = null;
				const img = thumb.querySelector('img'); if (img) img.style.opacity = '';
				const overlay = thumb.querySelector('.play-overlay'); if (overlay) overlay.remove();
			} catch (e) { /* ignore */ }
		};

		thumb.addEventListener('mouseenter', showPreview);
		thumb.addEventListener('mouseleave', hidePreview);
		// ensure a click hides preview immediately so the player can open cleanly
		thumb.addEventListener('click', hidePreview);
		// touch devices: tap to toggle preview briefly
		thumb.addEventListener('touchstart', () => { showPreview(); setTimeout(hidePreview, 3500); });
	} catch (e) { /* ignore */ }
}

function captureThumbnailAndDuration(url) {
	return new Promise((resolve, reject) => {
		const video = document.createElement('video');
		video.preload = 'metadata';
		video.src = url;
		video.muted = true;
		video.playsInline = true;

		const cleanup = () => { URL.revokeObjectURL(url); video.remove(); };

		video.addEventListener('loadedmetadata', () => {
			const duration = video.duration || 0;
			// seek to 0.5s or 0 if shorter
			const seekTo = Math.min(0.5, Math.max(0, duration / 10));
			video.currentTime = seekTo;
		});
		video.addEventListener('seeked', () => {
			try {
				const canvas = document.createElement('canvas');
				canvas.width = video.videoWidth || 320;
				canvas.height = video.videoHeight || 180;
				const ctx = canvas.getContext('2d');
				ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
				const poster = canvas.toDataURL('image/png');
				const duration = video.duration || 0;
				cleanup();
				resolve({poster, duration});
			} catch (err) {
				cleanup();
				reject(err);
			}
		});
		video.addEventListener('error', (e) => { cleanup(); reject(e); });
	});
}

// Simple modal player (extended with metadata, comments, and up next)
function openPlayer(card) {
	// Close any existing open player before showing a new one
	const existingOverlay = document.querySelector('.video-overlay');
	if (existingOverlay) existingOverlay.remove();

	let currentCard = card;
	let currentObjectUrl = null;

	// Remove any lingering preview video on this card so it doesn't block the player
	try {
		const thumb = card.querySelector('.thumbnail');
		if (thumb) {
			const prev = thumb.querySelector('.card-preview-video');
			if (prev) {
				try { prev.pause(); } catch (e) {}
				try { if (prev.src && prev.src.startsWith('blob:')) URL.revokeObjectURL(prev.src); } catch (e) {}
				prev.remove();
			}
			const img = thumb.querySelector('img'); if (img) img.style.opacity = '';
			const ov = thumb.querySelector('.play-overlay'); if (ov) ov.remove();
		}
	} catch (e) { /* ignore cleanup errors */ }

	// If the card has an attached file use it, otherwise try to find a video inside
	const file = card._file;
	let src = null;
	if (file) {
		src = URL.createObjectURL(file);
		currentObjectUrl = src;
	} else if (card._remoteVideoUrl) {
		// Handle remote videos from server
		src = card._remoteVideoUrl;
	} else if (card.querySelector('video')) {
		src = card.querySelector('video').src;
	} else {
		// nothing to play
		return;
	}

	const videoId = card.dataset.videoId;
	const titleText = card.querySelector('.details h4') ? card.querySelector('.details h4').innerText : 'Untitled';
	const channelName = card._uploaderName || (card.querySelector('.details .channel-name') ? card.querySelector('.details .channel-name').innerText : 'Unknown Channel');
	const subscribers = Number(card._subscribers || 0);
	const likeCountStart = Number(card._likes || 0);
	const viewCount = Number(card.dataset.views || 0);
	const uploadedAt = card.dataset.uploadDate || 'Unknown';
	const descriptionText = card.dataset.description || 'No description available.';

	// Create overlay container
	const overlay = document.createElement('div');
	overlay.className = 'video-overlay';
	overlay.style.display = 'flex';
	overlay.style.visibility = 'visible';
	overlay.style.zIndex = '1000000';
	// dark, full screen is set by CSS .video-overlay

	const panel = document.createElement('div');
	panel.className = 'video-panel';
	panel.style.display = 'flex';
	panel.style.width = '100%';
	panel.style.maxWidth = '1200px';
	panel.style.maxHeight = '90vh';
	panel.style.background = '#0f172a';
	panel.style.borderRadius = '12px';
	panel.style.overflow = 'hidden';
	panel.style.position = 'relative';

	const left = document.createElement('div');
	left.style.flex = '1 1 0';
	left.style.display = 'flex';
	left.style.flexDirection = 'column';
	left.style.background = '#050814';
	left.style.padding = '12px';
	left.style.overflow = 'auto';

	const right = document.createElement('aside');
	right.style.width = '320px';
	right.style.flex = '0 0 320px';
	right.style.padding = '12px';
	right.style.background = '#01040d';
	right.style.overflowY = 'auto';
	right.style.borderLeft = '1px solid rgba(255,255,255,0.08)';

	const closeBtn = document.createElement('button');
	closeBtn.className = 'close-player';
	closeBtn.innerText = '✖';
	closeBtn.style.position = 'absolute';
	closeBtn.style.top = '10px';
	closeBtn.style.right = '10px';
	closeBtn.style.background = '#00FFFF';
	closeBtn.style.color = '#01040D';
	closeBtn.style.border = 'none';
	closeBtn.style.borderRadius = '50%';
	closeBtn.style.width = '36px';
	closeBtn.style.height = '36px';
	closeBtn.style.cursor = 'pointer';
	closeBtn.style.fontSize = '16px';
	closeBtn.style.zIndex = '1000001';

	const videoWrapper = document.createElement('div');
	videoWrapper.style.position = 'relative';
	videoWrapper.style.width = '100%';
	videoWrapper.style.maxHeight = '50vh';
	videoWrapper.style.background = '#000';

	const videoEl = document.createElement('video');
	videoEl.src = src;
	videoEl.controls = false;
	videoEl.controlsList = 'nodownload';
	videoEl.autoplay = true;
	videoEl.playsInline = true;
	videoEl.style.width = '100%';
	videoEl.style.height = '100%';
	videoEl.style.maxHeight = '50vh';
	videoEl.style.background = '#000';

	videoWrapper.appendChild(videoEl);

	// YouTube-style controls: minimal progress bar always visible, controls on hover
	const progressContainer = document.createElement('div');
	progressContainer.style.position = 'absolute';
	progressContainer.style.bottom = '0';
	progressContainer.style.left = '0';
	progressContainer.style.right = '0';
	progressContainer.style.height = '4px';
	progressContainer.style.background = 'rgba(255,255,255,0.3)';
	progressContainer.style.cursor = 'pointer';

	const progressBar = document.createElement('div');
	progressBar.style.height = '100%';
	progressBar.style.background = '#0f0';
	progressBar.style.width = '0%';
	progressContainer.appendChild(progressBar);
	videoWrapper.appendChild(progressContainer);

	// Controls overlay (appears on hover)
	const controlsOverlay = document.createElement('div');
	controlsOverlay.style.position = 'absolute';
	controlsOverlay.style.bottom = '0';
	controlsOverlay.style.left = '0';
	controlsOverlay.style.right = '0';
	controlsOverlay.style.background = 'linear-gradient(transparent, rgba(0,0,0,0.7))';
	controlsOverlay.style.padding = '10px';
	controlsOverlay.style.display = 'flex';
	controlsOverlay.style.alignItems = 'center';
	controlsOverlay.style.opacity = '0';
	controlsOverlay.style.transition = 'opacity 0.3s';
	videoWrapper.appendChild(controlsOverlay);

	// Controls elements
	const playPauseBtn = document.createElement('button');
	playPauseBtn.innerText = '▶';
	playPauseBtn.style.background = 'none';
	playPauseBtn.style.border = 'none';
	playPauseBtn.style.color = '#fff';
	playPauseBtn.style.fontSize = '24px';
	playPauseBtn.style.cursor = 'pointer';
	playPauseBtn.style.marginRight = '15px';
	controlsOverlay.appendChild(playPauseBtn);

	const timeDisplay = document.createElement('span');
	timeDisplay.innerText = '0:00 / 0:00';
	timeDisplay.style.color = '#fff';
	timeDisplay.style.fontSize = '16px';
	timeDisplay.style.marginRight = '15px';
	controlsOverlay.appendChild(timeDisplay);

	const volumeBtn = document.createElement('button');
	volumeBtn.innerText = '🔊';
	volumeBtn.style.background = 'none';
	volumeBtn.style.border = 'none';
	volumeBtn.style.color = '#fff';
	volumeBtn.style.cursor = 'pointer';
	volumeBtn.style.fontSize = '20px';
	volumeBtn.style.marginRight = '15px';
	controlsOverlay.appendChild(volumeBtn);

	const settingsBtn = document.createElement('button');
	settingsBtn.innerText = '⚙';
	settingsBtn.style.background = 'none';
	settingsBtn.style.border = 'none';
	settingsBtn.style.color = '#fff';
	settingsBtn.style.cursor = 'pointer';
	settingsBtn.style.fontSize = '20px';
	settingsBtn.style.marginLeft = 'auto';
	controlsOverlay.appendChild(settingsBtn);

	const fullscreenBtn = document.createElement('button');
	fullscreenBtn.innerText = '⛶';
	fullscreenBtn.style.background = 'none';
	fullscreenBtn.style.border = 'none';
	fullscreenBtn.style.color = '#fff';
	fullscreenBtn.style.cursor = 'pointer';
	fullscreenBtn.style.fontSize = '20px';
	controlsOverlay.appendChild(fullscreenBtn);

	// Big play button in center when paused
	const bigPlayBtn = document.createElement('button');
	bigPlayBtn.innerText = '▶';
	bigPlayBtn.style.position = 'absolute';
	bigPlayBtn.style.top = '50%';
	bigPlayBtn.style.left = '50%';
	bigPlayBtn.style.transform = 'translate(-50%, -50%)';
	bigPlayBtn.style.background = 'rgba(0,0,0,0.7)';
	bigPlayBtn.style.border = 'none';
	bigPlayBtn.style.color = '#fff';
	bigPlayBtn.style.fontSize = '64px';
	bigPlayBtn.style.borderRadius = '50%';
	bigPlayBtn.style.width = '100px';
	bigPlayBtn.style.height = '100px';
	bigPlayBtn.style.cursor = 'pointer';
	bigPlayBtn.style.display = 'none';
	videoWrapper.appendChild(bigPlayBtn);

	videoWrapper.appendChild(closeBtn);

	// Settings menu
	const settingsMenu = document.createElement('div');
	settingsMenu.style.position = 'absolute';
	settingsMenu.style.bottom = '50px';
	settingsMenu.style.right = '10px';
	settingsMenu.style.background = '#000';
	settingsMenu.style.color = '#fff';
	settingsMenu.style.padding = '10px';
	settingsMenu.style.display = 'none';
	settingsMenu.style.borderRadius = '4px';
	settingsMenu.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
	videoWrapper.appendChild(settingsMenu);

	const qualityLabel = document.createElement('div');
	qualityLabel.innerText = 'Quality';
	qualityLabel.style.fontSize = '12px';
	qualityLabel.style.marginBottom = '5px';
	settingsMenu.appendChild(qualityLabel);

	const qualitySelect = document.createElement('select');
	qualitySelect.style.background = '#333';
	qualitySelect.style.color = '#fff';
	qualitySelect.style.border = 'none';
	qualitySelect.style.marginBottom = '10px';
	qualitySelect.style.width = '100%';
	const qualities = ['Auto', '1080p', '720p', '480p', '360p'];
	qualities.forEach(q => {
		const option = document.createElement('option');
		option.value = q;
		option.innerText = q;
		qualitySelect.appendChild(option);
	});
	settingsMenu.appendChild(qualitySelect);

	const subtitlesBtn = document.createElement('button');
	subtitlesBtn.innerText = 'Subtitles';
	subtitlesBtn.style.background = 'none';
	subtitlesBtn.style.border = 'none';
	subtitlesBtn.style.color = '#fff';
	subtitlesBtn.style.cursor = 'pointer';
	subtitlesBtn.style.width = '100%';
	subtitlesBtn.style.textAlign = 'left';
	settingsMenu.appendChild(subtitlesBtn);

	// Event listeners
	videoWrapper.addEventListener('mouseenter', () => {
		controlsOverlay.style.opacity = '1';
	});

	videoWrapper.addEventListener('mouseleave', () => {
		controlsOverlay.style.opacity = '0';
		settingsMenu.style.display = 'none';
	});

	playPauseBtn.addEventListener('click', () => {
		if (videoEl.paused) {
			videoEl.play();
		} else {
			videoEl.pause();
		}
	});

	bigPlayBtn.addEventListener('click', () => {
		videoEl.play();
	});

	videoEl.addEventListener('play', () => {
		playPauseBtn.innerText = '⏸';
		bigPlayBtn.style.display = 'none';
	});

	videoEl.addEventListener('pause', () => {
		playPauseBtn.innerText = '▶';
		bigPlayBtn.style.display = 'block';
	});

	videoEl.addEventListener('timeupdate', () => {
		const percent = (videoEl.currentTime / videoEl.duration) * 100;
		progressBar.style.width = percent + '%';
		timeDisplay.innerText = formatTime(videoEl.currentTime) + ' / ' + formatTime(videoEl.duration);
	});

	function formatTime(seconds) {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return mins + ':' + (secs < 10 ? '0' : '') + secs;
	}

	progressContainer.addEventListener('click', (e) => {
		const rect = progressContainer.getBoundingClientRect();
		const percent = (e.clientX - rect.left) / rect.width;
		videoEl.currentTime = percent * videoEl.duration;
	});

	volumeBtn.addEventListener('click', () => {
		videoEl.muted = !videoEl.muted;
		volumeBtn.innerText = videoEl.muted ? '🔇' : '🔊';
	});

	fullscreenBtn.addEventListener('click', () => {
		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			videoWrapper.requestFullscreen();
		}
	});

	// Handle fullscreen changes to make video fill screen
	const handleFullscreenChange = () => {
		if (document.fullscreenElement === videoWrapper || document.webkitFullscreenElement === videoWrapper) {
			// Entering fullscreen on video wrapper
			videoWrapper.style.width = '100vw';
			videoWrapper.style.height = '100vh';
			videoWrapper.style.maxHeight = 'none';
			videoEl.style.width = '100%';
			videoEl.style.height = '100%';
			videoEl.style.maxHeight = 'none';
			videoEl.style.objectFit = 'cover'; // Fill the whole screen, may crop if aspect ratio differs
			progressContainer.style.height = '6px';
			controlsOverlay.style.padding = '15px';
			bigPlayBtn.style.fontSize = '80px';
			bigPlayBtn.style.width = '120px';
			bigPlayBtn.style.height = '120px';
		} else {
			// Exiting fullscreen
			videoWrapper.style.width = '100%';
			videoWrapper.style.height = '';
			videoWrapper.style.maxHeight = '50vh';
			videoWrapper.style.position = 'relative';
			videoWrapper.style.top = '';
			videoWrapper.style.left = '';
			videoWrapper.style.zIndex = '';
			videoEl.style.width = '100%';
			videoEl.style.height = '100%';
			videoEl.style.maxHeight = '50vh';
			videoEl.style.objectFit = '';
			progressContainer.style.height = '4px';
			controlsOverlay.style.padding = '10px';
			bigPlayBtn.style.fontSize = '64px';
			bigPlayBtn.style.width = '100px';
			bigPlayBtn.style.height = '100px';
		}
	};
	document.addEventListener('fullscreenchange', handleFullscreenChange);
	document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

	settingsBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		settingsMenu.style.display = settingsMenu.style.display === 'none' ? 'block' : 'none';
	});

	qualitySelect.addEventListener('change', () => {
		alert(`Switched to ${qualitySelect.value} quality`);
	});

	subtitlesBtn.addEventListener('click', () => {
		const tracks = videoEl.textTracks;
		if (tracks.length > 0) {
			const track = tracks[0];
			track.mode = track.mode === 'showing' ? 'hidden' : 'showing';
			subtitlesBtn.innerText = track.mode === 'showing' ? 'Subtitles ✓' : 'Subtitles';
		} else {
			alert('No subtitles available for this video');
		}
	});

	const header = document.createElement('div');
	header.style.margin = '10px 0 8px';

	const titleEl = document.createElement('h2');
	titleEl.innerText = titleText;
	titleEl.style.margin = '0 0 8px';
	titleEl.style.fontSize = '20px';
	titleEl.style.color = '#f8fafc';

	const stats = document.createElement('div');
	stats.style.color = '#9aa6b2';
	stats.style.fontSize = '13px';
	stats.innerText = `${viewCount.toLocaleString()} views • uploaded ${uploadedAt}`;

	const channelRow = document.createElement('div');
	channelRow.className = 'player-channel-row';

	const channelInfo = document.createElement('div');
	channelInfo.className = 'player-channel-info';

	const avatar = document.createElement('div');
	avatar.className = 'player-channel-avatar';

	avatar.innerText = channelName.trim().charAt(0).toUpperCase() || 'U';

	const channelText = document.createElement('div');
	channelText.className = 'player-channel-details';
	const channelNameEl = document.createElement('div');
	channelNameEl.className = 'player-channel-name';
	channelNameEl.innerText = channelName;

	const subCountEl = document.createElement('div');
	subCountEl.className = 'subscriber-count';
	subCountEl.innerText = `${subscribers.toLocaleString()} subscribers`;


	channelText.appendChild(channelNameEl);
	channelText.appendChild(subCountEl);
	channelInfo.appendChild(avatar);
	channelInfo.appendChild(channelText);

	channelInfo.style.cursor = 'pointer';
	channelInfo.addEventListener('click', (e) => {
		e.stopPropagation();
		const uploaderId = card.dataset.uploaderId;
		if (uploaderId) {
			openProfileView(uploaderId);
		}
	});

	const subscribeBtn = document.createElement('button');
	subscribeBtn.className = 'player-subscribe-btn';
	subscribeBtn.innerText = 'Subscribe';
	subscribeBtn.style.background = '#dc2626'; // red by default
	subscribeBtn.style.color = '#fff';
	subscribeBtn.style.border = 'none';
	subscribeBtn.style.borderRadius = '4px';
	subscribeBtn.style.padding = '8px 16px';
	subscribeBtn.style.cursor = 'pointer';

	// Hover effects
	subscribeBtn.addEventListener('mouseover', () => {
		if (subscribeBtn.innerText !== 'Subscribed') {
			subscribeBtn.style.background = '#65a30d'; // lime green on hover
		}
	});
	subscribeBtn.addEventListener('mouseout', () => {
		if (subscribeBtn.innerText !== 'Subscribed') {
			subscribeBtn.style.background = '#dc2626'; // back to red
		}
	});

	subscribeBtn.addEventListener('click', async (e) => {
		e.stopPropagation();
		const token = localStorage.getItem('mvp_token');
		if (!token) { alert('Please login to subscribe'); return; }
		try {
			const result = await API.toggleSubscribe(card.dataset.uploaderId);
			if (result.subscribed) {
				subscribeBtn.innerText = 'Subscribed';
				subscribeBtn.style.background = '#22c55e'; // green when subscribed
				subCountEl.innerText = `${result.subscribers.toLocaleString()} subscribers`;
			} else {
				subscribeBtn.innerText = 'Subscribe';
				subscribeBtn.style.background = '#dc2626'; // red when not subscribed
				subCountEl.innerText = `${result.subscribers.toLocaleString()} subscribers`;
			}
		} catch (err) {
			console.warn('subscribe error', err);
		}
	});

	right.appendChild(channelRow);
	channelRow.appendChild(channelInfo);
	channelRow.appendChild(subscribeBtn);

	// put like + share in the same line as channel row for YouTube-style behavior
	const likeBtn = document.createElement('button');
	likeBtn.className = 'player-like-btn';
	likeBtn.innerText = `❤ ${likeCountStart}`;
	const shareBtn = document.createElement('button');
	shareBtn.className = 'player-share-btn';
	shareBtn.innerText = 'Share';

	shareBtn.addEventListener('click', async (e) => {
		e.stopPropagation();
		const url = window.location.href;
		if (navigator.share) {
			try {
				await navigator.share({
					title: titleText,
					text: `Check out this video: ${titleText}`,
					url: url
				});
			} catch (err) {
				// User cancelled or error
			}
		} else {
			// Fallback: copy to clipboard
			try {
				await navigator.clipboard.writeText(url);
				alert('Video URL copied to clipboard!');
			} catch (err) {
				alert('Unable to share. URL: ' + url);
			}
		}
	});

	const actionInline = document.createElement('div');
	actionInline.style.display = 'flex';
	actionInline.style.gap = '8px';
	actionInline.style.alignItems = 'center';
	actionInline.style.marginLeft = '12px';
	actionInline.appendChild(likeBtn);
	actionInline.appendChild(shareBtn);
	channelRow.appendChild(actionInline);

	likeBtn.addEventListener('click', async (e) => {
		e.stopPropagation();
		if (!videoId) return;
		const token = localStorage.getItem('mvp_token');
		if (!token) { alert('Please login to like'); return; }
		try {
			const result = await API.toggleLike(videoId);
			likeBtn.innerText = `❤ ${result.likes}`;
		} catch (err) { console.warn('like error', err); }
	});


	// buttons already placed in channel row

	const descriptionSection = document.createElement('div');
	descriptionSection.style.background = '#0b1121';
	descriptionSection.style.border = '1px solid #273449';
	descriptionSection.style.padding = '12px';
	descriptionSection.style.borderRadius = '8px';
	const descText = document.createElement('p');
	descText.style.color = '#d3dae8';
	descText.style.margin = '0';
	descText.style.whiteSpace = 'pre-wrap';
	descText.innerText = descriptionText;
	const descMeta = document.createElement('div');
	descMeta.style.color = '#9aa6b2';
	descMeta.style.fontSize = '13px';
	descMeta.style.margin = '8px 0';
	descMeta.innerText = `${viewCount.toLocaleString()} views • Uploaded ${uploadedAt}`;
	descriptionSection.appendChild(descMeta);
	descriptionSection.appendChild(descText);

	const commentsSection = document.createElement('div');
	commentsSection.style.marginTop = '12px';
	const commentsHeader = document.createElement('h3');
	commentsHeader.innerText = 'Comments';
	commentsHeader.style.color = '#f8fafc';
	commentsHeader.style.margin = '0 0 8px';

	const commentsList = document.createElement('div');
	commentsList.style.maxHeight = '220px';
	commentsList.style.overflowY = 'auto';
	commentsList.style.paddingRight = '8px';

	const commentForm = document.createElement('div');
	commentForm.style.display = 'flex';
	commentForm.style.gap = '8px';
	commentForm.style.marginTop = '8px';
	const commentInput = document.createElement('input');
	commentInput.type = 'text';
	commentInput.placeholder = 'Add a comment...';
	commentInput.style.flex = '1';
	commentInput.style.padding = '8px';
	commentInput.style.border = '1px solid #334155';
	commentInput.style.borderRadius = '5px';
	commentInput.style.background = '#071026';
	commentInput.style.color = '#f8fafc';
	const commentSubmit = document.createElement('button');
	commentSubmit.innerText = 'Comment';
	commentSubmit.style.padding = '8px 12px';
	commentSubmit.style.border = 'none';
	commentSubmit.style.borderRadius = '5px';
	commentSubmit.style.background = '#0ea5e9';
	commentSubmit.style.color = '#fff';
	commentSubmit.style.cursor = 'pointer';
	commentForm.appendChild(commentInput);
	commentForm.appendChild(commentSubmit);

	commentsSection.appendChild(commentsHeader);
	commentsSection.appendChild(commentsList);
	commentsSection.appendChild(commentForm);

	const upNextHeader = document.createElement('h3');
	upNextHeader.innerText = 'Up Next';
	upNextHeader.style.color = '#f8fafc';
	upNextHeader.style.margin = '0 0 8px';

	const upNextList = document.createElement('div');
	upNextList.style.display = 'flex';
	upNextList.style.flexDirection = 'column';
	upNextList.style.gap = '8px';

	right.appendChild(upNextHeader);
	right.appendChild(upNextList);

	left.appendChild(videoWrapper);
	left.appendChild(header);
	header.appendChild(titleEl);
	header.appendChild(stats);
	left.appendChild(channelRow);
	left.appendChild(descriptionSection);
	left.appendChild(commentsSection);

	panel.appendChild(left);
	panel.appendChild(right);
	overlay.appendChild(panel);
	// overlay.appendChild(closeBtn); // moved to videoWrapper
	document.body.appendChild(overlay);

	const renderComments = async () => {
		commentsList.innerHTML = 'Loading comments...';
		if (!videoId) return;
		try {
			const res = await fetch(`/api/videos/${videoId}/comments`);
			if (!res.ok) throw new Error('Failed comments');
			const comments = await res.json();
			commentsList.innerHTML = '';
			comments.forEach(c => {
				const commentItem = document.createElement('div');
				commentItem.style.borderBottom = '1px solid rgba(148,163,184,0.2)';
				commentItem.style.padding = '6px 0';
				const author = document.createElement('div');
				author.style.color = '#f8fafc';
				author.style.fontWeight = '600';
				author.innerText = c.username || 'User';
				const text = document.createElement('div');
				text.style.color = '#d3dae8';
				text.innerText = c.text;
				const commentActions = document.createElement('div');
				commentActions.style.display = 'flex';
				commentActions.style.gap = '8px';
				commentActions.style.marginTop = '4px';
				const likeCom = document.createElement('button');
				likeCom.innerText = `❤ ${c.likes || 0}`;
				likeCom.style.fontSize = '11px';
				likeCom.style.padding = '3px 5px';
				likeCom.style.background = '#1e293b';
				likeCom.style.border = '1px solid #334155';
				likeCom.style.color = '#f8fafc';
				likeCom.style.borderRadius = '4px';
				likeCom.addEventListener('click', async () => {
					const token = localStorage.getItem('mvp_token');
					if (!token) { alert('Login to like comments'); return; }
					try {
						const r = await fetch(`/api/videos/${videoId}/comments/${c.id}/like`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
						if (r.ok) renderComments();
					} catch (err) { console.warn(err); }
				});

				const replyBtn = document.createElement('button');
				replyBtn.innerText = 'Reply';
				replyBtn.style.fontSize = '11px';
				replyBtn.style.padding = '3px 5px';
				replyBtn.style.background = '#1e293b';
				replyBtn.style.border = '1px solid #334155';
				replyBtn.style.color = '#f8fafc';
				replyBtn.style.borderRadius = '4px';
				replyBtn.addEventListener('click', () => {
					const replyInput = document.createElement('input');
					replyInput.type = 'text';
					replyInput.placeholder = 'Type your reply...';
					replyInput.style.width = '100%';
					replyInput.style.marginTop = '6px';
					replyInput.style.padding = '5px';
					replyInput.style.border = '1px solid #334155';
					replyInput.style.borderRadius = '4px';
					const send = document.createElement('button');
					send.innerText = 'Send';
					send.style.marginTop = '4px';
					send.style.padding = '4px 6px';
					send.style.background = '#0ea5e9';
					send.style.color = '#fff';
					send.style.border = 'none';
					send.style.borderRadius = '4px';
					send.addEventListener('click', async () => {
						const token = localStorage.getItem('mvp_token');
						if (!token || !replyInput.value.trim()) return;
						try {
							const r = await fetch(`/api/videos/${videoId}/comments/${c.id}/replies`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: replyInput.value.trim() }) });
							if (r.ok) { renderComments(); }
						} catch (err) { console.warn(err); }
					});
					commentItem.appendChild(replyInput);
					commentItem.appendChild(send);
				});

				commentActions.appendChild(likeCom);
				commentActions.appendChild(replyBtn);
				const repliesList = document.createElement('div');
				repliesList.style.marginTop = '6px';
				if (c.replies && c.replies.length) {
					c.replies.forEach(r => {
						const reply = document.createElement('div');
						reply.style.padding = '4px';
						reply.style.background = '#0f172a';
						reply.style.borderRadius = '4px';
						reply.style.marginTop = '4px';
						reply.style.color = '#e2e8f0';
						reply.innerText = `${r.username || 'User'}: ${r.text}`;
						repliesList.appendChild(reply);
					});
				}
				commentItem.appendChild(author);
				commentItem.appendChild(text);
				commentItem.appendChild(commentActions);
				commentItem.appendChild(repliesList);
				commentsList.appendChild(commentItem);
			});
		} catch (err) {
			commentsList.innerHTML = '<div style="color:#f8fafc">No comments yet</div>';
		}
	};

	commentSubmit.addEventListener('click', async () => {
		const content = commentInput.value.trim();
		if (!content || !videoId) return;
		const token = localStorage.getItem('mvp_token');
		if (!token) { alert('Please login to comment'); return; }
		try {
			const res = await fetch(`/api/videos/${videoId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: content }) });
			if (res.ok) {
				commentInput.value = '';
				renderComments();
			}
		} catch (err) { console.warn('comment post failed', err); }
	});

	const buildUpNext = () => {
		upNextList.innerHTML = '';
		const allCards = Array.from(document.querySelectorAll('.video-card')).filter(c => c !== card);
		allCards.slice(0, 8).forEach(c => {
			const item = document.createElement('div');
			item.style.padding = '8px';
			item.style.background = '#0f172a';
			item.style.border = '1px solid #293547';
			item.style.borderRadius = '8px';
			item.style.cursor = 'pointer';
			item.style.color = '#f8fafc';
			item.style.fontSize = '13px';
			item.innerText = (c.querySelector('.details h4') || {}).innerText || 'Untitled';
			item.addEventListener('click', () => { overlay.remove(); openPlayer(c); });
			upNextList.appendChild(item);
		});
	};

	// state toggles
	if (localStorage.getItem('mvp_token')) {
		(async () => {
			try {
				const subs = await API.getSubscriptionStatus(card.dataset.uploaderId);
				if (subs.subscribed) { 
					subscribeBtn.innerText = 'Subscribed'; 
					subscribeBtn.style.background = '#22c55e'; // green when subscribed
				}
			} catch (err) { /* ignore */ }
		})();
	}

	const cleanup = () => {
		if (videoEl) {
			try { videoEl.pause(); } catch (e) {}
			videoEl.src = '';
		}
		if (currentObjectUrl) {
			try { URL.revokeObjectURL(currentObjectUrl); } catch (e) {}
		}
		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => {});
		}
		document.removeEventListener('keydown', onKeyDown);
		document.removeEventListener('fullscreenchange', handleFullscreenChange);
		document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
		if (overlay && overlay.parentElement) overlay.parentElement.removeChild(overlay);
		document.body.style.overflow = '';
	};

	const onKeyDown = (e) => { if (e.key === 'Escape') cleanup(); };

	document.addEventListener('keydown', onKeyDown);
	document.addEventListener('fullscreenchange', handleFullscreenChange);
	document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

	renderComments();
	buildUpNext();
	try { videoEl.play().catch(() => {}); } catch (e) {}

	closeBtn.addEventListener('click', (e) => { e.stopPropagation(); cleanup(); });
	overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
	document.body.style.overflow = 'hidden';
}



/* ---------------------------
	 API helper functions (basic examples)
	 These are minimal examples to show how the front-end can interact with the
	 backend you just created (register/login/upload/comments/likes).
	 They are intentionally small, and meant for demonstration only.
	 --------------------------- */

const API = (function () {
	const base = API_BASE;
	const tokenKey = 'mvp_token';

	function authHeaders() {
		const t = localStorage.getItem(tokenKey);
		return t ? { Authorization: `Bearer ${t}` } : {};
	}

	// Local fallback datastore (keeps functionality when backend is down)
	function _readJSON(key, def) {
		try { return JSON.parse(localStorage.getItem(key) || 'null') || def; } catch (e) { return def; }
	}

	function _writeJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

	function _getLocalUsers() { return _readJSON('mvp_local_users', []); }
	function _saveLocalUsers(u) { _writeJSON('mvp_local_users', u); }
	function _findLocalUserByEmail(email) { return _getLocalUsers().find(x => x.email === email); }
	function _createLocalUser(username, email, password) {
		const users = _getLocalUsers();
		if (_findLocalUserByEmail(email)) throw new Error('Email already registered locally');
		const user = { id: 'local-' + Date.now() + '-' + Math.floor(Math.random()*9999), username: username || email.split('@')[0], email, password };
		users.push(user); _saveLocalUsers(users); return user;
	}

	function _getLocalVideos() { return _readJSON('mvp_local_videos', []); }
	function _saveLocalVideos(v) { _writeJSON('mvp_local_videos', v); }
	function _createLocalVideo({ title, description, uploader }) {
		const videos = _getLocalVideos();
		const vid = 'localvid-' + Date.now() + '-' + Math.floor(Math.random()*9999);
		const v = { id: vid, title: title || 'Untitled', description: description || '', uploader_id: uploader.id, channel: uploader.username, uploader_avatar: '', thumbnail: '', duration: 0, upload_date: new Date().toISOString(), views: 0, tags: [] , likes: [], comments: [] };
		videos.unshift(v); _saveLocalVideos(videos); return v;
	}

	function _getUserFromToken(t) {
		if (!t) return null;
		try {
			const body = t.split('.')[1] || '';
			const json = atob(body);
			return JSON.parse(json || '{}');
		} catch (e) { return null; }
	}

	function _getLocalNotifications() { return _readJSON('mvp_local_notifications', []); }
	function _saveLocalNotifications(n) { _writeJSON('mvp_local_notifications', n); }
	function _addLocalNotification(n) { const a = _getLocalNotifications(); a.unshift(n); _saveLocalNotifications(a); return n; }

	async function register(username, email, password, bio = '', profilePicFile = null) {
		try {
			let body;
			let headers = {};
			if (profilePicFile) {
				const formData = new FormData();
				formData.append('username', username);
				formData.append('email', email);
				formData.append('password', password);
				formData.append('bio', bio);
				formData.append('profile_pic', profilePicFile);
				body = formData;
			} else {
				headers['Content-Type'] = 'application/json';
				body = JSON.stringify({ username, email, password, bio });
			}
			const res = await fetch(base + '/api/register', { method: 'POST', headers, body });
			if (!res.ok) throw await res.json();
			const data = await res.json();
			localStorage.setItem(tokenKey, data.token);
			return data;
		} catch (err) {
			// Fallback: store user locally
			try {
				const user = _createLocalUser(username, email, password);
				user.bio = bio;
				user.profile_pic = profilePicFile ? 'local-profile-pic' : '';
				_saveLocalUsers(_getLocalUsers().map(u => u.id === user.id ? user : u));
				const payload = { id: user.id, username: user.username, email: user.email, bio: user.bio, profile_pic: user.profile_pic };
				const token = 'local.' + btoa(JSON.stringify(payload)) + '.local';
				localStorage.setItem(tokenKey, token);
				return { token, user: payload };
			} catch (e) {
				throw e;
			}
		}
	}

	async function login(email, password) {
		try {
			const res = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
			if (!res.ok) throw await res.json();
			const data = await res.json();
			localStorage.setItem(tokenKey, data.token);
			return data;
		} catch (err) {
			// Fallback: check local users
			const user = _findLocalUserByEmail(email);
			if (user && user.password === password) {
				const payload = { id: user.id, username: user.username, email: user.email };
				const token = 'local.' + btoa(JSON.stringify(payload)) + '.local';
				localStorage.setItem(tokenKey, token);
				return { token, user: payload };
			}
			// Allow demo quick login
			if (email === 'demo@local' && password === 'demo') {
				const payload = { id: 'demo-local-id', username: 'Demo User', email };
				const dummyToken = 'dummy.' + btoa(JSON.stringify(payload)) + '.local';
				localStorage.setItem(tokenKey, dummyToken);
				return { token: dummyToken, user: payload };
			}
			throw err;
		}
	}

	async function getVideos() {
		try {
			const res = await fetch(base + '/api/videos');
			if (!res.ok) throw new Error('Failed to load videos');
			return res.json();
		} catch (err) {
			// Fallback to local videos store
			return _getLocalVideos();
		}
	}

	async function getTrending() {
		try {
			const res = await fetch(base + '/api/videos/trending');
			if (!res.ok) throw new Error('Failed to load trending');
			return res.json();
		} catch (err) {
			// Fallback: if endpoint doesn't exist, filter locally by views in last 24 hours
			const allVideos = await getVideos();
			const now = Date.now();
			const oneDayAgo = now - (24 * 60 * 60 * 1000);
			return allVideos
				.filter(v => new Date(v.upload_date || v.createdAt).getTime() >= oneDayAgo)
				.sort((a, b) => (b.views || 0) - (a.views || 0))
				.slice(0, 20);
		}
	}

	async function getSubscriptions() {
		try {
			const res = await fetch(base + '/api/subscriptions', { headers: authHeaders() });
			if (!res.ok) throw new Error('Failed to load subscriptions');
			return res.json();
		} catch (err) {
			console.warn('Subscriptions not available');
			return [];
		}
	}

	async function getLibrary() {
		try {
			const res = await fetch(base + '/api/my-videos', { headers: authHeaders() });
			if (!res.ok) throw new Error('Failed to load library');
			return res.json();
		} catch (err) {
			console.warn('Library not available');
			return [];
		}
	}

	async function getHistory() {
		try {
			const res = await fetch(base + '/api/watch-history', { headers: authHeaders() });
			if (!res.ok) throw new Error('Failed to load history');
			return res.json();
		} catch (err) {
			console.warn('History not available');
			return [];
		}
	}

	async function getLikedVideos() {
		try {
			const res = await fetch(base + '/api/liked-videos', { headers: authHeaders() });
			if (!res.ok) throw new Error('Failed to load liked videos');
			return res.json();
		} catch (err) {
			console.warn('Liked videos not available');
			return [];
		}
	}

	async function getNotifications() {
		try {
			const res = await fetch(base + '/api/notifications', { headers: authHeaders() });
			if (!res.ok) throw new Error('Failed to load notifications');
			return res.json();
		} catch (err) {
			// Fallback: fetch liked videos and subscribed videos to generate notifications
			console.warn('Notifications endpoint not available, generating from videos');
			try {
				const [likedVideos, subscriptions] = await Promise.all([
					getLikedVideoNotifications(),
					getSubscriptionNotifications()
				]);
				// include any local notifications stored by the client
				const localNotifs = _getLocalNotifications();
				const all = [...localNotifs, ...likedVideos, ...subscriptions].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
				return all.slice(0, 10);
			} catch (fallbackErr) {
				console.warn('Could not generate notifications');
				return [];
			}
		}
	}

	async function getLikedVideoNotifications() {
		try {
			// Try to fetch videos that the current user uploaded and have recent likes
			const res = await fetch(base + '/api/my-videos/likes', { headers: authHeaders() });
			if (!res.ok) return [];
			return res.json();
		} catch (err) {
			return [];
		}
	}

	async function getSubscriptionNotifications() {
		try {
			// Fetch new videos from subscribed channels
			const res = await fetch(base + '/api/subscriptions/new', { headers: authHeaders() });
			if (!res.ok) return [];
			const videos = await res.json();
			// Transform videos to notifications
			return videos.map(v => ({
				id: v.id,
				title: `New video from ${v.channel || 'a channel'}`,
				message: `"${v.title}" was just uploaded`,
				avatar: '🎬',
				timestamp: v.upload_date || v.createdAt,
				videoId: v.id
			}));
		} catch (err) {
			return [];
		}
	}

	async function uploadVideo(file, title = '', description = '') {
		try {
			const fd = new FormData();
			fd.append('video', file);
			fd.append('title', title);
			fd.append('description', description);
			const res = await fetch(base + '/api/videos', { method: 'POST', headers: authHeaders(), body: fd });
			if (!res.ok) throw await res.json();
			return res.json();
		} catch (err) {
			// Fallback: create a local metadata-only video entry
			const t = localStorage.getItem(tokenKey);
			const user = _getUserFromToken(t) || { id: 'anon', username: 'You' };
			const created = _createLocalVideo({ title, description, uploader: user });
			return created;
		}
	}

	async function postComment(videoId, text) {
		try {
			const res = await fetch(base + `/api/videos/${videoId}/comments`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()), body: JSON.stringify({ text }) });
			if (!res.ok) throw await res.json();
			return res.json();
		} catch (err) {
			// Fallback: store comment locally
			const videos = _getLocalVideos();
			const v = videos.find(x => x.id == videoId);
			if (!v) throw new Error('Video not found');
			const t = localStorage.getItem(tokenKey);
			const user = _getUserFromToken(t) || { id: 'anon', username: 'You' };
			const c = { id: 'c-' + Date.now(), user_id: user.id, username: user.username, text, timestamp: new Date().toISOString(), likes: 0 };
			v.comments = v.comments || [];
			v.comments.push(c);
			_saveLocalVideos(videos);
			return c;
		}
	}

	async function toggleLike(videoId) {
		try {
			const res = await fetch(base + `/api/videos/${videoId}/likes`, { method: 'POST', headers: authHeaders() });
			if (!res.ok) throw await res.json();
			return res.json();
		} catch (err) {
			// Fallback: toggle like locally
			const t = localStorage.getItem(tokenKey);
			const user = _getUserFromToken(t);
			const videos = _getLocalVideos();
			const v = videos.find(x => x.id == videoId);
			if (!v) throw new Error('Video not found');
			v.likes = v.likes || [];
			const idx = user ? v.likes.indexOf(user.id) : -1;
			let liked = false;
			if (idx === -1) {
				if (user) v.likes.push(user.id);
				liked = true;
			} else {
				v.likes.splice(idx, 1);
				liked = false;
			}
			_saveLocalVideos(videos);
			return { likes: v.likes.length, liked };
		}
	}

	async function toggleSubscribe(channelId) {
		const res = await fetch(base + `/api/users/${channelId}/subscribe`, { method: 'POST', headers: authHeaders() });
		if (!res.ok) throw await res.json();
		return res.json();
	}

	async function sendMessage(channelId, text, videoId) {
		try {
			const res = await fetch(base + `/api/users/${channelId}/message`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()), body: JSON.stringify({ text, videoId }) });
			if (!res.ok) throw await res.json();
			return res.json();
		} catch (err) {
			// fallback: store a local notification for the recipient
			const sender = _getUserFromToken(localStorage.getItem(tokenKey)) || { id: 'anon', username: 'You' };
			const notif = { id: 'n-' + Date.now(), title: `Message from ${sender.username}`, message: text, avatar: (sender.username || '👤').slice(0,2), timestamp: new Date().toISOString(), videoId };
			_addLocalNotification(notif);
			return { ok: true, local: true };
		}
	}

	async function getSubscriptionStatus(channelId) {
		try {
			const res = await fetch(base + `/api/users/${channelId}/is-subscribed`, { headers: authHeaders() });
			if (!res.ok) throw new Error('Failed to check subscription status');
			return res.json();
		} catch (err) {
			return { subscribed: false, subscribers: 0 };
		}
	}

	async function getChannelInfo(channelId) {
		try {
			const res = await fetch(base + `/api/users/${channelId}/subscribers`);
			if (!res.ok) throw new Error('Failed to get channel info');
			return res.json();
		} catch (err) {
			return { subscribers: 0, subscribed_to: [] };
		}
	}

	function logout() { localStorage.removeItem(tokenKey); }

	return { register, login, getVideos, getTrending, getSubscriptions, getLibrary, getHistory, getLikedVideos, getNotifications, uploadVideo, postComment, toggleLike, toggleSubscribe, getSubscriptionStatus, getChannelInfo, sendMessage, logout };
})();

// Expose the API helpers for quick testing from the console: window.api.register(...)
window.api = API;

// Simple XHR uploader with progress callback (returns parsed JSON)
window.uploadFileWithProgress = function(file, onProgress) {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', '/api/videos');
		const token = localStorage.getItem('mvp_token');
		if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
		xhr.upload.onprogress = function(e) {
			if (e.lengthComputable) {
				const pct = Math.round((e.loaded / e.total) * 100);
				try { onProgress && onProgress(pct); } catch (err) {}
			}
		};
		xhr.onload = function() {
			if (xhr.status >= 200 && xhr.status < 300) {
				try { resolve(JSON.parse(xhr.responseText)); } catch (e) { resolve({}); }
			} else {
				reject(new Error('Upload failed: ' + xhr.status));
			}
		};
		xhr.onerror = function() { reject(new Error('Network error')); };
		const fd = new FormData();
		fd.append('video', file);
		fd.append('title', file.name);
		fd.append('description', 'Uploaded from client');
		xhr.send(fd);
	});
};

// Utility: add a server-provided video entry to the grid (server returns metadata)
function createVideoCardFromRemote(v) {
	const card = document.createElement('div');
	card.className = 'video-card';

	const thumbnailWrap = document.createElement('div');
	thumbnailWrap.className = 'thumbnail';
	const img = document.createElement('img');
	img.alt = 'Video Thumbnail';
	if (v.thumbnail) img.src = v.thumbnail; else thumbnailWrap.classList.add('no-thumb');
	const durationSpan = document.createElement('span');
	durationSpan.className = 'duration';
	durationSpan.innerText = v.duration ? formatDuration(v.duration) : '';
	if (!durationSpan.innerText) durationSpan.style.display = 'none';
	thumbnailWrap.appendChild(img);
	thumbnailWrap.appendChild(durationSpan);

	const info = document.createElement('div');
	info.className = 'video-info';
	const avatar = document.createElement('div');
	avatar.className = 'avatar';
	
	// Display profile picture if available, otherwise fallback to emoji
	if (v.uploader_avatar) {
		const avatarImg = document.createElement('img');
		avatarImg.src = v.uploader_avatar;
		avatarImg.alt = 'Profile Picture';
		avatarImg.className = 'avatar-img';
		avatar.appendChild(avatarImg);
	} else {
		avatar.innerText = '👤';
	}
	
	avatar.style.cursor = 'pointer';
	avatar.addEventListener('click', (e) => {
		e.stopPropagation();
		openProfileView(v.uploader_id);
	});
	
	const details = document.createElement('div');
	details.className = 'details';
	const h4 = document.createElement('h4');
	h4.innerText = v.title || 'Untitled';
	
	// Channel name only (no buttons on card)
	const channelWrapper = document.createElement('div');
	channelWrapper.className = 'channel-wrapper';
	const p1 = document.createElement('p');
	p1.className = 'channel-name';
	p1.innerText = v.channel || 'Unknown Channel';
	p1.style.cursor = 'pointer';
	p1.style.color = '#00FFFF';
	p1.addEventListener('click', (e) => {
		e.stopPropagation();
		openProfileView(v.uploader_id);
	});
	channelWrapper.appendChild(p1);
	
	// Tags/Hashtags display
	let tagsHtml = '';
	if (v.tags && v.tags.length > 0) {
		tagsHtml = v.tags.map(tag => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join('');
	}
	
	const p2 = document.createElement('p');
	p2.innerText = `${v.views || 0} views • ${formatUploadTime(v.upload_date || Date.now())}`;
	details.appendChild(h4);
	details.appendChild(channelWrapper);
	if (tagsHtml) {
		const tagsDiv = document.createElement('div');
		tagsDiv.className = 'video-tags';
		tagsDiv.innerHTML = tagsHtml;
		details.appendChild(tagsDiv);
	}
	details.appendChild(p2);

	info.appendChild(avatar);
	info.appendChild(details);

	card.appendChild(thumbnailWrap);
	card.appendChild(info);

	card.dataset.tags = v.tags ? v.tags.join(',') : 'ALL';
	card.dataset.videoId = v.id;
	card.dataset.uploaderId = v.uploader_id;
	card.dataset.description = v.description || '';
	card.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openPlayer(card); });
	// store server url and metadata so openPlayer can use it if needed
	card._remoteVideoUrl = v.video_url;
	card._uploaderName = v.channel;
	card._uploaderAvatar = v.uploader_avatar;
	card._subscribers = v.subscribers;
	card._likes = v.likes;
	card.dataset.uploaderId = v.uploader_id;
	card.dataset.videoId = v.id;

	// enable hover preview playback
	enableCardPreview(card);

	return card;
}

// Example: override the upload flow to send to the server when logged in
const originalTriggerUpload = window.triggerUpload;
window.triggerUpload = function () {
	const input = document.getElementById('videoUpload');
	input.onchange = async (e) => {
		const file = e.target.files[0];
		if (!file) return;
		// create placeholder card immediately
		const placeholderCard = await createVideoCardFromFile(file);
		const grid = document.getElementById('videoGrid');
		grid.insertBefore(placeholderCard, grid.firstChild);

		const token = localStorage.getItem('mvp_token');
		if (token) {
			// show progress UI on the card
			const progressWrap = placeholderCard.querySelector('.upload-progress');
			const progressBar = placeholderCard.querySelector('.upload-progress-bar');
			if (progressWrap) progressWrap.style.display = '';
			try {
				const uploaded = await window.uploadFileWithProgress(file, (pct) => {
					if (progressBar) progressBar.style.width = pct + '%';
				});
				// replace placeholder with server-provided card
				const card = createVideoCardFromRemote(uploaded);
				grid.replaceChild(card, placeholderCard);
			} catch (err) {
				console.error('Upload failed', err);
				// keep placeholder (already shown) and hide progress
				if (progressWrap) progressWrap.style.display = 'none';
			}
		} else {
			// not authenticated: keep local placeholder card shown
		}
		input.value = '';
		// cleanup on change handler
		input.onchange = null;
	};
	originalTriggerUpload();
};

