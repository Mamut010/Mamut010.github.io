class AudioHandler {
    /**
     * @type {HTMLAudioElement}
     */
    #audio;

    /**
     * @type {string[]}
     */
    #sources;
    
    /**
     * @type {string[]}
     */
    #remainingSources = [];

    /**
     * @type {boolean}
     */
    #looping;

    /**
     * @type {boolean}
     */
    #shuffle = false;

    /**
     * @type {number}
     */
    #speed = 1;

    /**
     * @param {string|string[]} sources
     * @param {boolean} looping
     */
    constructor (sources = [], looping = false) {
        this.#createAudio();
        this.#sources = asArray(sources);
        this.#looping = looping;
    }

    #createAudio() {
        this.#audio = new Audio();
        this.#audio.preload = "auto";  // Preload the audio for smoother playback
        this.#audio.volume = 1;
    }

    #cleanUp() {
        this.stop();
        this.#audio?.removeEventListener('ended', this.#playbackLoop);
    }

    #startAudio() {
        this.#audio
            ?.play()
            // .then(() => console.log(`Playing audio '${this.#audio.src}')`))
            .catch(err => console.error('Playback error:', err));
    }

    #playTrack() {
        if (!this.#audio || this.#sources.length === 0) {
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
        this.#startAudio();
        this.#audio.playbackRate = this.#speed;
    }

    #playbackLoop() {
        if (this.isLooping()) {
            this.#playTrack();
        }
        else {
            this.#audio.removeEventListener('ended', this.#playbackLoop);
        }
    }

    /**
     * @param {string|string[]} sources
     * @returns {this}
     */
    setSources(sources) {
        this.#sources = asArray(sources, true);
        this.#remainingSources = clearOrNewArray(this.#remainingSources);
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
        if (!this.isAudioLoaded()) {
            return this;
        }

        time = Math.max(time, 0); // Min time is 0
        const duration = this.getDuration();
        if (!isNaN(duration) && isFinite(duration)) {
            time = Math.min(time, duration); // Max time is duration if available
        }

        this.#audio.currentTime = time;
        return this;
    }

    /**
     * @param {number} speed
     * @returns {this}
     */
    setSpeed(speed) {
        this.#speed = Math.max(speed, 0);
        return this;
    }

    /**
     * @param {number} volume
     * @returns {this}
     */
    setVolume(volume) {
        if (this.isAudioLoaded()) {
            volume = Math.max(volume, 0);
            volume = Math.min(volume, 1);
            this.#audio.volume = volume;
        }
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

    isAudioLoaded() {
        return typeof this.#audio !== 'undefined';
    }

    /**
     * @returns {boolean}
     */
    isPlaying() {
        return this.#audio && !this.#audio.paused && this.#audio.currentTime > 0 && !this.#audio.ended;
    };

    /**
     * @returns {boolean}
     */
    isPaused() {
        return this.#audio?.paused === true;
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
     * Get the current playback position in seconds
     * @returns {number} The playback position in seconds or -1 if no audio has been loaded
     */
    getCurrentTime() {
        return this.#audio?.currentTime ?? -1;
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
     * - -1 if no audio has been loaded
     * - NaN if duration is unavailable
     * - Infinity if the audio is streaming
     */
    getDuration() {
        return this.#audio?.duration ?? -1;
    }

    /**
     * Get the volume level
     * @returns {number} The volume level, ranging from 0 to 1, or -1 if no audio has been loaded
     */
    getVolume() {
        return this.#audio?.volume ?? -1;
    }

    /**
     * @param {number} by 
     * @returns {this}
     */
    incrementVolume(by = 0.1) {
        if (this.isAudioLoaded()) {
            const volume = this.getVolume();
            this.setVolume(volume + by);
        }
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
        if (this.isAudioLoaded()) {
            const speed = this.getSpeed();
            this.setSpeed(speed + by);
        }
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
     * @returns {this}
     */
    play() {
        // If playing, no need to play again
        if (!this.isAudioLoaded() || this.isPlaying()) {
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
        if (this.isPlaying()) {
            this.stop();
            this.#playTrack();
        }
        return this;
    }

    /**
     * @returns {this}
     */
    pause() {
        this.#audio?.pause();
        return this;
    }

    /**
     * @returns {this}
     */
    resume() {
        if (this.isPaused()) {
            this.#startAudio();
        }
        return this;
    }

    /**
     * @returns {this}
     */
    stop() {
        this.pause();
        return this.setCurrentTime(0);
    }
}