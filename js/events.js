import { state, saveToStorage } from './state.js';
import { showMessage, getReminderDisplayText } from './utils.js';
import { renderCalendar } from './calendar.js';

// --- Reminders ---
export function renderReminders() {
    const el = document.getElementById('reminders-list');
    if (!el) return;

    el.innerHTML = '';
    state.currentReminders.forEach((duration, index) => {
        const span = document.createElement('span');
        // Tailwind Badge Style
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

// ... (Keep addReminderToForm, addCustomReminder, removeReminder, toggleReminderArea as they are in your current logic) ...
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


// --- Events ---
export function renderEvents(newItemId = null) {
    const list = document.getElementById('event-list');
    const count = document.getElementById('event-count');
    const empty = document.getElementById('empty-state');

    if (state.events.length === 0) {
        list.innerHTML = '';
        empty?.classList.remove('hidden');
        if (count) count.textContent = '0';
        return;
    }
    empty?.classList.add('hidden');
    if (count) count.textContent = state.events.length;

    state.events.sort((a, b) => new Date(a.datetimeStart) - new Date(b.datetimeStart));

    list.innerHTML = '';

    state.events.forEach(e => {
        const start = new Date(e.datetimeStart);
        const end = new Date(e.datetimeEnd);
        const dateStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const timeStr = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

        const item = document.createElement('div');

        // Tailwind Card Style with Hover Actions
        const animationClass = newItemId === e.id ? 'animate-fade-in' : '';
        item.className = `group relative bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 rounded-2xl p-4 transition-all duration-200 ${animationClass}`;

        // Construct inner HTML
        let locationHTML = e.location ? `<div class="flex items-center gap-1.5 text-xs text-indigo-400 mt-2 font-medium"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> ${e.location}</div>` : '';

        item.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex-grow pr-12">
                    <h4 class="text-lg font-bold text-white leading-tight mb-1 event-name"></h4>
                    <div class="flex items-center gap-2 text-sm text-slate-400 font-mono">
                        <span>${dateStr}</span>
                        <span class="w-1 h-1 bg-slate-600 rounded-full"></span>
                        <span>${timeStr}</span>
                    </div>
                    ${locationHTML}
                </div>
                
                <div class="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200">
                     <button class="btn-edit p-2 bg-slate-700 hover:bg-primary text-slate-300 hover:text-white rounded-lg transition-colors" title="Edit">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                     </button>
                     <button class="btn-copy p-2 bg-slate-700 hover:bg-secondary text-slate-300 hover:text-white rounded-lg transition-colors" title="Duplicate">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                     </button>
                     <button class="btn-del p-2 bg-slate-700 hover:bg-red-500 text-slate-300 hover:text-white rounded-lg transition-colors" title="Delete">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                     </button>
                </div>
            </div>`;

        // Safe text injection
        item.querySelector('.event-name').textContent = e.name;

        item.querySelector('.btn-edit').onclick = () => editEvent(e.id);
        item.querySelector('.btn-copy').onclick = () => duplicateEvent(e.id);
        item.querySelector('.btn-del').onclick = () => deleteEvent(e.id);

        list.appendChild(item);
    });
}

// ... (Keep deleteEvent, duplicateEvent, editEvent, resetFormState, handleEventSubmit, toggleClearModal, executeClearAll, and the setInterval logic EXACTLY AS THEY ARE. They don't generate HTML.) ...

export function deleteEvent(id) {
    state.events = state.events.filter(e => e.id !== id);
    if (state.editingEventId === id) resetFormState();
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
    btn.innerHTML = `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Update Event`;
    // Change button visual state via classes isn't strictly necessary if we reuse the main class, 
    // but you can add specific styling here if desired.
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
    if (!end) end = start;
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
    modal.classList.toggle(show ? 'flex' : 'hidden', show);
    modal.classList.toggle('hidden', !show);
}

export function executeClearAll() {
    const count = state.events.length;
    state.events = [];
    resetFormState();
    renderEvents(); renderCalendar();
    toggleClearModal(false);
    saveToStorage();
    showMessage(`Cleared ${count} events.`);
}

// Notification Checker
setInterval(() => {
    if (Notification.permission !== 'granted') return;
    const now = new Date();
    state.events.forEach(event => {
        const start = new Date(event.datetimeStart);
        event.reminders.forEach(reminder => {
            let triggerTime = new Date(start);
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
            if (now.getFullYear() === triggerTime.getFullYear() &&
                now.getMonth() === triggerTime.getMonth() &&
                now.getDate() === triggerTime.getDate() &&
                now.getHours() === triggerTime.getHours() &&
                now.getMinutes() === triggerTime.getMinutes()) {
                new Notification(`Upcoming Event: ${event.name}`, { body: `Starting at ${start.toLocaleTimeString()}`, icon: 'assets/favicon.jpg' });
            }
        });
    });
}, 60000);