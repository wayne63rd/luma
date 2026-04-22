// Upload page functionality
const API_BASE = window.API_BASE || '';
const MAX_FILE_SIZE = 1 * 1024 * 1024 * 1024; // 1GB in bytes
const MAX_TITLE_LENGTH = 100;
const MAX_DESC_LENGTH = 500;

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

let selectedFile = null;
let selectedThumbnail = null;

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

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    setupAuthUI();
    setupUploadArea();
    setupVideoInput();
    setupThumbnailInput();
    setupCharCounts();
    setupNotifications();
    setupUploadsSidebar();
    setupPlayerModal();
    loadUserUploads();
});

// ============ Auth UI Setup ============
function setupAuthUI() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const authModal = document.getElementById('authModal');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');

    // Check if user is logged in
    const token = localStorage.getItem('mvp_token');
    if (token) {
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'block';
        fetchUserInfo();
    }

    // Login button
    loginBtn?.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        authModal.style.display = 'flex';
    });

    // Logout button
    logoutBtn?.addEventListener('click', () => {
        localStorage.removeItem('mvp_token');
        location.reload();
    });

    // Modal close button
    document.querySelector('.modal-close')?.addEventListener('click', () => {
        authModal.style.display = 'none';
    });

    // Tab switching
    tabLogin?.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    });

    tabRegister?.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    });

    // Login form
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        try {
            const res = await fetch(`${API_BASE}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (res.ok) {
                localStorage.setItem('mvp_token', data.token);
                authModal.style.display = 'none';
                location.reload();
            } else {
                alert(data.error || 'Login failed');
            }
        } catch (err) {
            alert('Login error: ' + err.message);
        }
    });

    // Register form
    registerForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('regUsername').value;
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;
        try {
            const res = await fetch(`${API_BASE}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
            const data = await res.json();
            if (res.ok) {
                localStorage.setItem('mvp_token', data.token);
                authModal.style.display = 'none';
                location.reload();
            } else {
                alert(data.error || 'Registration failed');
            }
        } catch (err) {
            alert('Registration error: ' + err.message);
        }
    });

    // Close modal on background click
    authModal?.addEventListener('click', (e) => {
        if (e.target === authModal) {
            authModal.style.display = 'none';
        }
    });
}

// Fetch user info
async function fetchUserInfo() {
    const token = localStorage.getItem('mvp_token');
    if (!token) return;

    try {
        const res = await fetch('/api/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const user = await res.json();
            const navUsername = document.getElementById('navUsername');
            const userAvatar = document.querySelector('.user-avatar');
            
            if (navUsername) {
                navUsername.textContent = user.username;
                // Make username non-clickable - reset cursor to default
                navUsername.style.cursor = 'default';
                navUsername.style.pointerEvents = 'none';
            }
            
            // Update avatar with profile picture
            if (userAvatar) {
                if (user.profile_pic) {
                    userAvatar.style.backgroundImage = `url('${user.profile_pic}')`;
                    userAvatar.style.backgroundSize = 'cover';
                    userAvatar.style.backgroundPosition = 'center';
                    userAvatar.innerText = '';
                } else {
                    userAvatar.style.backgroundImage = '';
                    userAvatar.innerText = '👤';
                }
                // Make sure avatar is clickable
                userAvatar.style.cursor = 'pointer';
                userAvatar.style.pointerEvents = 'auto';
            }
        }
    } catch (err) {
        console.error('Error fetching user info:', err);
    }
}

// ============ Notifications Setup ============
function setupNotifications() {
    const notificationBtn = document.getElementById('notificationBtn');
    const notificationPanel = document.getElementById('notificationPanel');
    const closeNotifications = document.getElementById('closeNotifications');

    notificationBtn?.addEventListener('click', () => {
        notificationPanel.style.display = notificationPanel.style.display === 'none' ? 'block' : 'none';
    });

    closeNotifications?.addEventListener('click', () => {
        notificationPanel.style.display = 'none';
    });
}

// ============ Upload Area Setup ============
function setupUploadArea() {
    const uploadArea = document.getElementById('uploadArea');

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleVideoFile(files[0]);
        }
    });
}

// ============ Video Input Setup ============
function setupVideoInput() {
    const videoInput = document.getElementById('videoInput');
    videoInput?.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleVideoFile(e.target.files[0]);
        }
    });
}

// Handle video file selection
function handleVideoFile(file) {
    // Validate file type
    if (!file.type.startsWith('video/')) {
        showError('Please select a valid video file');
        return;
    }

    // Validate file size (1GB max)
    if (file.size > MAX_FILE_SIZE) {
        showError(`File size exceeds 1GB limit. Your file is ${(file.size / 1024 / 1024 / 1024).toFixed(2)}GB`);
        return;
    }

    selectedFile = file;
    updateFilePreview();
}

