import { loadFromStorage, state } from './state.js';
import { renderCalendar, changeMonth, changeView, renderEventSlots } from './calendar.js'; 
import { setupExport, importICS } from './ics.js';
import {
    renderReminders, handleEventSubmit,
    editEvent, deleteEvent, duplicateEvent, undoDelete, parseNaturalLanguage,
    addReminderToForm, addCustomReminder, removeReminder,
    toggleReminderArea, toggleClearModal, executeClearAll
} from './events.js';
import { initFallingPattern } from './background.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Start Background Animation (if enabled)
    if (localStorage.getItem('bg_anim') !== 'off') {
        initFallingPattern();
    } else {
        const canvas = document.getElementById('falling-pattern-canvas');
        if (canvas) canvas.style.display = 'none';
    }
    
    // 2. Load Data & Initial Render
    loadFromStorage();
    renderReminders();
    renderCalendar(); 
    renderEventSlots(); 
    setupExport();

    // 3. Initialize Date Pickers (Flatpickr)
    const startFP = flatpickr("#event-datetime-start", {
        enableTime: true,
        dateFormat: "Y-m-d\\TH:i",
        altInput: true,
        altFormat: "F j, Y at h:i K",
        time_24hr: false,
        theme: "dark"
    });

    const endFP = flatpickr("#event-datetime-end", {
        enableTime: true,
        dateFormat: "Y-m-d\\TH:i",
        altInput: true,
        altFormat: "F j, Y at h:i K",
        time_24hr: false,
        theme: "dark"
    });

    // 4. Event Listeners
    document.getElementById('event-form')?.addEventListener('submit', handleEventSubmit);

    document.getElementById('prev-month-btn')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month-btn')?.addEventListener('click', () => changeMonth(1));

    document.getElementById('today-btn')?.addEventListener('click', () => {
        const now = new Date();
        state.currentCalendarDate = now;
        state.selectedDate = now;
        renderCalendar();
    });

    document.getElementById('clear-all-btn')?.addEventListener('click', () => toggleClearModal(true));
    document.getElementById('execute-clear-btn')?.addEventListener('click', executeClearAll);
    document.getElementById('cancel-clear-btn')?.addEventListener('click', () => toggleClearModal(false));

    // Search Functionality
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderEventSlots();
        });
        
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                parseNaturalLanguage(e.target.value);
            }
        });
    }

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            undoDelete();
        }
        if (e.key === '/') {
            if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                e.preventDefault();
                document.getElementById('search-input')?.focus();
            }
        }
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            if (e.key === 'ArrowRight') changeMonth(1);
            if (e.key === 'ArrowLeft') changeMonth(-1);
        }
    });

    // Swipe Gestures for Mobile
    const grid = document.getElementById('calendar-grid');
    let touchStartX = 0;
    if (grid) {
        grid.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
        grid.addEventListener('touchend', e => {
            const diff = touchStartX - e.changedTouches[0].screenX;
            if (diff > 50) changeMonth(1);
            if (diff < -50) changeMonth(-1);
        }, { passive: true });
    }

    // Service Worker & Notifications
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(console.error);
    }
    if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
});

// Global Exports for HTML Interaction
window.toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
};
if (localStorage.getItem('theme') === 'light') document.documentElement.classList.remove('dark');

// Background Toggle Logic
window.toggleBackground = () => {
    const canvas = document.getElementById('falling-pattern-canvas');
    if (!canvas) return;
    
    if (canvas.style.display === 'none') {
        canvas.style.display = 'block';
        localStorage.setItem('bg_anim', 'on');
        initFallingPattern(); // Restart animation
    } else {
        canvas.style.display = 'none';
        localStorage.setItem('bg_anim', 'off');
    }
};

window.deleteEvent = deleteEvent;
window.duplicateEvent = duplicateEvent;
window.editEvent = editEvent;
window.addReminderToForm = addReminderToForm;
window.addCustomReminder = addCustomReminder;
window.removeReminder = removeReminder;
window.toggleReminderArea = toggleReminderArea;
window.importICS = importICS;
window.toggleClearModal = toggleClearModal;
window.changeView = changeView;