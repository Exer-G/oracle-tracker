// Oracle Time Tracker - Timer Engine
// Manages 10-minute block cycles with screenshot scheduling
// ============================================================

class TimerEngine {
    constructor() {
        this.state = 'idle'; // idle | running | paused
        this.sessionId = null;
        this.projectId = null;
        this.memo = '';
        this.sessionStartTime = null;
        this.currentBlockStart = null;
        this.currentBlockNumber = 0;
        this.completedBlocks = [];
        this.displayInterval = null;
        this.blockTimeout = null;
        this.screenshotTimeout = null;
        this.screenshotTaken = false;

        // Callbacks
        this.onTick = null;
        this.onBlockComplete = null;
        this.onScreenshotNeeded = null;
        this.onStateChange = null;
    }

    start(projectId, memo) {
        if (this.state === 'running') return;

        this.state = 'running';
        this.projectId = projectId;
        this.memo = memo;
        this.sessionId = this._generateId();
        this.sessionStartTime = Date.now();
        this.currentBlockStart = Date.now();
        this.currentBlockNumber = 1;
        this.completedBlocks = [];
        this.screenshotTaken = false;

        // Start display update (every second)
        this.displayInterval = setInterval(() => this._tick(), 1000);

        // Schedule screenshot at random time within the block
        this._scheduleScreenshot();

        // Schedule block completion
        this._scheduleBlockEnd();

        // Persist state
        this._saveState();

        if (this.onStateChange) this.onStateChange('running');
        console.log('[Timer] Started session:', this.sessionId);
    }

    stop() {
        if (this.state !== 'running') return;

        const blockElapsed = (Date.now() - this.currentBlockStart) / 1000;

        // Save partial block if >= threshold
        if (blockElapsed >= TT_CONFIG.partialBlockThreshold) {
            this._completeBlock(true);
        }

        this.state = 'idle';
        this._clearTimers();
        this._saveState();

        if (this.onStateChange) this.onStateChange('idle');
        console.log('[Timer] Stopped. Blocks completed:', this.completedBlocks.length);
    }

    reset() {
        this.state = 'idle';
        this._clearTimers();
        this.sessionId = null;
        this.sessionStartTime = null;
        this.currentBlockStart = null;
        this.currentBlockNumber = 0;
        this.completedBlocks = [];
        this.screenshotTaken = false;
        this._clearSavedState();

        if (this.onStateChange) this.onStateChange('idle');
        console.log('[Timer] Reset');
    }

    getElapsedSeconds() {
        if (!this.sessionStartTime) return 0;
        return Math.floor((Date.now() - this.sessionStartTime) / 1000);
    }

    getCurrentBlockElapsed() {
        if (!this.currentBlockStart || this.state !== 'running') return 0;
        return Math.floor((Date.now() - this.currentBlockStart) / 1000);
    }

    getCurrentBlockProgress() {
        const elapsed = this.getCurrentBlockElapsed();
        return Math.min(elapsed / TT_CONFIG.blockDuration, 1);
    }

    restore() {
        try {
            const saved = localStorage.getItem('tt_timer_state');
            if (!saved) return false;

            const state = JSON.parse(saved);
            if (state.state !== 'running') return false;

            // Restore state
            this.state = 'running';
            this.sessionId = state.sessionId;
            this.projectId = state.projectId;
            this.memo = state.memo;
            this.sessionStartTime = state.sessionStartTime;
            this.completedBlocks = state.completedBlocks || [];

            // Calculate missed blocks
            const now = Date.now();
            const lastBlockEnd = state.currentBlockStart;
            const timeSinceBlock = now - lastBlockEnd;
            const missedBlocks = Math.floor(timeSinceBlock / (TT_CONFIG.blockDuration * 1000));

            // Create entries for missed blocks (without screenshots)
            this.currentBlockNumber = state.currentBlockNumber;
            for (let i = 0; i < missedBlocks; i++) {
                const blockStart = lastBlockEnd + (i * TT_CONFIG.blockDuration * 1000);
                const blockEnd = blockStart + (TT_CONFIG.blockDuration * 1000);
                this.completedBlocks.push({
                    blockNumber: this.currentBlockNumber,
                    startTime: blockStart,
                    endTime: blockEnd,
                    durationSeconds: TT_CONFIG.blockDuration,
                    screenshot: null,
                    activityPercent: 0,
                    missed: true
                });
                this.currentBlockNumber++;
            }

            // Set current block start to the right time
            this.currentBlockStart = lastBlockEnd + (missedBlocks * TT_CONFIG.blockDuration * 1000);
            this.screenshotTaken = false;

            // Resume timers
            this.displayInterval = setInterval(() => this._tick(), 1000);
            this._scheduleScreenshot();
            this._scheduleBlockEnd();

            if (this.onStateChange) this.onStateChange('running');
            console.log('[Timer] Restored session. Missed blocks:', missedBlocks);
            return true;
        } catch (err) {
            console.error('[Timer] Restore error:', err);
            this._clearSavedState();
            return false;
        }
    }

