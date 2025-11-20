import { state, saveToStorage } from './state.js';
import { showMessage, getReminderDisplayText } from './utils.js';
import { renderCalendar } from './calendar.js';

// --- Reminders ---
export function renderReminders() {
    const el = document.getElementById('reminders-list');
    if (!el) return;
    
    // Secure rendering
    el.innerHTML = '';
    state.currentReminders.forEach((duration, index) => {
        const span = document.createElement('span');
        span.className = 'inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-medium';
        span.innerHTML = `
            ${getReminderDisplayText(duration)} Before
            <button type="button" class="ml-1 text-emerald-300 hover:text-white" data-index="${index}">×</button>
        `;
        // Add listener programmatically
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
    const val = parseInt(input.value); // Fix: Ensure integer

    if (val > 0) {
        addReminderToForm(unit === 'D' ? `-P${val}D` : `-PT${val}${unit}`);
        input.value = '';
    } else {
        showMessage('Please enter a valid positive number.', 'error');
    }
}

export function removeReminder(index) {
    state.currentReminders.splice(index, 1);
    renderReminders();
}

export function toggleReminderArea() {
    document.getElementById('reminder-selection-area')?.classList.toggle('hidden');
}

// --- Events ---
export function renderEvents(newItemId = null) {
    const list = document.getElementById('event-list');
    const count = document.getElementById('event-count');
    const empty = document.getElementById('empty-state');

    if (state.events.length === 0) {
        list.innerHTML = ''; 
        empty?.classList.remove('hidden'); 
        if(count) count.textContent = '0';
        return;
    }
    empty?.classList.add('hidden');
    if(count) count.textContent = state.events.length;

    state.events.sort((a, b) => new Date(a.datetimeStart) - new Date(b.datetimeStart));

    list.innerHTML = '';
    
    state.events.forEach(e => {
        const start = new Date(e.datetimeStart);
        const end = new Date(e.datetimeEnd);
        const dateStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = `${start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - ${end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
        
        const item = document.createElement('div');
        item.className = `event-item group ${newItemId === e.id ? 'event-enter-active' : ''}`;
        
        // Fix: Use textContent for Name and Location to prevent XSS
        // We construct HTML string for structure but inject unsafe data safely
        item.innerHTML = `
            <div class="flex-grow pr-4">
                <p class="text-lg font-bold text-white event-name"></p>
                <p class="text-sm text-slate-400">${dateStr}, ${timeStr}</p>
                <p class="text-xs text-indigo-400 event-location"></p>
            </div>
            <div class="flex space-x-2 opacity-0 group-hover:opacity-100 transition items-center">
                 <button class="text-indigo-400 hover:bg-indigo-500/20 p-2 rounded btn-edit">Edit</button>
                 <button class="text-blue-400 hover:bg-blue-500/20 p-2 rounded btn-copy">Copy</button>
                 <button class="text-red-400 hover:bg-red-500/20 p-2 rounded btn-del">Del</button>
            </div>`;

        item.querySelector('.event-name').textContent = e.name;
        if (e.location) {
            item.querySelector('.event-location').textContent = `📍 ${e.location}`;
        }

        item.querySelector('.btn-edit').onclick = () => editEvent(e.id);
        item.querySelector('.btn-copy').onclick = () => duplicateEvent(e.id);
        item.querySelector('.btn-del').onclick = () => deleteEvent(e.id);

        list.appendChild(item);
    });
}

export function deleteEvent(id) {
    state.events = state.events.filter(e => e.id !== id);
    // Fix: If deleting the event currently being edited, reset form
    if (state.editingEventId === id) {
        resetFormState();
    }
    saveToStorage(); renderEvents(); renderCalendar();
    showMessage('Event removed.');
}

export function duplicateEvent(id) {
    const original = state.events.find(e => e.id === id);
    if (!original) return;
    const newId = state.eventIdCounter++;
    state.events.push({ ...original, id: newId, name: original.name + " (Copy)", reminders: [...original.reminders] });
    saveToStorage(); renderEvents(newId); renderCalendar();
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
    btn.innerHTML = 'Update Event';
    btn.classList.replace('btn-primary', 'btn-secondary');
    document.getElementById('event-form').scrollIntoView({ behavior: 'smooth' });
}

function resetFormState() {
    state.editingEventId = null;
    document.getElementById('event-form').reset();
    state.currentReminders = [];
    renderReminders();
    const btn = document.getElementById('submit-btn');
    btn.innerHTML = 'Add Event';
    btn.classList.replace('btn-secondary', 'btn-primary');
}

export function handleEventSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('event-name').value.trim();
    const start = document.getElementById('event-datetime-start').value;
    let end = document.getElementById('event-datetime-end').value;
    
    if (!name || !start) { showMessage('Name and Start Time required.', 'error'); return; }
    
    if (!end) end = start;
    // Fix: Date comparison safety
    else if (new Date(start) > new Date(end)) { showMessage('End date cannot be before start.', 'error'); return; }

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
    
    saveToStorage(); renderEvents(); renderCalendar();
}

export function toggleClearModal(show) {
    const modal = document.getElementById('confirm-clear-modal');
    if (!modal) return;
    if (show && state.events.length === 0) return showMessage('List is already empty.', 'error');
    
    document.getElementById('events-to-clear-count').textContent = state.events.length;
    modal.classList.toggle('hidden', !show);
}

export function executeClearAll() {
    const count = state.events.length;
    state.events = [];
    resetFormState(); // Fix: Ensure edit mode is exited
    renderEvents(); renderCalendar();
    toggleClearModal(false);
    saveToStorage();
    showMessage(`Cleared ${count} events.`);
}