class AudioPlayer {
    /**
     * @type {HTMLAudioElement}
     */
    #audio;

    /**
     * @type {string[]}
     */
    #sources;

    /**
     * @type {boolean}
     */
    #looping;
    
    /**
     * @type {string[]}
     */
    #remainingSources = [];

    /**
     * @type {boolean}
     */
    #shuffle = false;

    /**
     * @type {number}
     */
    #speed = 1;

    /**
     * @type {number}
     */
    #volume = 1;

    /**
     * @type {number|undefined}
     */
    #fadingIntervalId = undefined;

    /**
     * @type {number|undefined}
     */
    #beforeFadeOutVolume = 1;

    /**
     * @type {Map<AudioEventType[keyof typeof AudioEventType], AudioEventListenerEntry[]>}
     */
    #eventListeners = new Map();

    /**
     * @param {string|string[]} sources
     * @param {boolean} looping
     */
    constructor (sources = [], looping = false) {
        this.#createAudio();
        this.#sources = asArray(sources, true);
        this.#looping = looping;
    }

    static get MIN_TIME() {
        return 0;
    }

    static get MIN_SPEED() {
        return 0;
    }

    static get MIN_VOLUME() {
        return 0;
    }

    static get MAX_VOLUME() {
        return 1;
    }

    static get MIN_FADE_VOLUME() {
        return 0.01;
    }

    /**
     * @param {string|string[]} sources
     * @returns {this}
     */
    setSources(sources) {
        this.#sources = asArray(sources, true);
        this.#remainingSources.length = 0;
        return this;
    }

    /**
     * @param {boolean} looping
     * @returns {this}
     */
    setLooping(looping) {
        this.#looping = looping;
        return this;
    }

    /**
     * @param {number} time
     * @returns {this}
     */
    setCurrentTime(time) {
        time = lowerBoundValue(time, AudioPlayer.MIN_TIME);
        const duration = this.getDuration();
        if (!isNaN(duration) && isFinite(duration)) {
            time = upperBoundValue(time, duration); // Max time is the duration if available
        }

        this.#audio.currentTime = time;
        return this;
    }

    /**
     * @param {number} speed
     * @returns {this}
     */
    setSpeed(speed) {
        this.#speed = lowerBoundValue(speed, AudioPlayer.MIN_SPEED);
        if (this.isPlaying()) {
            if (this.#speed <= 0) {
                this.pause();
            }
            else {
                this.#audio.playbackRate = this.#speed;
            }
        }
        return this;
    }

    /**
     * Set the audio volume, from 0 to 1. Note that during fade out process, this method doesn't change the volume to ensure
     * consistent fade out transition.
     * @param {number} volume
     * @returns {this}
     */
    setVolume(volume) {
        if (this.#fadingIntervalId) {
            return this;
        }

        this.#audio.volume = boundValue(volume, AudioPlayer.MIN_VOLUME, AudioPlayer.MAX_VOLUME);
        this.#volume = this.#audio.volume;
        return this;
    }

    /**
     * @param {boolean} shuffle
     * @returns {this}
     */
    setShuffle(shuffle) {
        this.#shuffle = shuffle;
        return this;
    }

    /**
     * @param {boolean} muted
     * @returns {this}
     */
    setMuted(muted) {
        this.#audio.muted = muted;
        if (!muted) {
            this.#audio.volume = this.#volume;
        }
        return this;
    }

    /**
     * @param {AudioEventType[keyof typeof AudioEventType]} eventType
     * @param {(event: AudioEvent) => void} listener
     * @param {AudioEventOptions} options
     * @returns {this}
     */
    addEventListener(eventType, listener, options = undefined) {
        let entries = this.#eventListeners.get(eventType);
        if (!entries) {
            entries = [];
            this.#eventListeners.set(eventType, entries);
        }
        options ??= {};
        entries.push({ listener, options });
        return this;
    }

    /**
     * @param {AudioEventType[keyof typeof AudioEventType]} eventType
     * @param {(event: AudioEvent) => void} listener
     * @returns {this}
     */
    removeEventListener(eventType, listener) {
        const entries = this.#eventListeners.get(eventType);
        if (!entries) {
            return this;
        }

        const idx = entries.findIndex(entry => entry.listener === listener);
        if (idx >= 0) {
            entries.splice(idx, 1);
        }
        return this;
    }