    _tick() {
        if (this.state !== 'running') return;

        const totalElapsed = this.getElapsedSeconds();
        const blockElapsed = this.getCurrentBlockElapsed();
        const blockProgress = this.getCurrentBlockProgress();

        if (this.onTick) {
            this.onTick({
                totalElapsed,
                blockElapsed,
                blockProgress,
                blockNumber: this.currentBlockNumber,
                completedBlocks: this.completedBlocks.length
            });
        }

        // Save state periodically (every 10 seconds)
        if (totalElapsed % 10 === 0) {
            this._saveState();
        }
    }

    _scheduleScreenshot() {
        if (this.screenshotTimeout) clearTimeout(this.screenshotTimeout);

        // Random delay between min and max (in seconds)
        const minDelay = TT_CONFIG.screenshotMinDelay;
        const maxDelay = TT_CONFIG.screenshotMaxDelay;
        const delay = (minDelay + Math.random() * (maxDelay - minDelay)) * 1000;

        // Adjust for time already elapsed in this block
        const elapsed = Date.now() - this.currentBlockStart;
        const adjustedDelay = Math.max(delay - elapsed, 1000);

        this.screenshotTimeout = setTimeout(() => {
            if (this.state === 'running' && !this.screenshotTaken) {
                this.screenshotTaken = true;
                if (this.onScreenshotNeeded) this.onScreenshotNeeded();
                console.log('[Timer] Screenshot triggered for block', this.currentBlockNumber);
            }
        }, adjustedDelay);
    }

    _scheduleBlockEnd() {
        if (this.blockTimeout) clearTimeout(this.blockTimeout);

        const elapsed = Date.now() - this.currentBlockStart;
        const remaining = (TT_CONFIG.blockDuration * 1000) - elapsed;

        this.blockTimeout = setTimeout(() => {
            if (this.state === 'running') {
                this._completeBlock(false);
            }
        }, Math.max(remaining, 0));
    }

    _completeBlock(isPartial) {
        const block = {
            blockNumber: this.currentBlockNumber,
            startTime: this.currentBlockStart,
            endTime: Date.now(),
            durationSeconds: isPartial
                ? Math.floor((Date.now() - this.currentBlockStart) / 1000)
                : TT_CONFIG.blockDuration,
            screenshot: window.screenshotCapture?.getLastScreenshot() || null,
            screenshotTime: window.screenshotCapture?.lastScreenshotTime || null,
            activityPercent: window.activityTracker?.getBlockActivity()?.percent || 0,
            activityKeyboard: window.activityTracker?.getBlockActivity()?.keyboard || 0,
            activityMouse: window.activityTracker?.getBlockActivity()?.mouse || 0,
            isPartial
        };

        this.completedBlocks.push(block);

        if (this.onBlockComplete) this.onBlockComplete(block);

        // Reset for next block (only if not stopping)
        if (!isPartial) {
            this.currentBlockNumber++;
            this.currentBlockStart = Date.now();
            this.screenshotTaken = false;

            // Reset activity tracker for new block
            if (window.activityTracker) window.activityTracker.resetBlock();

            // Schedule next screenshot and block end
            this._scheduleScreenshot();
            this._scheduleBlockEnd();
        }

        this._saveState();
        console.log('[Timer] Block', block.blockNumber, 'completed.',
            isPartial ? '(partial)' : '',
            'Activity:', block.activityPercent + '%');
    }

    _clearTimers() {
        if (this.displayInterval) { clearInterval(this.displayInterval); this.displayInterval = null; }
        if (this.blockTimeout) { clearTimeout(this.blockTimeout); this.blockTimeout = null; }
        if (this.screenshotTimeout) { clearTimeout(this.screenshotTimeout); this.screenshotTimeout = null; }
    }

    _saveState() {
        try {
            localStorage.setItem('tt_timer_state', JSON.stringify({
                state: this.state,
                sessionId: this.sessionId,
                projectId: this.projectId,
                memo: this.memo,
                sessionStartTime: this.sessionStartTime,
                currentBlockStart: this.currentBlockStart,
                currentBlockNumber: this.currentBlockNumber,
                completedBlocks: this.completedBlocks.map(b => ({
                    ...b,
                    screenshot: null // Don't store screenshots in localStorage
                }))
            }));
        } catch (err) {
            console.error('[Timer] Save state error:', err);
        }
    }

    _clearSavedState() {
        localStorage.removeItem('tt_timer_state');
    }

    _generateId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
            Math.floor(Math.random() * 16).toString(16)
        );
    }
}

// Global instance
window.timerEngine = new TimerEngine();
