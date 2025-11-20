import { state, saveToStorage } from './state.js';

// --- Drag and Drop Logic (#5) ---
let draggedEventId = null;

function handleDragStart(e, eventId) {
    draggedEventId = eventId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', eventId);
    // Optional: set a custom drag image
}

function handleDrop(e, targetDateStr) {
    e.preventDefault();
    const ev = state.events.find(e => e.id == draggedEventId); // loose comparison for string/number IDs
    if (ev) {
        // Calculate duration to preserve it
        const startOld = new Date(ev.datetimeStart);
        const endOld = new Date(ev.datetimeEnd);
        const duration = endOld - startOld;

        // New Start: Combine target date with original time
        const timePart = ev.datetimeStart.split('T')[1] || '00:00';
        const newStart = new Date(`${targetDateStr}T${timePart}`);

        // New End
        const newEnd = new Date(newStart.getTime() + duration);

        // Update Event
        ev.datetimeStart = newStart.toISOString().slice(0, 16); // Keep YYYY-MM-DDTHH:mm
        ev.datetimeEnd = newEnd.toISOString().slice(0, 16);

        saveToStorage();
        renderCalendar();
        renderEventSlots();
    }
    draggedEventId = null;
}

// --- Calendar Rendering ---

export function renderCalendar() {
    const viewMode = state.viewMode || 'month'; // Default to month if undefined
    const calendarGrid = document.getElementById('calendar-grid');
    const display = document.getElementById('month-year-display');

    if (!calendarGrid) return;
    calendarGrid.innerHTML = '';

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    let startDate, endDate, daysToRender;
    const current = state.currentCalendarDate;

    // --- #2 View Logic: Calculate Range ---
    if (viewMode === 'week') {
        // Find Sunday of the current week
        const dayOfWeek = current.getDay(); // 0 (Sun) to 6 (Sat)
        startDate = new Date(current);
        startDate.setDate(current.getDate() - dayOfWeek);

        daysToRender = 7;
        if (display) display.textContent = `Week of ${monthNames[startDate.getMonth()]} ${startDate.getDate()}, ${startDate.getFullYear()}`;
    } else {
        // Month View
        const year = current.getFullYear();
        const month = current.getMonth();
        if (display) display.textContent = `${monthNames[month]} ${year}`;

        const firstDayIndex = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Add empty padding cells for Month view
        for (let i = 0; i < firstDayIndex; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'aspect-square'; // Placeholder
            calendarGrid.appendChild(emptyCell);
        }

        startDate = new Date(year, month, 1);
        daysToRender = daysInMonth;
    }

    const today = new Date();
    const selected = state.selectedDate;

    // Loop to create Day Cells
    for (let i = 0; i < daysToRender; i++) {
        const cellDate = new Date(startDate);
        if (viewMode === 'week') {
            cellDate.setDate(startDate.getDate() + i);
        } else {
            cellDate.setDate(startDate.getDate() + i);
        }

        const year = cellDate.getFullYear();
        const month = cellDate.getMonth();
        const day = cellDate.getDate();
        const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const dayEl = document.createElement('button');

        // Base classes
        let classes = "aspect-square flex flex-col items-start justify-start p-1 rounded-md text-xs transition-all hover:bg-slate-800 text-slate-300 relative overflow-hidden border border-transparent";

        // Highlight Selected
        const isSelected = selected && day === selected.getDate() && month === selected.getMonth() && year === selected.getFullYear();
        if (isSelected) {
            classes += " border-primary/50 bg-slate-800/50 shadow-inner";
        }

        // Highlight Today
        const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        if (isToday) {
            classes += " bg-slate-800 text-white font-bold ring-1 ring-slate-600";
        }

        dayEl.className = classes;
        dayEl.setAttribute('type', 'button');
        dayEl.setAttribute('aria-label', cellDate.toLocaleDateString());

        // #5 Drag and Drop Attributes for the CELL (Target)
        dayEl.ondragover = (e) => e.preventDefault(); // Allow drop
        dayEl.ondrop = (e) => handleDrop(e, cellDateStr);

        // Day Number
        const dateNum = document.createElement('span');
        dateNum.className = isToday ? "bg-primary text-slate-900 rounded-full w-5 h-5 flex items-center justify-center mb-1" : "mb-1 px-1";
        dateNum.textContent = day;
        dayEl.appendChild(dateNum);

        // --- #4 Multi-Day Event & #10 Icon Rendering ---
        // Check for events overlapping this specific day
        // We filter events where: (start <= cellDate) AND (end >= cellDate)
        // Note: We compare Dates by stripping time for accurate day spanning

        const dayStart = new Date(year, month, day, 0, 0, 0).getTime();
        const dayEnd = new Date(year, month, day, 23, 59, 59).getTime();

        const eventsOnDay = state.events.filter(ev => {
            const evStart = new Date(ev.datetimeStart).getTime();
            const evEnd = new Date(ev.datetimeEnd).getTime();
            return evStart <= dayEnd && evEnd >= dayStart;
        });

        // Limit dots/bars to prevent overflow
        const maxEvents = 3;
        eventsOnDay.slice(0, maxEvents).forEach(ev => {
            const dot = document.createElement('div');

            // #5 Drag Source: The event indicator is draggable
            dot.draggable = true;
            dot.ondragstart = (e) => {
                e.stopPropagation(); // Prevent button click when dragging
                handleDragStart(e, ev.id);
            };

            // Style: Dot vs Bar vs Icon
            // If it's a long event, we make it look like a bar
            let bgClass = 'bg-primary';

            // #3 Categories (basic implementation if color property exists)
            if (ev.category === 'Work') bgClass = 'bg-blue-400';
            if (ev.category === 'Personal') bgClass = 'bg-emerald-400';
            if (ev.category === 'Urgent') bgClass = 'bg-red-400';

            dot.className = `w-full h-1.5 rounded-full mb-1 cursor-grab active:cursor-grabbing ${bgClass} opacity-80 hover:opacity-100`;

            // #10 Event Icons (Optional: if ev.icon exists)
            if (ev.icon) {
                dot.className = "text-[10px] leading-none mb-0.5 cursor-grab";
                dot.textContent = ev.icon; // e.g. "🎂"
                dot.style.backgroundColor = 'transparent';
            }

            dayEl.appendChild(dot);
        });

        if (eventsOnDay.length > maxEvents) {
            const more = document.createElement('div');
            more.className = "text-[8px] text-slate-500 pl-1";
            more.textContent = `+${eventsOnDay.length - maxEvents} more`;
            dayEl.appendChild(more);
        }

        dayEl.onclick = () => {
            state.selectedDate = new Date(year, month, day);
            renderCalendar(); // Re-render to show selection highlight
            renderEventSlots();
        };

        calendarGrid.appendChild(dayEl);
    }

    renderEventSlots();
}

