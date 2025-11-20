import { loadFromStorage, state } from './state.js';
import { renderCalendar, changeMonth } from './calendar.js';
import { setupExport, importICS } from './ics.js';
import { 
    renderEvents, renderReminders, handleEventSubmit, 
    editEvent, deleteEvent, duplicateEvent, 
    addReminderToForm, addCustomReminder, removeReminder, 
    toggleReminderArea, toggleClearModal, executeClearAll 
} from './events.js';
import { showMessage } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    loadFromStorage();
    renderEvents();
    renderReminders();
    renderCalendar();
    setupExport();

    document.getElementById('event-form')?.addEventListener('submit', handleEventSubmit);
    
    document.getElementById('prev-month-btn')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month-btn')?.addEventListener('click', () => changeMonth(1));
    document.getElementById('today-btn')?.addEventListener('click', () => {
        state.currentCalendarDate = new Date();
        renderCalendar();
    });

    document.getElementById('clear-all-btn')?.addEventListener('click', () => toggleClearModal(true));
    // Update: Use the dedicated execute function from events.js
    document.getElementById('execute-clear-btn')?.addEventListener('click', executeClearAll);
});

// Expose to Window
window.deleteEvent = deleteEvent;
window.duplicateEvent = duplicateEvent;
window.editEvent = editEvent;
window.addReminderToForm = addReminderToForm;
window.addCustomReminder = addCustomReminder;
window.removeReminder = removeReminder;
window.toggleReminderArea = toggleReminderArea;
window.importICS = importICS;
window.toggleClearModal = toggleClearModal;