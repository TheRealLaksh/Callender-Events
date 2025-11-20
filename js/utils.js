import { durationMap, durationRegex } from './config.js';

export function showMessage(message, type = 'success') {
    const messageBox = document.getElementById('message-box');
    if (!messageBox) return;

    messageBox.textContent = message;
    const bgColor = type === 'success' ? 'bg-emerald-500' : 'bg-red-500';
    messageBox.className = `message-box p-4 rounded-xl text-white font-medium shadow-lg ${bgColor}`;
    messageBox.classList.remove('hidden');

    // Trigger CSS animation restart
    messageBox.style.animation = 'none';
    void messageBox.offsetWidth;
    messageBox.style.animation = null;
}

export function generateUniqueId() {
    return new Date().getTime().toString(36) + Math.random().toString(36).substr(2, 5);
}

export function getReminderDisplayText(isoDuration) {
    if (durationMap[isoDuration]) {
        return durationMap[isoDuration];
    }
    const match = isoDuration.match(durationRegex);
    if (match) {
        if (match[1]) return `${match[1]} ${match[2] === 'D' ? 'Day(s)' : 'Hour(s)'}`;
        else if (match[3]) return `${match[3]} ${match[4] === 'H' ? 'Hour(s)' : 'Min(s)'}`;
    }
    return 'Custom Alarm';
}