import { loadFromStorage, state } from './state.js';
import { renderCalendar, changeMonth } from './calendar.js';
import { setupExport, importICS } from './ics.js';
import { 
    renderEvents, renderReminders, handleEventSubmit, 
    editEvent, deleteEvent, duplicateEvent, 
    addReminderToForm, addCustomReminder, removeReminder, toggleReminderArea, toggleClearModal 
} from './events.js';
import { showMessage } from './utils.js';

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    loadFromStorage();
    renderEvents();
    renderReminders();
    renderCalendar();
    setupExport();

    // Event Listeners
    document.getElementById('event-form')?.addEventListener('submit', handleEventSubmit);
    
    document.getElementById('prev-month-btn')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month-btn')?.addEventListener('click', () => changeMonth(1));
    document.getElementById('today-btn')?.addEventListener('click', () => {
        state.currentCalendarDate = new Date();
        renderCalendar();
    });

    document.getElementById('clear-all-btn')?.addEventListener('click', () => toggleClearModal(true));
    document.getElementById('execute-clear-btn')?.addEventListener('click', () => {
        const count = state.events.length;
        state.events = [];
        renderEvents(); renderCalendar();
        toggleClearModal(false);
        localStorage.setItem('calibridge_events', JSON.stringify([]));
        showMessage(`Cleared ${count} events.`);
    });
});

// --- EXPOSE FUNCTIONS TO HTML (window) ---
// Required because onclick="..." in HTML cannot see inside Modules
window.deleteEvent = deleteEvent;
window.duplicateEvent = duplicateEvent;
window.editEvent = editEvent;
window.addReminderToForm = addReminderToForm;
window.addCustomReminder = addCustomReminder;
window.removeReminder = removeReminder;
window.toggleReminderArea = toggleReminderArea;
window.importICS = importICS;
window.toggleClearModal = toggleClearModal;