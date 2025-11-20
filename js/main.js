import { loadFromStorage, state } from './state.js';
import { renderCalendar, changeMonth, changeView } from './calendar.js'; // renderEventSlots is called internally now
import { setupExport, importICS } from './ics.js';
import {
    renderReminders, handleEventSubmit,
    editEvent, deleteEvent, duplicateEvent, undoDelete, parseNaturalLanguage,
    addReminderToForm, addCustomReminder, removeReminder,
    toggleReminderArea, toggleClearModal, executeClearAll
} from './events.js';
import { initFallingPattern } from './background.js';
import { initGoogleSignIn } from './googleAuth.js';
import { initGoogleSync, startBackgroundSync, importAllFromGoogle } from './googleCalendarSync.js';


document.addEventListener('DOMContentLoaded', () => {
    // 1. Start Background (Moved up so it always runs)
    initFallingPattern();
    try { initGoogleSignIn(); initGoogleSync(); startBackgroundSync(5 * 60 * 1000); } catch (e) { console.warn('Google init skipped', e); }
    // 2. Load Data & Initial Render
    loadFromStorage();
    renderReminders();
    renderCalendar(); // Contains try-catch now
    setupExport();

    // 3. Initialize Flatpickr
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

    // Search Listener
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            // We re-render the whole calendar to potentially highlight search results in the grid in future
            // For now, we just trigger the list update logic via calendar or events
            // Since renderEventSlots is imported in calendar.js, we rely on calendar redraw or event listeners
            // But simpler: just import renderEventSlots here if needed, OR
            // Trigger a custom event. For now, let's re-render the list logic.
            const listContainer = document.getElementById('event-slots-container');
            if (listContainer) {
                // Dynamically import to avoid circular dep issues if strict
                import('./calendar.js').then(module => module.renderEventSlots());
            }
        });
        // Natural Language Trigger on Enter
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                parseNaturalLanguage(e.target.value);
            }
        });
    }
    window.addEventListener('DOMContentLoaded', () => {
        const imp = document.getElementById('import-google');
        if (imp) imp.onclick = async () => {
            try {
                await importAllFromGoogle();
                // re-render
                import('./events.js').then(m => { m && m.renderReminders && window.renderCalendar && window.renderEventSlots && window.renderCalendar(); });
                alert('Import complete');
            } catch (e) { console.error(e); alert('Import failed'); }
        };
    });

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

    // Swipe Gestures
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

    // SW & Notifications
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(console.error);
    }
    if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
});

// Global Exports for HTML Buttons
window.toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
};
if (localStorage.getItem('theme') === 'light') document.documentElement.classList.remove('dark');

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