// --- Event List Rendering ---

export function renderEventSlots() {
    const container = document.getElementById('event-slots-container');
    const dateDisplay = document.getElementById('selected-date-display');
    if (!container || !dateDisplay) return;

    // #8 Search Filter
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    const sel = state.selectedDate;
    dateDisplay.textContent = sel.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });

    // Filter events for this specific day
    const selStart = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate(), 0, 0, 0).getTime();
    const selEnd = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate(), 23, 59, 59).getTime();

    let dayEvents = state.events.filter(e => {
        const evStart = new Date(e.datetimeStart).getTime();
        const evEnd = new Date(e.datetimeEnd).getTime();
        return evStart <= selEnd && evEnd >= selStart;
    });

    // Apply Search Filter
    if (searchTerm) {
        dayEvents = dayEvents.filter(e =>
            e.name.toLowerCase().includes(searchTerm) ||
            (e.description && e.description.toLowerCase().includes(searchTerm))
        );
    }

    container.innerHTML = '';

    if (dayEvents.length === 0) {
        container.innerHTML = `<div class="text-xs text-slate-500 italic py-2">${searchTerm ? 'No matching events.' : 'No events for this day.'}</div>`;
        return;
    }

    dayEvents.sort((a, b) => new Date(a.datetimeStart) - new Date(b.datetimeStart));

    dayEvents.forEach(event => {
        const startTime = new Date(event.datetimeStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endTime = new Date(event.datetimeEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const slot = document.createElement('div');
        slot.className = "bg-slate-800/50 hover:bg-slate-800 relative rounded-md p-2 pl-4 text-sm transition-colors group cursor-pointer border border-transparent hover:border-slate-700 mb-2 animate-fade-in";

        // Color bar based on category or default
        let barColor = 'bg-primary/70';
        if (event.category === 'Work') barColor = 'bg-blue-400/70';
        if (event.category === 'Personal') barColor = 'bg-emerald-400/70';

        const bar = document.createElement('div');
        bar.className = `absolute left-1 top-2 bottom-2 w-1 ${barColor} rounded-full`;
        slot.appendChild(bar);

        const contentFlex = document.createElement('div');
        contentFlex.className = "flex justify-between items-start";
        slot.appendChild(contentFlex);

        const textDiv = document.createElement('div');

        const title = document.createElement('div');
        title.className = "font-medium text-white flex items-center gap-2";
        // #10 Icon in List
        title.innerHTML = `${event.icon ? event.icon + ' ' : ''}${event.name}`;
        textDiv.appendChild(title);

        const time = document.createElement('div');
        time.className = "text-slate-400 text-xs";
        time.textContent = `${startTime} - ${endTime}`;
        textDiv.appendChild(time);

        if (event.location) {
            const loc = document.createElement('div');
            loc.className = "text-indigo-400 text-[10px] mt-0.5 truncate max-w-[150px]";
            loc.textContent = `📍 ${event.location}`;
            textDiv.appendChild(loc);
        }
        contentFlex.appendChild(textDiv);

        const btnDiv = document.createElement('div');
        btnDiv.className = "opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity";

        // Edit Button
        const editBtn = document.createElement('button');
        editBtn.className = "p-1 hover:text-white text-slate-400";
        editBtn.title = "Edit";
        editBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>`;
        editBtn.onclick = (e) => { e.stopPropagation(); window.editEvent(event.id); };
        btnDiv.appendChild(editBtn);

        // Duplicate Button
        const dupBtn = document.createElement('button');
        dupBtn.className = "p-1 hover:text-primary text-slate-400";
        dupBtn.title = "Duplicate";
        dupBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>`;
        dupBtn.onclick = (e) => { e.stopPropagation(); window.duplicateEvent(event.id); };
        btnDiv.appendChild(dupBtn);

        // Delete Button
        const delBtn = document.createElement('button');
        delBtn.className = "p-1 hover:text-red-400 text-slate-400";
        delBtn.title = "Delete";
        delBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`;
        delBtn.onclick = (e) => { e.stopPropagation(); window.deleteEvent(event.id); };
        btnDiv.appendChild(delBtn);

        contentFlex.appendChild(btnDiv);
        container.appendChild(slot);
    });
}

// --- Navigation ---

export function changeMonth(offset) {
    const viewMode = state.viewMode || 'month';
    if (viewMode === 'week') {
        // #2 Week Navigation: Jump 7 days
        state.currentCalendarDate.setDate(state.currentCalendarDate.getDate() + (offset * 7));
        // Also update selected date to keep it in view
        state.selectedDate = new Date(state.currentCalendarDate);
    } else {
        // Month Navigation
        state.currentCalendarDate.setDate(1);
        state.currentCalendarDate.setMonth(state.currentCalendarDate.getMonth() + offset);
    }
    renderCalendar();
    renderEventSlots(); // Ensure slots update if selected date changes context
}

// Helper to switch views (called from index.html)
export function changeView(mode) {
    state.viewMode = mode;
    // Reset current date to selected date to ensure we view the right context
    state.currentCalendarDate = new Date(state.selectedDate);
    renderCalendar();
}