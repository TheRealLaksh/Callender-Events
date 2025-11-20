import { state, saveToStorage } from './state.js';
import { showMessage, getReminderDisplayText } from './utils.js';
import { renderCalendar } from './calendar.js';

// --- Reminders Logic ---
export function renderReminders() {
    const el = document.getElementById('reminders-list');
    if (!el) return;

    el.innerHTML = '';
    state.currentReminders.forEach((duration, index) => {
        const span = document.createElement('span');
        span.className = 'inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-semibold';
        span.innerHTML = `
            ${getReminderDisplayText(duration)}
            <button type="button" class="ml-1 hover:text-white transition-colors focus:outline-none" data-index="${index}">
                &times;
            </button>
        `;
        span.querySelector('button').onclick = () => removeReminder(index);
        el.appendChild(span);
    });

    const area = document.getElementById('reminder-selection-area');
    if (state.currentReminders.length > 0 && area) area.classList.add('hidden');
}

export function addReminderToForm(duration) {
    if (!state.currentReminders.includes(duration)) {
        state.currentReminders.push(duration);
        renderReminders();
        showMessage('Reminder added.', 'success');
    } else showMessage('Reminder already set.', 'error');
}

export function addCustomReminder() {
    const input = document.getElementById('custom-reminder-value');
    const unit = document.getElementById('custom-reminder-unit').value;
    const val = parseInt(input.value);
    if (val > 0) {
        addReminderToForm(unit === 'D' ? `-P${val}D` : `-PT${val}${unit}`);
        input.value = '';
    } else {
        showMessage('Please enter a valid number.', 'error');
    }
}

export function removeReminder(index) {
    state.currentReminders.splice(index, 1);
    renderReminders();
}

export function toggleReminderArea() {
    document.getElementById('reminder-selection-area')?.classList.toggle('hidden');
}

// --- Event CRUD Actions ---

export function deleteEvent(id) {
    state.events = state.events.filter(e => e.id !== id);
    if (state.editingEventId === id) resetFormState();
    saveToStorage();
    renderCalendar();
    showMessage('Event removed.');
}

export function duplicateEvent(id) {
    const original = state.events.find(e => e.id === id);
    if (!original) return;
    const newId = state.eventIdCounter++;
    state.events.push({ ...original, id: newId, name: original.name + " (Copy)", reminders: [...original.reminders] });
    saveToStorage();
    renderCalendar();
    showMessage('Event duplicated.');
}

export function editEvent(id) {
    const ev = state.events.find(e => e.id === id);
    if (!ev) return;

    document.getElementById('event-name').value = ev.name;
    document.getElementById('event-location').value = ev.location || '';
    document.getElementById('event-datetime-start').value = ev.datetimeStart;
    document.getElementById('event-datetime-end').value = ev.datetimeEnd;
    document.getElementById('event-timezone').value = ev.timezone;
    document.getElementById('event-description').value = ev.description || '';

    state.currentReminders = [...ev.reminders];
    state.editingEventId = id;
    renderReminders();

    const btn = document.getElementById('submit-btn');
    btn.innerHTML = `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Update Event`;

    document.getElementById('event-form').scrollIntoView({ behavior: 'smooth' });
}

function resetFormState() {
    state.editingEventId = null;
    document.getElementById('event-form').reset();
    state.currentReminders = [];
    renderReminders();
    const btn = document.getElementById('submit-btn');
    btn.innerHTML = `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg> Add Event`;
}

export function handleEventSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('event-name').value.trim();
    const start = document.getElementById('event-datetime-start').value;
    let end = document.getElementById('event-datetime-end').value;

    if (!name || !start) { showMessage('Name and Start Time required.', 'error'); return; }
    if (!end) end = start; // Default end to start time
    
    // Simple date validation
    if (new Date(start) > new Date(end)) { showMessage('End date cannot be before start.', 'error'); return; }

    const eventData = {
        name,
        location: document.getElementById('event-location').value.trim(),
        datetimeStart: start,
        datetimeEnd: end,
        timezone: document.getElementById('event-timezone').value,
        description: document.getElementById('event-description').value.trim(),
        reminders: [...state.currentReminders]
    };

    if (state.editingEventId !== null) {
        const idx = state.events.findIndex(ev => ev.id === state.editingEventId);
        if (idx !== -1) state.events[idx] = { ...state.events[idx], ...eventData };
        showMessage('Event updated.');
        resetFormState();
    } else {
        const newId = state.eventIdCounter++;
        state.events.push({ id: newId, ...eventData });
        showMessage('Event added.');
        document.getElementById('event-form').reset();
        state.currentReminders = [];
        renderReminders();
    }

    saveToStorage();
    renderCalendar();
}

export function toggleClearModal(show) {
    const modal = document.getElementById('confirm-clear-modal');
    if (!modal) return;
    if (show && state.events.length === 0) return showMessage('List is already empty.', 'error');

    document.getElementById('events-to-clear-count').textContent = state.events.length;
    modal.classList.toggle(show ? 'flex' : 'hidden', show);
    modal.classList.toggle('hidden', !show);
}

export function executeClearAll() {
    const count = state.events.length;
    state.events = [];
    resetFormState();
    renderCalendar();
    toggleClearModal(false);
    saveToStorage();
    showMessage(`Cleared ${count} events.`);
}

// --- Notification System (Fixed) ---
let lastCheckTime = new Date();

setInterval(() => {
    if (Notification.permission !== 'granted') return;
    
    const now = new Date();
    
    state.events.forEach(event => {
        const start = new Date(event.datetimeStart);
        
        event.reminders.forEach(reminder => {
            let triggerTime = new Date(start);
            
            // Parse ISO Duration
            if (reminder.includes('PT')) {
                const match = reminder.match(/PT(\d+)([MH])/);
                if (match) {
                    const val = parseInt(match[1]);
                    if (match[2] === 'M') triggerTime.setMinutes(start.getMinutes() - val);
                    if (match[2] === 'H') triggerTime.setHours(start.getHours() - val);
                }
            } else if (reminder.includes('P')) {
                const match = reminder.match(/P(\d+)D/);
                if (match) triggerTime.setDate(start.getDate() - parseInt(match[1]));
            }
            
            // Check if triggerTime falls between lastCheckTime and now
            // This handles missed checks due to sleep/throttling
            if (triggerTime > lastCheckTime && triggerTime <= now) {
                new Notification(`Upcoming Event: ${event.name}`, { 
                    body: `Starting at ${start.toLocaleTimeString()}`, 
                    icon: 'assets/favicon.jpg' 
                });
            }
        });
    });
    
    lastCheckTime = now; // Update last check
}, 10000); // Check every 10 seconds (more frequent is better for range checks)