// Update file preview
function updateFilePreview() {
    if (!selectedFile) return;

    const uploadArea = document.getElementById('uploadArea');
    const filePreview = document.getElementById('filePreview');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');

    uploadArea.style.display = 'none';
    filePreview.style.display = 'block';

    fileName.textContent = selectedFile.name;
    fileSize.textContent = `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`;
}

// Remove file
function removeFile() {
    selectedFile = null;
    document.getElementById('videoInput').value = '';
    document.getElementById('uploadArea').style.display = 'block';
    document.getElementById('filePreview').style.display = 'none';
}

// ============ Thumbnail Input Setup ============
function setupThumbnailInput() {
    const thumbnailInput = document.getElementById('thumbnailInput');
    const thumbnailArea = document.getElementById('thumbnailArea');

    // File input
    thumbnailInput?.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleThumbnailFile(e.target.files[0]);
        }
    });

    // Drag and drop
    thumbnailArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        thumbnailArea.classList.add('drag-over');
    });

    thumbnailArea.addEventListener('dragleave', () => {
        thumbnailArea.classList.remove('drag-over');
    });

    thumbnailArea.addEventListener('drop', (e) => {
        e.preventDefault();
        thumbnailArea.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            handleThumbnailFile(e.dataTransfer.files[0]);
        }
    });
}

// Handle thumbnail file
function handleThumbnailFile(file) {
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showError('Please select a valid image file for thumbnail');
        return;
    }

    // Validate file size (5MB max for thumbnail)
    const maxThumbSize = 5 * 1024 * 1024;
    if (file.size > maxThumbSize) {
        showError('Thumbnail file is too large. Maximum size is 5MB');
        return;
    }

    // Show cropper for thumbnail
    const reader = new FileReader();
    reader.onload = (e) => {
        ImageCropper.open(e.target.result, (croppedBlob) => {
            selectedThumbnail = croppedBlob;
            updateThumbnailPreview();
        });
    };
    reader.readAsDataURL(file);
}

// Update thumbnail preview
function updateThumbnailPreview() {
    if (!selectedThumbnail) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const thumbnailArea = document.getElementById('thumbnailArea');
        const thumbnailPreview = document.getElementById('thumbnailPreview');
        const thumbnailImg = document.getElementById('thumbnailImg');

        thumbnailArea.style.display = 'none';
        thumbnailPreview.style.display = 'block';
        thumbnailImg.src = e.target.result;
    };
    reader.readAsDataURL(selectedThumbnail);
}

// Remove thumbnail
function removeThumbnail() {
    selectedThumbnail = null;
    document.getElementById('thumbnailInput').value = '';
    document.getElementById('thumbnailArea').style.display = 'flex';
    document.getElementById('thumbnailPreview').style.display = 'none';
}

// ============ Character Counters ============
function setupCharCounts() {
    const titleInput = document.getElementById('videoTitle');
    const descInput = document.getElementById('videoDescription');

    titleInput?.addEventListener('input', () => {
        document.getElementById('titleCount').textContent = `${titleInput.value.length}/${MAX_TITLE_LENGTH}`;
    });

    descInput?.addEventListener('input', () => {
        document.getElementById('descCount').textContent = `${descInput.value.length}/${MAX_DESC_LENGTH}`;
    });
}

// ============ Upload Video ============
async function uploadVideo() {
    const token = localStorage.getItem('mvp_token');
    if (!token) {
        showError('You must be logged in to upload videos');
        document.getElementById('authModal').style.display = 'flex';
        return;
    }

    // Validate inputs
    if (!selectedFile) {
        showError('Please select a video file');
        return;
    }

    const title = document.getElementById('videoTitle').value.trim();
    if (!title) {
        showError('Please enter a video title');
        return;
    }

    const description = document.getElementById('videoDescription').value.trim();

    // Prepare FormData
    const formData = new FormData();
    formData.append('video', selectedFile);
    formData.append('title', title);
    formData.append('description', description);
    if (selectedThumbnail) {
        formData.append('thumbnail', selectedThumbnail);
    }

    // Disable button and show progress
    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = true;
    document.getElementById('uploadProgress').style.display = 'block';

    try {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                document.getElementById('progressFill').style.width = percentComplete + '%';
                document.getElementById('progressText').textContent = `Uploading... ${Math.round(percentComplete)}%`;
            }
        });

        // Handle completion
        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                // After successful upload, get video duration
                getVideoDuration(response.video_url, response.id, token);
                showSuccess();
            } else {
                const error = JSON.parse(xhr.responseText);
                showError(error.error || 'Upload failed');
                uploadBtn.disabled = false;
            }
        });

        // Handle errors
        xhr.addEventListener('error', () => {
            showError('Upload failed. Please check your connection and try again.');
            uploadBtn.disabled = false;
        });

        xhr.open('POST', `${API_BASE}/api/videos`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);

    } catch (err) {
        showError('Error: ' + err.message);
        uploadBtn.disabled = false;
    }
}

