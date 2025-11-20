import { loadFromStorage, state, saveToStorage } from './state.js';
import { renderCalendar, changeMonth, renderEventSlots, changeView } from './calendar.js';
import { setupExport, importICS } from './ics.js';
import { 
    renderReminders, handleEventSubmit, 
    editEvent, deleteEvent, duplicateEvent, undoDelete,
    addReminderToForm, addCustomReminder, removeReminder, 
    toggleReminderArea, toggleClearModal, executeClearAll 
} from './events.js';
import { initFallingPattern } from './background.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Load Data & Initial Render
    loadFromStorage();
    renderReminders();
    renderCalendar();
    setupExport();
    
    // 2. Initialize Flatpickr
    flatpickr("#event-datetime-start", {
        enableTime: true,
        dateFormat: "Y-m-d\\TH:i", 
        altInput: true,
        altFormat: "F j, Y at h:i K",
        time_24hr: false,
        theme: "dark"
    });

    flatpickr("#event-datetime-end", {
        enableTime: true,
        dateFormat: "Y-m-d\\TH:i",
        altInput: true,
        altFormat: "F j, Y at h:i K",
        time_24hr: false,
        theme: "dark"
    });

    // 3. Start Background Animation
    initFallingPattern();

    // 4. Event Listeners
    document.getElementById('event-form')?.addEventListener('submit', handleEventSubmit);
    
    document.getElementById('prev-month-btn')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month-btn')?.addEventListener('click', () => changeMonth(1));
    
    document.getElementById('today-btn')?.addEventListener('click', () => {
        const now = new Date();
        state.currentCalendarDate = now;
        state.selectedDate = now;
        renderCalendar();
        renderEventSlots();
    });

    document.getElementById('clear-all-btn')?.addEventListener('click', () => toggleClearModal(true));
    document.getElementById('execute-clear-btn')?.addEventListener('click', executeClearAll);
    document.getElementById('cancel-clear-btn')?.addEventListener('click', () => toggleClearModal(false));

    // --- #8 Search Listener ---
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderEventSlots(); // Re-render list based on search term
        });
    }

    // --- #23 Keyboard Shortcuts ---
    document.addEventListener('keydown', (e) => {
        // Ctrl+Z: Undo
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            undoDelete();
        }
        // Slash: Focus Search
        if (e.key === '/') {
            if(document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                e.preventDefault();
                document.getElementById('search-input')?.focus();
            }
        }
        // Arrows: Navigation
        if(document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            if (e.key === 'ArrowRight') changeMonth(1);
            if (e.key === 'ArrowLeft') changeMonth(-1);
        }
    });

    // --- #9 Swipe Gestures (Touch) ---
    const grid = document.getElementById('calendar-grid');
    let touchStartX = 0;
    
    if (grid) {
        grid.addEventListener('touchstart', e => {
            touchStartX = e.changedTouches[0].screenX;
        }, {passive: true});

        grid.addEventListener('touchend', e => {
            const touchEndX = e.changedTouches[0].screenX;
            const diff = touchStartX - touchEndX;
            // Threshold of 50px for swipe
            if (diff > 50) changeMonth(1); // Swipe Left -> Next
            if (diff < -50) changeMonth(-1); // Swipe Right -> Prev
        }, {passive: true});
    }

    // 5. Service Worker Registration
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker Registered', reg.scope))
            .catch(err => console.error('SW Registration Failed:', err));
    }

    // 6. Request Notification Permission
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
});

// --- Window Exports (for HTML onclick handlers) ---

// #6 Theme Toggle
window.toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    // Optional: Update Flatpickr theme dynamically if needed, but usually requires CSS swap
};

// Initialize theme from storage
if (localStorage.getItem('theme') === 'light') {
    document.documentElement.classList.remove('dark');
}

// Export other functions
window.deleteEvent = deleteEvent;
window.duplicateEvent = duplicateEvent;
window.editEvent = editEvent;
window.addReminderToForm = addReminderToForm;
window.addCustomReminder = addCustomReminder;
window.removeReminder = removeReminder;
window.toggleReminderArea = toggleReminderArea;
window.importICS = importICS;
window.toggleClearModal = toggleClearModal;
window.changeView = changeView; // Export view switcher