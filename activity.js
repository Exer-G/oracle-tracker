// Oracle Time Tracker - Activity Tracker
// Tracks keyboard/mouse activity per 10-minute block using sampling windows
// ============================================================

class ActivityTracker {
    constructor() {
        this.isTracking = false;
        this.keyboardCount = 0;
        this.mouseCount = 0;
        this.clickCount = 0;
        this.activeSamples = 0;
        this.totalSamples = 0;
        this._windowKeyboard = 0;
        this._windowMouse = 0;
        this._windowClicks = 0;
        this.sampleInterval = null;

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onClick = this._onClick.bind(this);
    }

    start() {
        if (this.isTracking) return;
        this.isTracking = true;
        this.resetBlock();

        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('click', this._onClick);

        this.sampleInterval = setInterval(() => this._sample(), TT_CONFIG.activitySampleInterval * 1000);
        console.log('[Activity] Started tracking');
    }

    stop() {
        this.isTracking = false;
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('click', this._onClick);

        if (this.sampleInterval) {
            clearInterval(this.sampleInterval);
            this.sampleInterval = null;
        }
        console.log('[Activity] Stopped tracking');
    }

    resetBlock() {
        this.keyboardCount = 0;
        this.mouseCount = 0;
        this.clickCount = 0;
        this.activeSamples = 0;
        this.totalSamples = 0;
        this._windowKeyboard = 0;
        this._windowMouse = 0;
        this._windowClicks = 0;
    }

    getBlockActivity() {
        // Do a final sample before returning
        this._sample();

        const percent = this.totalSamples > 0
            ? Math.round((this.activeSamples / this.totalSamples) * 100)
            : 0;

        return {
            percent: Math.min(percent, 100),
            keyboard: this.keyboardCount,
            mouse: this.mouseCount,
            clicks: this.clickCount
        };
    }

    getLivePercent() {
        if (this.totalSamples === 0) return 0;
        return Math.min(Math.round((this.activeSamples / this.totalSamples) * 100), 100);
    }

    _onKeyDown() {
        if (!this.isTracking) return;
        this.keyboardCount++;
        this._windowKeyboard++;
    }

    _onMouseMove() {
        if (!this.isTracking) return;
        this.mouseCount++;
        this._windowMouse++;
    }

    _onClick() {
        if (!this.isTracking) return;
        this.clickCount++;
        this._windowClicks++;
    }

    _sample() {
        if (!this.isTracking) return;

        this.totalSamples++;

        if (this._windowKeyboard > 0 || this._windowMouse > 0 || this._windowClicks > 0) {
            this.activeSamples++;
        }

        // Reset window counters
        this._windowKeyboard = 0;
        this._windowMouse = 0;
        this._windowClicks = 0;
    }
}

// Global instance
window.activityTracker = new ActivityTracker();
