// Notification sound utility
class NotificationSound {
  constructor() {
    this.audioContext = null;
    this.isEnabled = true;
  }

  // Initialize audio context
  init() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  // Play notification sound using Web Audio API
  playNotificationSound() {
    if (!this.isEnabled) return;

    try {
      this.init();
      
      // Create oscillator for bell-like sound
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      // Connect nodes
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      // Configure bell-like sound
      oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.1);
      
      // Configure volume envelope
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
      
      // Play sound
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.5);
      
    } catch (error) {
      console.warn('Could not play notification sound:', error);
    }
  }

  // Alternative method using HTML5 Audio with data URL
  playSimpleBeep() {
    if (!this.isEnabled) return;

    try {
      // Create a simple beep sound using data URL
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 600;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
      
    } catch (error) {
      console.warn('Could not play simple beep:', error);
    }
  }

  // Enable/disable sound
  setEnabled(enabled) {
    this.isEnabled = enabled;
  }

  // Check if sound is enabled
  isNotificationEnabled() {
    return this.isEnabled;
  }
}

// Create singleton instance
const notificationSound = new NotificationSound();

export default notificationSound;
