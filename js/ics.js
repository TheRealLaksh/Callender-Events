import { state, saveToStorage } from './state.js';
import { generateUniqueId, showMessage } from './utils.js';
import { IST_VTIMEZONE } from './config.js';
import { renderCalendar } from './calendar.js'; 

function formatICSDateTZ(isoString, tzid) {
    if (!isoString) return '';
    // Remove - : and . and milliseconds if present
    // ISO: 2023-10-10T10:00:00.000 -> ICS: 20231010T100000
    let clean = isoString.replace(/[-:]/g, '').split('.')[0];
    if (!clean.includes('T')) clean += 'T000000';
    return `TZID=${tzid}:${clean}`;
}

function createAlarmBlock(reminderValue) {
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    return [
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 
        `TRIGGER:${reminderValue}`, `UID:${generateUniqueId()}-alarm`, `DTSTAMP:${now}`, 'END:VALARM'
    ].join('\r\n');
}

function formatICSDateToISO(icsDate) {
    // Handle "20231010T100000" -> "2023-10-10T10:00"
    if (icsDate.length >= 13 && icsDate.includes('T')) {
        return icsDate.substring(0, 4) + '-' + icsDate.substring(4, 6) + '-' + icsDate.substring(6, 8) + 'T' + icsDate.substring(9, 11) + ':' + icsDate.substring(11, 13);
    }
    // Handle "20231010" -> "2023-10-10T00:00"
    if (icsDate.length === 8) {
        return icsDate.substring(0, 4) + '-' + icsDate.substring(4, 6) + '-' + icsDate.substring(6, 8) + 'T00:00';
    }
    return icsDate; // Fallback
}

// Fix: Handle RFC 5545 Line Folding (CRLF + Space or Tab)
function unfoldICSLines(content) {
    return content.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r\n|\n|\r/);
}

function parseICS(icsContent) {
    const lines = unfoldICSLines(icsContent).map(line => line.trim());
    const importedEvents = [];
    let currentEvent = null;

    lines.forEach(line => {
        if (line.startsWith('BEGIN:VEVENT')) {
            currentEvent = { name: 'Untitled', timezone: 'Asia/Kolkata', reminders: [] };
        } else if (line.startsWith('END:VEVENT') && currentEvent) {
            if (currentEvent.datetimeStart) {
                // Default end time if missing
                if (!currentEvent.datetimeEnd) {
                    const start = new Date(currentEvent.datetimeStart);
                    const end = new Date(start.getTime() + 3600000); // +1 Hour
                    currentEvent.datetimeEnd = end.toISOString().substring(0, 16);
                }
                importedEvents.push(currentEvent);
            }
            currentEvent = null;
        } else if (currentEvent) {
            const firstColonIndex = line.indexOf(':');
            if (firstColonIndex === -1) return;
            
            // Handle params like DTSTART;TZID=...:2023...
            const keyFull = line.substring(0, firstColonIndex);
            const value = line.substring(firstColonIndex + 1);
            
            const keyPart = keyFull.split(';')[0];

            if (keyPart === 'SUMMARY') currentEvent.name = value.replace(/\\n/g, '\n');
            else if (keyPart === 'DESCRIPTION') currentEvent.description = value.replace(/\\n/g, '\n');
            else if (keyPart === 'LOCATION') currentEvent.location = value.replace(/\\n/g, '\n');
            else if (keyPart === 'DTSTART') {
                const tzid = keyFull.match(/TZID=([^;:]+)/);
                if (tzid) currentEvent.timezone = tzid[1];
                // Improved regex to capture basic date formats
                const val = value.match(/(\d{8}T\d{6}|\d{8})/);
                if (val) currentEvent.datetimeStart = formatICSDateToISO(val[0]);
            } else if (keyPart === 'DTEND') {
                 const val = value.match(/(\d{8}T\d{6}|\d{8})/);
                 if (val) currentEvent.datetimeEnd = formatICSDateToISO(val[0]);
            } else if (keyPart === 'TRIGGER') {
                 // Capture ISO8601 duration
                 const tr = line.match(/(P[0-9]+[DTWHMS].*)/);
                 // Note: ICS triggers might not match our specific subset, but we try
                 // standard is TRIGGER:-PT5M or TRIGGER;RELATED=START:-PT5M
                 // We look for the P... part
                 const durMatch = value.match(/(-?P[\d\w]+)/);
                 if (durMatch && !currentEvent.reminders.includes(durMatch[0])) {
                     currentEvent.reminders.push(durMatch[0]);
                 }
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
            saveToStorage(); 
            renderCalendar(); // Correct function call
            showMessage(`Imported ${imported.length} events!`, 'success');
        } catch (error) { 
            console.error(error);
            showMessage('Failed to parse file.', 'error'); 
        }
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
        const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

        state.events.forEach(e => {
            const tzid = e.timezone || 'Asia/Kolkata';
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