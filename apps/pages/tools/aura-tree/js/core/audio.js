
// Audio Manager for handling BGM and SFX
export class AudioManager {
    constructor() {
        this.bgm = new Audio('assets/audio/bgm.mp3');
        this.bgm.loop = true;
        this.bgm.volume = 0.5;

        this.sfxMap = {
            'stars': new Audio('assets/audio/sfx_x.mp3'),
            'heart': new Audio('assets/audio/sfx_x.mp3'),
            'star': new Audio('assets/audio/sfx_x.mp3'),
            'fly': new Audio('assets/audio/sfx_x.mp3') // Mapped to 'text' shape
        };

        this.isMuted = false;
        this.hasStarted = false;

        // Preload settings
        Object.values(this.sfxMap).forEach(sfx => {
            sfx.volume = 0.7;
            sfx.preload = 'auto';
        });
    }

    startBGM() {
        if (this.hasStarted) return;
        this.hasStarted = true;

        // Try to play immediately (will work if user has interacted)
        const playPromise = this.bgm.play();

        if (playPromise !== undefined) {
            playPromise.catch(e => {
                console.log("Audio autoplay blocked by browser, will start on first user interaction");
                // Browser blocked autoplay, keep trying on user interaction
                this.hasStarted = false; // Allow retry
            });
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        this.bgm.muted = this.isMuted;
        Object.values(this.sfxMap).forEach(sfx => sfx.muted = this.isMuted);
        return this.isMuted;
    }

    playSFX(type) {
        if (this.isMuted) return;
        const sfx = this.sfxMap[type];
        if (sfx) {
            sfx.currentTime = 0;
            sfx.play().catch(e => console.warn(`SFX ${type} missing or blocked`));
        }
    }
}

export const audioManager = new AudioManager();
