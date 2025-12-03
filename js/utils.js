import { durationMap, durationRegex } from './config.js';

let messageTimeout;
let hideTimeout; // FIX: Track the fade-out timer to prevent race conditions

export function showMessage(message, type = 'success') {
    const messageBox = document.getElementById('message-box');
    if (!messageBox) return;

    // FIX: Clear BOTH timers. 
    // This ensures if a previous message was mid-fade-out, we stop it from hiding the new one.
    if (messageTimeout) clearTimeout(messageTimeout);
    if (hideTimeout) clearTimeout(hideTimeout);

    messageBox.textContent = message;
    
    const colorClasses = type === 'success' 
        ? 'bg-emerald-500 shadow-emerald-500/20' 
        : 'bg-red-500 shadow-red-500/20';
    
    // 1. Reset to 'Start' state (Hidden off-screen, but display:block)
    messageBox.className = `fixed bottom-6 right-6 px-6 py-4 rounded-xl shadow-2xl text-white font-medium transform transition-all duration-500 ease-out z-50 flex items-center gap-3 border border-white/10 backdrop-blur-md ${colorClasses} translate-y-10 opacity-0`;
    
    // 2. Remove 'hidden' so it renders
    messageBox.classList.remove('hidden');

    // 3. FORCE REFLOW (Critical for animation to restart)
    void messageBox.offsetWidth; 

    // 4. Animate to 'Active' state
    requestAnimationFrame(() => {
        messageBox.classList.remove('translate-y-10', 'opacity-0');
        messageBox.classList.add('translate-y-0', 'opacity-100');
    });

    // 5. Schedule Hide
    messageTimeout = setTimeout(() => {
        // Start Fade Out
        messageBox.classList.remove('translate-y-0', 'opacity-100');
        messageBox.classList.add('translate-y-10', 'opacity-0');
        
        // Schedule display:none after transition finishes
        hideTimeout = setTimeout(() => {
            messageBox.classList.add('hidden');
        }, 500); 
    }, 4000);
}

export function generateUniqueId() {
    // Use substring instead of deprecated substr
    return new Date().getTime().toString(36) + Math.random().toString(36).substring(2, 7);
}

export function getReminderDisplayText(isoDuration) {
    if (!isoDuration) return '';

    // Check predefined map first
    if (durationMap[isoDuration]) return durationMap[isoDuration];
    
    // Parse custom ISO strings based on config.js regex: /^(-P(\d+)D|-PT(\d+)([MH]))$/
    const match = isoDuration.match(durationRegex);
    if (match) {
        // Group 2: Days digits (e.g. '1' from -P1D)
        if (match[2]) {
            return `${match[2]} Day(s)`;
        }
        // Group 3: Time digits, Group 4: Unit (M/H)
        if (match[3] && match[4]) {
            return `${match[3]} ${match[4] === 'H' ? 'Hour(s)' : 'Min(s)'}`;
        }
    }
    return 'Custom Alarm';
}

export function isValidDate(d) {
    return d instanceof Date && !isNaN(d);
}