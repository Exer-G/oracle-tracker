// Oracle Time Tracker - Screenshot Capture
// Uses Screen Capture API (getDisplayMedia) to capture screenshots
// ============================================================

class ScreenshotCapture {
    constructor() {
        this.stream = null;
        this.videoElement = null;
        this.canvas = null;
        this.ctx = null;
        this.lastScreenshot = null;
        this.lastScreenshotTime = null;
        this.hasPermission = false;
        this.previewInterval = null;
    }

    async requestPermission() {
        try {
            this.stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'never',
                    displaySurface: 'monitor'
                },
                audio: false
            });

            this.videoElement = document.createElement('video');
            this.videoElement.srcObject = this.stream;
            this.videoElement.muted = true;
            await this.videoElement.play();

            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d');
            this.hasPermission = true;

            // Listen for user manually stopping screen share
            const track = this.stream.getVideoTracks()[0];
            track.addEventListener('ended', () => {
                console.log('[Screenshot] User stopped screen sharing');
                this.hasPermission = false;
                this.stream = null;
                this._updateCaptureStatus(false);
            });

            this._updateCaptureStatus(true);
            console.log('[Screenshot] Permission granted');
            return true;
        } catch (err) {
            console.log('[Screenshot] Permission denied or error:', err.message);
            this.hasPermission = false;
            this._updateCaptureStatus(false);
            return false;
        }
    }

    async captureFrame() {
        if (!this.stream || !this.hasPermission || !this.videoElement) {
            return null;
        }

        try {
            const track = this.stream.getVideoTracks()[0];
            const settings = track.getSettings();
            this.canvas.width = settings.width || 1920;
            this.canvas.height = settings.height || 1080;
            this.ctx.drawImage(this.videoElement, 0, 0);

            const quality = parseFloat(document.getElementById('settingsQuality')?.value) || TT_CONFIG.screenshotQuality;
            const base64 = this.canvas.toDataURL('image/jpeg', quality);
            this.lastScreenshot = base64;
            this.lastScreenshotTime = new Date();

            return base64;
        } catch (err) {
            console.error('[Screenshot] Capture error:', err);
            return null;
        }
    }

    getLastScreenshot() {
        return this.lastScreenshot;
    }

    async uploadToStorage(supabaseClient, userId, sessionId, blockNumber) {
        if (!this.lastScreenshot) return null;

        try {
            const filePath = `${userId}/${sessionId}/${blockNumber}.jpg`;

            // Convert base64 to blob
            const response = await fetch(this.lastScreenshot);
            const blob = await response.blob();

            const { data, error } = await supabaseClient.storage
                .from(TT_CONFIG.storageBucket)
                .upload(filePath, blob, {
                    contentType: 'image/jpeg',
                    upsert: true
                });

            if (error) {
                console.error('[Screenshot] Upload error:', error);
                return null;
            }

            // Get public URL
            const { data: urlData } = supabaseClient.storage
                .from(TT_CONFIG.storageBucket)
                .getPublicUrl(filePath);

            return urlData.publicUrl;
        } catch (err) {
            console.error('[Screenshot] Upload error:', err);
            return null;
        }
    }

    startPreviewUpdates(callback) {
        if (this.previewInterval) clearInterval(this.previewInterval);

        this.previewInterval = setInterval(async () => {
            if (this.hasPermission) {
                const frame = await this.captureFrame();
                if (frame && callback) callback(frame);
            }
        }, TT_CONFIG.previewInterval * 1000);
    }

    stopPreviewUpdates() {
        if (this.previewInterval) {
            clearInterval(this.previewInterval);
            this.previewInterval = null;
        }
    }

    revokePermission() {
        this.stopPreviewUpdates();
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        if (this.videoElement) {
            this.videoElement.srcObject = null;
            this.videoElement = null;
        }
        this.hasPermission = false;
        this.lastScreenshot = null;
        this._updateCaptureStatus(false);
        console.log('[Screenshot] Permission revoked');
    }

    _updateCaptureStatus(active) {
        const statusEl = document.getElementById('screenshotStatus');
        const captureStatusEl = document.getElementById('captureStatus');

        if (statusEl) {
            statusEl.textContent = active ? 'Screen Shared' : 'No Screen Shared';
            statusEl.className = 'badge ' + (active ? 'badge-success' : 'badge-neutral');
        }
        if (captureStatusEl) {
            captureStatusEl.textContent = active ? 'Active' : 'Not Active';
            captureStatusEl.className = 'badge ' + (active ? 'badge-success' : 'badge-neutral');
        }
    }
}

// Global instance
window.screenshotCapture = new ScreenshotCapture();
