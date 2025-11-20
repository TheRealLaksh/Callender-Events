import { durationMap, durationRegex } from './config.js';

let messageTimeout;

export function showMessage(message, type = 'success') {
    const messageBox = document.getElementById('message-box');
    if (!messageBox) return;

    if (messageTimeout) clearTimeout(messageTimeout);

    messageBox.textContent = message;
    
    // Tailwind classes for Success vs Error
    const colorClasses = type === 'success' 
        ? 'bg-emerald-500 shadow-emerald-500/20' 
        : 'bg-red-500 shadow-red-500/20';
    
    // Reset base classes + add specific color
    messageBox.className = `fixed bottom-6 right-6 px-6 py-4 rounded-xl shadow-2xl text-white font-medium transform transition-all duration-500 ease-out z-50 flex items-center gap-3 border border-white/10 backdrop-blur-md ${colorClasses}`;
    
    // Animate In
    requestAnimationFrame(() => {
        messageBox.classList.remove('translate-y-10', 'opacity-0', 'hidden');
        messageBox.classList.add('translate-y-0', 'opacity-100');
    });

    // Animate Out
    messageTimeout = setTimeout(() => {
        messageBox.classList.remove('translate-y-0', 'opacity-100');
        messageBox.classList.add('translate-y-10', 'opacity-0');
        // Hide display:none after animation finishes
        setTimeout(() => messageBox.classList.add('hidden'), 500);
    }, 4000);
}

export function generateUniqueId() {
    return new Date().getTime().toString(36) + Math.random().toString(36).substr(2, 5);
}

export function getReminderDisplayText(isoDuration) {
    if (durationMap[isoDuration]) return durationMap[isoDuration];
    const match = isoDuration.match(durationRegex);
    if (match) {
        if (match[1]) return `${match[1]} ${match[2] === 'D' ? 'Day(s)' : 'Hour(s)'}`;
        else if (match[3]) return `${match[3]} ${match[4] === 'H' ? 'Hour(s)' : 'Min(s)'}`;
    }
    return 'Custom Alarm';
}