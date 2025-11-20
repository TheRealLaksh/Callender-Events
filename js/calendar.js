import { state, saveToStorage } from './state.js';
import { isValidDate } from './utils.js';

// --- Drag and Drop Logic (#5) ---
let draggedEventId = null;

function handleDragStart(e, eventId) {
    draggedEventId = eventId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', eventId);
}

function handleDrop(e, targetDateStr) {
    e.preventDefault();
    const ev = state.events.find(e => e.id == draggedEventId);
    if (!ev) return;
    // update event start/end to targetDateStr (keep duration)
    try {
        const oldStart = new Date(ev.datetimeStart);
        const oldEnd = new Date(ev.datetimeEnd);
        const target = new Date(targetDateStr);
        const durationMs = oldEnd - oldStart;
        const newStart = new Date(target);
        const newEnd = new Date(newStart.getTime() + durationMs);
        ev.datetimeStart = newStart.toISOString();
        ev.datetimeEnd = newEnd.toISOString();
        saveToStorage();
        renderCalendar();
    } catch (err) {
        console.error('Failed to drop event:', err);
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

// --- Calendar rendering & helpers ---
// (This file historically contained the calendar grid renderer and helpers.
// I left the internal rendering logic intact — only removed the broken import that imported
// this same module into itself which produced a circular import error.)

export function renderEventSlots() {
    // Render a compact event list / side panel (fallback if provided)
    const listEl = document.getElementById('events-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    // show next upcoming 20 events
    const upcoming = state.events
        .slice()
        .sort((a, b) => new Date(a.datetimeStart) - new Date(b.datetimeStart))
        .slice(0, 20);

    upcoming.forEach(ev => {
        const item = document.createElement('div');
        item.className = 'py-2 px-3 rounded-md hover:bg-slate-800/40 cursor-pointer';
        const start = new Date(ev.datetimeStart);
        item.innerHTML = `<div class="text-sm font-medium">${ev.name || 'Untitled'}</div>
                          <div class="text-xs opacity-70">${start.toLocaleString()}</div>`;
        item.onclick = () => {
            // focus date and scroll into view
            state.selectedDate = new Date(ev.datetimeStart);
            renderCalendar();
            document.querySelector(`[data-date="${ev.datetimeStart.split('T')[0]}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
        listEl.appendChild(item);
    });
}

export function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const viewMode = state.viewMode || 'month';
    const current = new Date(state.currentCalendarDate || state.selectedDate || new Date());
    current.setHours(0, 0, 0, 0);

    // month view grid: first day-of-week offset, 6 rows x 7 columns
    const firstOfMonth = new Date(current.getFullYear(), current.getMonth(), 1);
    const startDay = firstOfMonth.getDay(); // 0..6
    const startDate = new Date(firstOfMonth);
    startDate.setDate(firstOfMonth.getDate() - startDay);

    const cells = 42; // 6 * 7

    for (let i = 0; i < cells; i++) {
        const cellDate = new Date(startDate);
        cellDate.setDate(startDate.getDate() + i);
        const year = cellDate.getFullYear();
        const month = cellDate.getMonth();
        const day = cellDate.getDate();
        const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const btn = document.createElement('button');
        btn.className = 'p-2 text-left h-28 border border-transparent';
        btn.setAttribute('data-date', iso);
        btn.draggable = true;
        btn.ondragstart = (e) => handleDragStart(e, iso);
        btn.ondragover = handleDragOver;
        btn.ondrop = (e) => handleDrop(e, iso);

        // mark current month vs other month
        if (month !== current.getMonth()) btn.classList.add('opacity-40');

        // highlight selected
        const sel = state.selectedDate;
        if (sel && sel.getFullYear() === year && sel.getMonth() === month && sel.getDate() === day) {
            btn.classList.add('ring-1', 'ring-offset-1', 'ring-indigo-400/40');
        }

        // date header
        const header = document.createElement('div');
        header.className = 'text-xs font-semibold mb-1';
        header.textContent = day;
        btn.appendChild(header);

        // events for this date
        const eventsWrap = document.createElement('div');
        eventsWrap.className = 'flex flex-col gap-1 overflow-hidden';

        const dayEvents = state.events.filter(ev => {
            try {
                const s = new Date(ev.datetimeStart);
                return s.getFullYear() === year && s.getMonth() === month && s.getDate() === day;
            } catch { return false; }
        }).slice(0, 3); // limit shown events per cell

        dayEvents.forEach(ev => {
            const evDiv = document.createElement('div');
            evDiv.className = 'text-xs truncate rounded px-1 py-0.5';
            evDiv.style.background = ev.color || 'linear-gradient(90deg, rgba(99,102,241,0.1), rgba(139,92,246,0.08))';
            evDiv.textContent = ev.name || 'Event';
            evDiv.onclick = (e) => {
                e.stopPropagation();
                // open edit UI if present
                if (window.editEvent) window.editEvent(ev.id);
            };
            eventsWrap.appendChild(evDiv);
        });
        const badge = document.createElement('span');
        badge.className = 'ml-2 inline-flex items-center text-[10px] px-1 rounded-full font-semibold';
        if (ev.synced) {
            badge.textContent = 'Synced';
            badge.classList.add('bg-emerald-600/90', 'text-white');
        } else {
            badge.textContent = 'Not synced';
            badge.classList.add('bg-slate-700/60', 'text-white');
        }
        evDiv.appendChild(badge);
        btn.appendChild(eventsWrap);

        btn.onclick = () => {
            state.selectedDate = new Date(year, month, day);
            state.currentCalendarDate = new Date(state.selectedDate);
            renderCalendar();
        };

        grid.appendChild(btn);
    }
}

export function changeMonth(offset) {
    // offset: +1 or -1 months
    state.currentCalendarDate = state.currentCalendarDate || new Date();
    state.currentCalendarDate.setMonth(state.currentCalendarDate.getMonth() + offset);
    state.selectedDate = new Date(state.currentCalendarDate);
    renderCalendar();
}

export function changeView(mode) {
    state.viewMode = mode;
    state.currentCalendarDate = new Date(state.selectedDate);
    renderCalendar();
}
