import { state, saveToStorage } from './state.js';
import { generateUniqueId, showMessage } from './utils.js';
import { IST_VTIMEZONE } from './config.js';
import { renderEvents } from './events.js';
import { renderCalendar } from './calendar.js';

function formatICSDateTZ(isoString, tzid) {
    if (!isoString) return '';
    const formattedDate = isoString.slice(0, 16).replace(/[-:]/g, '').replace('T', 'T') + '00';
    return `TZID=${tzid}:${formattedDate}`;
}

function createAlarmBlock(reminderValue) {
    const now = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', 'T') + 'Z';
    return [
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 
        `TRIGGER:${reminderValue}`, `UID:${generateUniqueId()}-alarm`, `DTSTAMP:${now}`, 'END:VALARM'
    ].join('\r\n');
}

function formatICSDateToISO(icsDate) {
    if (icsDate.includes('T')) {
        return icsDate.substring(0, 4) + '-' + icsDate.substring(4, 6) + '-' + icsDate.substring(6, 8) + 'T' + icsDate.substring(9, 11) + ':' + icsDate.substring(11, 13);
    }
    return icsDate.substring(0, 4) + '-' + icsDate.substring(4, 6) + '-' + icsDate.substring(6, 8) + 'T00:00';
}

// Fix: Helper to get local ISO string (YYYY-MM-DDTHH:MM) without UTC shift
function toLocalISOString(date) {
    const pad = (num) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseICS(icsContent) {
    const lines = icsContent.split(/\r\n|\n|\r/).map(line => line.trim());
    const importedEvents = [];
    let currentEvent = null;

    lines.forEach(line => {
        if (line.startsWith('BEGIN:VEVENT')) {
            currentEvent = { name: 'Untitled', timezone: 'Asia/Kolkata', reminders: [] };
        } else if (line.startsWith('END:VEVENT') && currentEvent) {
            if (currentEvent.datetimeStart) {
                if (!currentEvent.datetimeEnd) {
                    // Fix: Use Local ISO string to prevent Timezone shift
                    const start = new Date(currentEvent.datetimeStart);
                    const end = new Date(start.getTime() + 3600000); // Add 1 hour
                    currentEvent.datetimeEnd = toLocalISOString(end);
                }
                importedEvents.push(currentEvent);
            }
            currentEvent = null;
        } else if (currentEvent) {
            const [key, ...rest] = line.split(':');
            const value = rest.join(':');
            if (key.startsWith('SUMMARY')) currentEvent.name = value.replace(/\\n/g, '\n');
            else if (key.startsWith('DESCRIPTION')) currentEvent.description = value.replace(/\\n/g, '\n');
            else if (key.startsWith('LOCATION')) currentEvent.location = value.replace(/\\n/g, '\n');
            else if (key.startsWith('DTSTART')) {
                const tzid = key.match(/TZID=([^;,\r\n]+)/);
                if (tzid) currentEvent.timezone = tzid[1];
                const val = value.match(/(\d{8}T\d{6}|\d{8})/);
                if (val) currentEvent.datetimeStart = formatICSDateToISO(val[0]);
            } else if (key.startsWith('DTEND')) {
                 const val = value.match(/(\d{8}T\d{6}|\d{8})/);
                 if (val) currentEvent.datetimeEnd = formatICSDateToISO(val[0]);
            } else if (line.startsWith('TRIGGER')) {
                 const tr = line.match(/TRIGGER:(-P[0-9]+[DTWHMS])/);
                 if (tr && !currentEvent.reminders.includes(tr[1])) currentEvent.reminders.push(tr[1]);
            }
        }
    });
    return importedEvents;
}

export function importICS(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const imported = parseICS(e.target.result);
            if (imported.length === 0) { showMessage('No events found.', 'error'); return; }
            imported.forEach(ev => { state.events.push({ ...ev, id: state.eventIdCounter++ }); });
            saveToStorage(); renderEvents(); renderCalendar();
            showMessage(`Imported ${imported.length} events!`, 'success');
        } catch (error) { showMessage('Failed to parse file.', 'error'); }
        event.target.value = '';
    };
    reader.readAsText(file);
}

export function setupExport() {
    const btn = document.getElementById('export-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        if (state.events.length === 0) { showMessage('No events to export.', 'error'); return; }
        let fileName = document.getElementById('export-file-name').value.trim() || 'Calibridge_Export';
        if (!fileName.endsWith('.ics')) fileName += '.ics';

        const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Calibridge//EN', 'CALSCALE:GREGORIAN', IST_VTIMEZONE];
        const now = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', 'T') + 'Z';

        state.events.forEach(e => {
            const tzid = e.timezone || 'Asia/Kolkata';
            // Fix: Escape newlines for valid ICS format
            const desc = (e.description || '').replace(/\n/g, '\\n');
            
            lines.push('BEGIN:VEVENT', `UID:${generateUniqueId()}`, `DTSTAMP:${now}`,
                `DTSTART;${formatICSDateTZ(e.datetimeStart, tzid)}`, `DTEND;${formatICSDateTZ(e.datetimeEnd, tzid)}`,
                `SUMMARY:${e.name}`, `LOCATION:${e.location || ''}`, `DESCRIPTION:${desc}`);
            e.reminders.forEach(r => lines.push(createAlarmBlock(r)));
            lines.push('END:VEVENT');
        });
        lines.push('END:VCALENDAR');
        
        const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        showMessage(`Exported to ${fileName}!`, 'success');
    });
}