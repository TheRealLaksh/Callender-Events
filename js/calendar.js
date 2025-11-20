import { state } from './state.js';

export function renderCalendar() {
    const year = state.currentCalendarDate.getFullYear();
    const month = state.currentCalendarDate.getMonth();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const display = document.getElementById('month-year-display');
    if (display) display.textContent = `${monthNames[month]} ${year}`;

    const calendarGrid = document.getElementById('calendar-grid');
    if (!calendarGrid) return;

    calendarGrid.innerHTML = '';

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'aspect-square';
        calendarGrid.appendChild(emptyCell);
    }

    const today = new Date();
    const selected = state.selectedDate;

    const eventDates = new Set();
    state.events.forEach(e => {
        if (e.datetimeStart) {
            eventDates.add(e.datetimeStart.split('T')[0]);
        }
    });

    for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = document.createElement('button');

        // UPDATED: text-xs instead of text-sm for a compact look
        let classes = "aspect-square flex flex-col items-center justify-center rounded-md text-xs transition-all hover:bg-slate-800 text-slate-300 relative";

        const isSelected = selected && day === selected.getDate() && month === selected.getMonth() && year === selected.getFullYear();

        if (isSelected) {
            classes += " bg-primary text-slate-900 font-bold hover:bg-primary hover:text-slate-900 shadow-md";
        }

        if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear() && !isSelected) {
            classes += " bg-slate-800 text-white font-semibold";
        }

        dayEl.className = classes;
        dayEl.textContent = day;
        dayEl.setAttribute('type', 'button');
        dayEl.setAttribute('aria-label', `${monthNames[month]} ${day}, ${year}`);

        const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        if (eventDates.has(cellDateStr)) {
            const dot = document.createElement('div');
            dot.className = `w-1 h-1 rounded-full absolute bottom-1.5 ${isSelected ? 'bg-slate-900' : 'bg-primary'}`;
            dayEl.appendChild(dot);
        }

        dayEl.onclick = () => {
            state.selectedDate = new Date(year, month, day);
            renderCalendar();
            renderEventSlots();
        };

        calendarGrid.appendChild(dayEl);
    }
    renderEventSlots();
}

export function renderEventSlots() {
    const container = document.getElementById('event-slots-container');
    const dateDisplay = document.getElementById('selected-date-display');
    if (!container || !dateDisplay) return;

    const sel = state.selectedDate;
    dateDisplay.textContent = sel.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });

    const selStr = `${sel.getFullYear()}-${String(sel.getMonth() + 1).padStart(2, '0')}-${String(sel.getDate()).padStart(2, '0')}`;
    const dayEvents = state.events.filter(e => e.datetimeStart.startsWith(selStr));

    container.innerHTML = '';

    if (dayEvents.length === 0) {
        container.innerHTML = `<div class="text-xs text-slate-500 italic py-2">No events for this day.</div>`;
        return;
    }

    dayEvents.sort((a, b) => new Date(a.datetimeStart) - new Date(b.datetimeStart));

    dayEvents.forEach(event => {
        const startTime = new Date(event.datetimeStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endTime = new Date(event.datetimeEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const slot = document.createElement('div');
        slot.className = "bg-slate-800/50 hover:bg-slate-800 relative rounded-md p-2 pl-4 text-sm transition-colors group cursor-pointer border border-transparent hover:border-slate-700 mb-2";

        const bar = document.createElement('div');
        bar.className = "absolute left-1 top-2 bottom-2 w-1 bg-primary/70 rounded-full";
        slot.appendChild(bar);

        const contentFlex = document.createElement('div');
        contentFlex.className = "flex justify-between items-start";
        slot.appendChild(contentFlex);

        const textDiv = document.createElement('div');

        const title = document.createElement('div');
        title.className = "font-medium text-white";
        title.textContent = event.name;
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

        const editBtn = document.createElement('button');
        editBtn.className = "p-1 hover:text-white text-slate-400";
        editBtn.title = "Edit";
        editBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>`;
        editBtn.onclick = (e) => { e.stopPropagation(); window.editEvent(event.id); };
        btnDiv.appendChild(editBtn);

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

export function changeMonth(offset) {
    state.currentCalendarDate.setDate(1);
    state.currentCalendarDate.setMonth(state.currentCalendarDate.getMonth() + offset);
    renderCalendar();
}