// Show success message
function showSuccess() {
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('uploadError').style.display = 'none';
    document.getElementById('uploadSuccess').style.display = 'block';
}

// Show error message
function showError(message) {
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('uploadSuccess').style.display = 'none';
    document.getElementById('uploadError').style.display = 'block';
    document.getElementById('errorMessage').textContent = message;
}

// Clear error
function clearError() {
    document.getElementById('uploadError').style.display = 'none';
    document.getElementById('uploadBtn').disabled = false;
}

// Navigate home
function goHome() {
    // Reload the uploads list to show the new video
    loadUserUploads();
    // Wait a moment then go to home page
    setTimeout(() => {
        window.location.href = 'index.html?view=library';
    }, 1000);
}

// ============ Uploads Sidebar Setup ============
function setupUploadsSidebar() {
    const uploadsList = document.getElementById('uploadsList');
    if (!uploadsList) return;
    uploadsList.innerHTML = '<div class="sidebar-loading">Loading uploads...</div>';
}

// Load user's uploaded videos
async function loadUserUploads() {
    const token = localStorage.getItem('mvp_token');
    if (!token) return;

    const uploadsList = document.getElementById('uploadsList');
    if (!uploadsList) return;

    try {
        const res = await fetch(`${API_BASE}/api/me/videos`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const videos = await res.json();
            if (videos.length === 0) {
                uploadsList.innerHTML = '<p style="padding:10px;color:#9aa6b2;">No uploads yet</p>';
                return;
            }
            uploadsList.innerHTML = '';
            videos.forEach(video => {
                const videoItem = createUploadVideoItem(video);
                uploadsList.appendChild(videoItem);
            });
        } else {
            uploadsList.innerHTML = '<p style="padding:10px;color:#9aa6b2;">Error loading videos</p>';
        }
    } catch (err) {
        console.error('Error loading user videos:', err);
        uploadsList.innerHTML = '<p style="padding:10px;color:#9aa6b2;">Error loading videos</p>';
    }
}

// Create sidebar upload video item
function createUploadVideoItem(video) {
    const item = document.createElement('div');
    item.className = 'upload-video-item';
    item.style.cssText = `
        padding: 8px 12px;
        margin: 4px 0;
        background: rgba(0, 255, 255, 0.05);
        border: 1px solid rgba(0, 255, 255, 0.2);
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    item.addEventListener('mouseenter', () => {
        item.style.background = 'rgba(0, 255, 255, 0.1)';
        item.style.borderColor = 'rgba(0, 255, 255, 0.4)';
    });
    item.addEventListener('mouseleave', () => {
        item.style.background = 'rgba(0, 255, 255, 0.05)';
        item.style.borderColor = 'rgba(0, 255, 255, 0.2)';
    });
    
    const titleContainer = document.createElement('div');
    titleContainer.style.cssText = `
        flex: 1;
        min-width: 0;
    `;
    
    const title = document.createElement('div');
    title.style.cssText = `
        color: #9aa6b2;
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `;
    title.textContent = video.title;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑️';
    deleteBtn.style.cssText = `
        background: rgba(255, 65, 65, 0.1);
        border: 1px solid rgba(255, 65, 65, 0.3);
        border-radius: 4px;
        color: #FF4141;
        padding: 4px 6px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
        margin-left: 8px;
        flex-shrink: 0;
    `;
    deleteBtn.addEventListener('mouseenter', () => {
        deleteBtn.style.background = 'rgba(255, 65, 65, 0.2)';
        deleteBtn.style.borderColor = 'rgba(255, 65, 65, 0.5)';
    });
    deleteBtn.addEventListener('mouseleave', () => {
        deleteBtn.style.background = 'rgba(255, 65, 65, 0.1)';
        deleteBtn.style.borderColor = 'rgba(255, 65, 65, 0.3)';
    });
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${video.title}"? This cannot be undone.`)) {
            deleteVideo(video.id);
        }
    });
    
    titleContainer.appendChild(title);
    item.appendChild(titleContainer);
    item.appendChild(deleteBtn);
    item.addEventListener('click', () => openPlayerFromUpload(video));
    
    return item;
}

