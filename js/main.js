import { loadFromStorage, state } from './state.js';
import { renderCalendar, changeMonth } from './calendar.js';
import { setupExport, importICS } from './ics.js';
import {
    renderReminders, handleEventSubmit,
    editEvent, deleteEvent, duplicateEvent,
    addReminderToForm, addCustomReminder, removeReminder,
    toggleReminderArea, toggleClearModal, executeClearAll
} from './events.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Load Data & Initial Render
    loadFromStorage();
    // renderEvents() is removed; renderCalendar() now handles the view
    renderReminders();
    renderCalendar();
    setupExport();

    // 2. Event Listeners
    document.getElementById('event-form')?.addEventListener('submit', handleEventSubmit);

    document.getElementById('prev-month-btn')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month-btn')?.addEventListener('click', () => changeMonth(1));
    document.getElementById('today-btn')?.addEventListener('click', () => {
        state.currentCalendarDate = new Date();
        renderCalendar();
    });

    document.getElementById('clear-all-btn')?.addEventListener('click', () => toggleClearModal(true));
    document.getElementById('execute-clear-btn')?.addEventListener('click', executeClearAll);

    // Modal Close on 'Cancel'
    document.getElementById('cancel-clear-btn')?.addEventListener('click', () => toggleClearModal(false));

    // 3. Service Worker Registration
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker Registered', reg.scope))
            .catch(err => console.error('SW Registration Failed:', err));
    }

    // 4. Request Notification Permission
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
});

// Expose functions to Window for HTML onclick attributes
window.deleteEvent = deleteEvent;
window.duplicateEvent = duplicateEvent;
window.editEvent = editEvent;
window.addReminderToForm = addReminderToForm;
window.addCustomReminder = addCustomReminder;
window.removeReminder = removeReminder;
window.toggleReminderArea = toggleReminderArea;
window.importICS = importICS;
window.toggleClearModal = toggleClearModal;