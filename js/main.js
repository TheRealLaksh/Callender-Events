import { loadFromStorage, state } from './state.js';
import { renderCalendar, changeMonth, renderEventSlots } from './calendar.js';
import { setupExport, importICS } from './ics.js';
import { 
    renderReminders, handleEventSubmit, 
    editEvent, deleteEvent, duplicateEvent, 
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
    
    // 2. Initialize Flatpickr (New Date Picker)
    // altFormat displays friendly date to user
    // dateFormat sends ISO-like string (YYYY-MM-DDTHH:mm) to internal value, compatible with your existing logic
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

window.deleteEvent = deleteEvent;
window.duplicateEvent = duplicateEvent;
window.editEvent = editEvent;
window.addReminderToForm = addReminderToForm;
window.addCustomReminder = addCustomReminder;
window.removeReminder = removeReminder;
window.toggleReminderArea = toggleReminderArea;
window.importICS = importICS;
window.toggleClearModal = toggleClearModal;