// Setup video player modal
function setupPlayerModal() {
    const playerModal = document.getElementById('playerModal');
    const playerClose = playerModal?.querySelector('.player-close');
    
    playerClose?.addEventListener('click', () => {
        playerModal.style.display = 'none';
        const playerVideo = document.getElementById('playerVideo');
        if (playerVideo) {
            playerVideo.pause();
            playerVideo.src = '';
        }
    });
    
    playerModal?.addEventListener('click', (e) => {
        if (e.target === playerModal) {
            playerModal.style.display = 'none';
            const playerVideo = document.getElementById('playerVideo');
            if (playerVideo) {
                playerVideo.pause();
                playerVideo.src = '';
            }
        }
    });
}

// Open video player from uploads sidebar
function openPlayerFromUpload(video) {
    const playerModal = document.getElementById('playerModal');
    const playerVideo = document.getElementById('playerVideo');
    const playerTitle = document.getElementById('playerTitle');
    const playerChannel = document.getElementById('playerChannel');
    const playerDescription = document.getElementById('playerDescription');
    const playerStats = document.getElementById('playerStats');
    const playerTags = document.getElementById('playerTags');
    const playerAvatar = playerModal?.querySelector('.player-avatar');
    const playerSubscribeBtn = document.getElementById('playerSubscribeBtn');
    const playerLikeBtn = document.getElementById('playerLikeBtn');
    const playerDeleteBtn = document.getElementById('playerDeleteBtn');
    
    if (!playerModal) return;
    
    // Set video source
    playerVideo.src = video.file_path || video.video_path;
    
    // Set metadata
    playerTitle.textContent = video.title;
    playerChannel.textContent = video.uploader_name || 'Unknown Channel';
    playerDescription.textContent = video.description || 'No description provided';
    
    // Set avatar
    if (video.uploader_avatar) {
        playerAvatar.style.backgroundImage = `url('${video.uploader_avatar}')`;
        playerAvatar.style.backgroundSize = 'cover';
        playerAvatar.style.backgroundPosition = 'center';
        playerAvatar.innerText = '';
    } else {
        playerAvatar.style.backgroundImage = '';
        playerAvatar.innerText = '👤';
    }
    
    // Set stats
    const views = video.views || 0;
    const uploadedAt = formatUploadTime(video.upload_date || video.created_at || Date.now());
    playerStats.textContent = `${views} views • Uploaded ${uploadedAt}`;
    
    // Set tags if available
    if (video.tags && video.tags.length > 0) {
        playerTags.innerHTML = video.tags.map(tag => `<span class="video-tag">#${tag}</span>`).join('');
    } else {
        playerTags.innerHTML = '';
    }
    
    // Disable engagement buttons (user is watching their own video)
    playerSubscribeBtn.style.display = 'none';
    playerLikeBtn.style.display = 'none';
    
    // Show delete button and wire it up
    playerDeleteBtn.style.display = 'inline-block';
    playerDeleteBtn.onclick = () => {
        if (confirm(`Delete "${video.title}"? This cannot be undone.`)) {
            deleteVideo(video.id);
        }
    };
    
    // Show player
    playerModal.style.display = 'flex';
}

// Delete video
async function deleteVideo(videoId) {
    const token = localStorage.getItem('mvp_token');
    if (!token) {
        alert('You must be logged in to delete videos');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/videos/${videoId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            alert('Video deleted successfully');
            // Close player modal if open
            const playerModal = document.getElementById('playerModal');
            if (playerModal) {
                playerModal.style.display = 'none';
                const playerVideo = document.getElementById('playerVideo');
                if (playerVideo) {
                    playerVideo.pause();
                    playerVideo.src = '';
                }
            }
            // Reload uploads list
            loadUserUploads();
        } else {
            const error = await res.json();
            alert(error.error || 'Failed to delete video');
        }
    } catch (err) {
        console.error('Error deleting video:', err);
        alert('Error deleting video: ' + err.message);
    }
}

// Get video duration and save to database
function getVideoDuration(videoUrl, videoId, token) {
    const video = document.createElement('video');
    video.onloadedmetadata = function() {
        const duration = Math.round(this.duration);
        // Send duration to server
        fetch(`${API_BASE}/api/videos/${videoId}/duration`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ duration })
        })
        .catch(err => console.error('Error saving duration:', err));
    };
    video.onerror = function() {
        console.warn('Could not determine video duration');
    };
    video.src = videoUrl;
}