    /**
     * @param {(AudioEventType[keyof typeof AudioEventType])|(AudioEventType[keyof typeof AudioEventType])[]|undefined} eventType
     * @return {this}
     */
    removeEventListeners(eventType = undefined) {
        if (typeof eventType === 'undefined') {
            this.#eventListeners.clear();
            return this;
        }

        const eventTypes = asArray(eventType);
        eventTypes.forEach(e => this.#eventListeners.delete(e));
        return this;
    }

    /**
     * @returns {boolean}
     */
    isPlaying() {
        return !this.#audio.paused && this.#audio.currentTime > 0 && !this.#audio.ended;
    };

    /**
     * @returns {boolean}
     */
    isStopped() {
        return this.#audio.paused && this.#audio.currentTime === 0;
    };

    /**
     * @returns {boolean}
     */
    isPaused() {
        return this.#audio.paused;
    }

    /**
     * @returns {boolean}
     */
    isLooping() {
        return this.#looping;
    }

    /**
     * @returns {boolean}
     */
    isShuffle() {
        return this.#shuffle;
    }

    /**
     * @returns {boolean}
     */
    isMuted() {
        return this.#audio.muted;
    }

    /**
     * @returns {boolean}
     */
    isFadingOut() {
        return typeof this.#fadingIntervalId !== 'undefined';
    }

    /**
     * Get the current playback position in seconds
     * @returns {number} The playback position in seconds
     */
    getCurrentTime() {
        return this.#audio.currentTime;
    }

    /**
     * Get the playing speed
     * @returns {number} The playing speed
     */
    getSpeed() {
        return this.#speed;
    }

    /**
     * Get the duration in seconds
     * @returns {number} Return various value depending on the state of the audio
     * - The duration in seconds if available
     * - NaN if duration is unavailable
     * - Infinity if the audio is streaming
     */
    getDuration() {
        return this.#audio.duration;
    }

    /**
     * Get the volume level
     * @returns {number} The volume level, between 0 and 1
     */
    getVolume() {
        return this.#volume;
    }

    /**
     * @param {number} by 
     * @returns {this}
     */
    incrementVolume(by = 0.1) {
        const volume = this.getVolume();
        this.setVolume(volume + by);
        return this;
    }

    /**
     * @param {number} by 
     * @returns {this}
     */
    decrementVolume(by = 0.1) {
        return this.incrementVolume(-by);
    }

    /**
     * @param {number} by 
     * @returns {this}
     */
    incrementSpeed(by = 0.5) {
        const speed = this.getSpeed();
        this.setSpeed(speed + by);
        return this;
    }

    /**
     * @param {number} by 
     * @returns {this}
     */
    decrementSpeed(by = 0.5) {
        return this.incrementSpeed(-by);
    }

    /**
     * @return {this}
     */
    toggleMuted() {
        return this.setMuted(!this.isMuted());
    }

    /**
     * @returns {this}
     */
    togglePause() {
        if (this.isPaused()) {
            this.resume();
        }
        else {
            this.pause();
        }
        return this;
    }

    /**
     * @returns {this}
     */
    play() {
        // If playing, no need to play again
        if (this.isPlaying()) {
            return this;
        }

        if (this.isFadingOut()) {
            console.warn("Cannot play new song while fade-out is in progress.");
            return this;
        }

        this.#cleanUp();
        // Attach this loop to the end event regardless of currently looping or not to handle casess
        // where user changes looping setting to true halfway through the audio
        this.#audio.addEventListener('ended', () => this.#playbackLoop());
        this.#playTrack();
        return this;
    }

    /**
     * @returns {this}
     */
    playNext() {
        if (!this.isPlaying()) {
            return this;
        }

        if (this.isFadingOut()) {
            console.warn("Cannot play new song while fade-out is in progress.");
            return this;
        }

        this.stop();
        this.#playTrack();
        return this;
    }

    /**
     * @returns {this}
     */
    pause() {
        // If paused, no need to pause again
        if (this.isPaused()) {
            return this;
        }

        this.#audio.pause();
        this.#notifyListeners('pause');
        return this;
    }

    /**
     * @returns {this}
     */
    resume() {
        if (this.isPaused()) {
            this.#startAudio(true);
        }
        return this;
    }

    /**
     * @returns {this}
     */
    stop() {
        // If stopped, no need to stop again
        if (this.isStopped()) {
            return this;
        }

        if (this.isFadingOut()) {
            this.#endFadeOut();
        }

        this.#cleanUp();
        this.#notifyListeners('stop');
        return this;
    }

    /**
     * @param {number} fadeIntervalMs
     * @param {number} fadeVolume
     * @returns {this}
     */
    stopFadeOut(fadeIntervalMs = 100, fadeVolume = 0.1) {
        if (this.isFadingOut()) {
            console.warn("Fade-out is already in progress. Skipping.");
            return this;
        }

        fadeIntervalMs = lowerBoundValue(fadeIntervalMs, 0);
        if (fadeIntervalMs <= 0) {
            return this.stop();
        }

        fadeVolume = boundValue(fadeVolume, AudioPlayer.MIN_FADE_VOLUME, AudioPlayer.MAX_VOLUME);
        this.#beforeFadeOutVolume = this.getVolume();

        let previousVolume = this.#beforeFadeOutVolume;

        this.#fadingIntervalId = setInterval(() => {
            if (this.#audio.volume <= fadeVolume) {
                this.#endFadeOut();
                this.stop();
                return;
            } 

            this.#audio.volume -= fadeVolume;
            // Some browser do not allow direct change to audio volume
            if (previousVolume === this.#audio.volume) {
                this.#endFadeOut();
                this.stop();
            }
            else {
                previousVolume = this.#audio.volume;
            }
        }, fadeIntervalMs);
        return this;
    }

    #endFadeOut() {
        clearInterval(this.#fadingIntervalId);
        this.#fadingIntervalId = undefined;
        this.setVolume(this.#beforeFadeOutVolume);
    }

    #createAudio() {
        this.#audio = new Audio();
        this.#audio.preload = "auto";  // Preload the audio for smoother playback
        this.#audio.volume = this.#volume;
    }

    #cleanUp() {
        this.#audio.pause();
        this.#audio.currentTime = 0;
        this.#audio.removeEventListener('ended', this.#playbackLoop);
    }

    #startAudio(fromPaused) {
        this.#audio
            .play()
            .then(() => this.#notifyListeners(fromPaused ? 'resume' : 'play'))
            .catch(err => console.error('Playback error:', err));
    }

    #playTrack() {
        if (this.#speed <= 0 || this.#sources.length === 0) {
            return;
        }

        if (this.#remainingSources.length === 0) {
            this.#remainingSources = [...this.#sources].reverse();
        }

        let source;
        if (this.#shuffle) {
            const idx = randomIdx(this.#remainingSources);
            source = this.#remainingSources.splice(idx, 1)[0];
        }
        else {
            source = this.#remainingSources.pop();
        }

        this.#audio.src = source;
        this.#audio.load();
        this.#startAudio(false);
        this.#audio.playbackRate = this.#speed;
    }

    #playbackLoop() {
        if (this.isLooping()) {
            this.#playTrack();
        }
        else {
            this.#audio.removeEventListener('ended', this.#playbackLoop.bind(this));
        }
    }

    /**
     * @param {AudioEventType[keyof typeof AudioEventType]} eventType
     */
    #notifyListeners(eventType) {
        const entries = this.#eventListeners.get(eventType);
        if (!entries || entries.length === 0) {
            return;
        }

        const event = new AudioEvent(this, eventType);
        const removedIndices = new Set();

        entries.forEach((entry, index) => {
            entry.listener(event);

            const options = entry.options;
            if (options?.once) {
                removedIndices.add(index);
            }
        });

        if (removedIndices.size === 0) {
            return;
        }

        removeIndices(entries, removedIndices);
    }
}

class AudioEventListenerEntry {
    /**
     * @type {(event: AudioEvent) => void}
     */
    listener;

    /**
     * @type {AudioEventOptions}
     */
    options;
}

const AudioEventType = Object.freeze({
    PLAY: 'play',
    STOP: 'stop',
    PAUSE: 'pause', 
    RESUME: 'resume',
});

class AudioEvent {
    /**
     * @type {AudioPlayer}
     */
    #target;

    /**
     * @type {AudioEventType[keyof typeof AudioEventType]}
     */
    #type;

    /**
     * 
     * @param {AudioPlayer} target
     * @param {AudioEventType[keyof typeof AudioEventType]} type
     */
    constructor(target, type) {
        this.#target = target;
        this.#type = type;
    }

    get target() {
        return this.#target;
    }

    get type() {
        return this.#type;
    }
}

class AudioEventOptions {
    /**
     * Specifiy whether the listener should be invoked at most once (it is removed from the listeners list after the invocation).
     * @type {boolean | undefined}
     */
    once = undefined;
}