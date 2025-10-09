// --------------------------------------
// --- CALIBRIDGE APPLICATION LOGIC ---
// --------------------------------------

// --- Global State and Counters ---
let events = [];
let eventIdCounter = 1; 
let currentReminders = []; // Reminders for the currently active form input

// --- Constants and Mapping ---

// Duration mapping for display (ISO 8601 to readable text)
const durationMap = {
    '-PT5M': '5 Min',
    '-PT15M': '15 Min',
    '-PT30M': '30 Min',
    '-PT1H': '1 Hour',
    '-PT2H': '2 Hours',
    '-P1D': '1 Day',
    '-P2D': '2 Days',
};
const durationRegex = /-P(\d+)([DH])|-PT(\d+)([MH])/;

// Time Zone Definition for IST (iCalendar standard VTIMEZONE block)
const IST_VTIMEZONE = `
BEGIN:VTIMEZONE
TZID:Asia/Kolkata
BEGIN:STANDARD
DTSTART:19000101T000000
TZOFFSETFROM:+0530
TZOFFSETTO:+0530
TZNAME:IST
END:STANDARD
END:VTIMEZONE
`.trim().replace(/\n/g, '\r\n');


// --- DOM Element References (Initialized in DOMContentLoaded) ---
let eventListEl, eventForm, eventCountEl, emptyStateEl, messageBox;
let confirmClearModal, eventsToClearCount;
let eventDateTimeStart, eventDateTimeEnd;
let remindersListEl, reminderSelectionArea, customReminderValue, customReminderUnit;


// --------------------------------------
// --- UTILITY FUNCTIONS ---
// --------------------------------------

/**
 * Displays a non-blocking message notification.
 * @param {string} message - The message content.
 * @param {string} type - 'success' or 'error'.
 */
function showMessage(message, type = 'success') {
    if (!messageBox) return; 
    
    messageBox.textContent = message;
    const bgColor = type === 'success' ? 'bg-emerald-500' : 'bg-red-500';
    messageBox.className = `message-box p-4 rounded-xl text-white font-medium shadow-lg ${bgColor}`;
    messageBox.classList.remove('hidden');
    
    // Trigger CSS animation restart
    messageBox.style.animation = 'none';
    void messageBox.offsetWidth; 
    messageBox.style.animation = null;
}

/**
 * Generates a unique ID for VEVENTs.
 * @returns {string} - Unique ID.
 */
function generateUniqueId() {
    return new Date().getTime().toString(36) + Math.random().toString(36).substr(2, 5);
}

// --------------------------------------
// --- REMINDER MANAGEMENT ---
// --------------------------------------

/**
 * Converts ISO 8601 duration string to readable text for UI display.
 * @param {string} isoDuration - The iCalendar duration string (e.g., -PT1H).
 * @returns {string} - Human-readable text.
 */
function getReminderDisplayText(isoDuration) {
    if (durationMap[isoDuration]) {
        return durationMap[isoDuration];
    }
    
    const match = isoDuration.match(durationRegex);
    if (match) {
        // Match 1 & 2 for Days/Hours (e.g., -P2D)
        if (match[1]) { 
            const value = match[1];
            const unit = match[2];
            return `${value} ${unit === 'D' ? 'Day(s)' : 'Hour(s)'}`;
        // Match 3 & 4 for Hours/Minutes (e.g., -PT15M)
        } else if (match[3]) { 
             const value = match[3];
             const unit = match[4];
             return `${value} ${unit === 'H' ? 'Hour(s)' : 'Min(s)'}`;
        }
    }
    return 'Custom Alarm';
}

/**
 * Renders the currentReminders array into the list display.
 */
function renderReminders() {
    if (!remindersListEl) return;

    remindersListEl.innerHTML = currentReminders.map((duration, index) => `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-medium">
            <span class="mr-1">🔔</span>
            ${getReminderDisplayText(duration)} Before
            <button type="button" class="text-emerald-300/80 hover:text-emerald-100 transition" onclick="removeReminder(${index})" aria-label="Remove reminder">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
            </button>
        </span>
    `).join('');

    // Hide selection area if reminders are present, keeping UI compact
    if (currentReminders.length > 0 && reminderSelectionArea) {
         reminderSelectionArea.classList.add('hidden');
    }
}

/**
 * Adds a preset or imported reminder duration to the form state.
 * @param {string} duration - ISO 8601 duration string.
 */
function addReminderToForm(duration) {
    if (!currentReminders.includes(duration)) {
        currentReminders.push(duration);
        renderReminders();
        showMessage(`Reminder added: ${getReminderDisplayText(duration)} Before.`, 'success');
    } else {
        showMessage(`Reminder ${getReminderDisplayText(duration)} is already set.`, 'error');
    }
}

/**
 * Handles custom reminder creation from input fields.
 */
function addCustomReminder() {
    const value = parseInt(customReminderValue.value);
    const unit = customReminderUnit.value;
    
    if (isNaN(value) || value <= 0) {
        showMessage('Please enter a valid time value (greater than 0).', 'error');
        return;
    }

    // Custom format: -P[value]D or -PT[value][M|H]
    const duration = (unit === 'D') ? `-P${value}D` : `-PT${value}${unit}`;

    addReminderToForm(duration);
    customReminderValue.value = ''; // Clear input after adding
}

/**
 * Removes a reminder from the current form state by index.
 * @param {number} index - Index in the currentReminders array.
 */
function removeReminder(index) {
    currentReminders.splice(index, 1);
    renderReminders();
}

/**
 * Toggles the visibility of the reminder selection area.
 */
function toggleReminderArea() {
    if(reminderSelectionArea) {
        reminderSelectionArea.classList.toggle('hidden');
    }
}


// --------------------------------------
// --- EVENT LIST MANAGEMENT ---
// --------------------------------------

/**
 * Renders the full list of events, sorted by start date.
 * @param {number} [newItemId=null] - ID of the newly added item for animation.
 */
function renderEvents(newItemId = null) {
    if (events.length === 0) {
        eventListEl.innerHTML = ''; 
        emptyStateEl.classList.remove('hidden');
        eventCountEl.textContent = '0';
        return;
    }

    emptyStateEl.classList.add('hidden');
    eventCountEl.textContent = events.length;

    // Sort events by start date/time
    events.sort((a, b) => new Date(a.datetimeStart) - new Date(b.datetimeStart));

    eventListEl.innerHTML = events.map(event => {
        const dateTimeStart = new Date(event.datetimeStart);
        const dateTimeEnd = new Date(event.datetimeEnd);
        
        const formattedDate = dateTimeStart.toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
        
        const formattedTime = `${dateTimeStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} - ${dateTimeEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
        
        // Display Timezone abbreviation (e.g., IST, PST)
        const timezoneDisplay = event.timezone && event.timezone !== 'Asia/Kolkata' ? ` (${event.timezone.split('/')[1] || event.timezone})` : ' (IST)';

        // Format and display multiple reminders
        let remindersDisplay = '';
        if (event.reminders && event.reminders.length > 0) { 
            const reminderTexts = event.reminders.map(getReminderDisplayText).join(', ');
            remindersDisplay = `<p class="text-xs text-emerald-400 mt-1">🔔 ${reminderTexts} Before</p>`;
        }

        // Apply animation class if it's the newly added item
        const animationClass = (newItemId !== null && event.id === newItemId) ? 'event-enter-active' : '';

        return `
            <div class="event-item group ${animationClass}" data-id="${event.id}">
                <div class="flex-grow min-w-0 pr-4"> 
                    <p class="text-lg font-semibold text-white truncate">${event.name}</p>
                    <p class="text-sm text-slate-400 mt-0.5">
                        ${formattedDate}, ${formattedTime}${timezoneDisplay}
                    </p>
                    ${remindersDisplay}
                    ${event.location ? `<p class="text-xs text-indigo-400 mt-1">📍 ${event.location}</p>` : ''}
                    ${event.description ? `<p class="text-xs text-slate-500 mt-2 line-clamp-2">${event.description}</p>` : ''}
                </div>
                <div class="flex space-x-2 opacity-0 group-hover:opacity-100 transition duration-200 flex-shrink-0 items-center">
                    <!-- Duplicate Button -->
                    <button onclick="duplicateEvent(${event.id})" class="action-btn duplicate" aria-label="Duplicate Event">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M8 7v4m0 0v4m0-4h4m-4 0h4m8 0V9a2 2 0 00-2-2h-3M6 20h9a2 2 0 002-2v-3m-2-4H7a2 2 0 00-2 2v4a2 2 0 002 2h4l-2 2v2m8-10V7a2 2 0 00-2-2H7a2 2 0 00-2 2v4a2 2 0 002 2h10l2-2v-4z"/>
                        </svg>
                    </button>
                    <!-- Delete Button -->
                    <button onclick="deleteEvent(${event.id})" class="action-btn delete" aria-label="Delete Event">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Removes an event from the list.
 * @param {number} id - Event ID.
 */
function deleteEvent(id) {
    events = events.filter(event => event.id !== id);
    renderEvents();
    showMessage('Event successfully removed.', 'success');
}

/**
 * Creates a duplicate of an existing event for quick editing.
 * @param {number} id - Event ID to duplicate.
 */
function duplicateEvent(id) {
    const originalEvent = events.find(e => e.id === id);
    if (!originalEvent) return;

    const newId = eventIdCounter++;
    const duplicatedEvent = {
        id: newId,
        name: originalEvent.name + " (Copy)",
        location: originalEvent.location,
        datetimeStart: originalEvent.datetimeStart, 
        datetimeEnd: originalEvent.datetimeEnd,     
        timezone: originalEvent.timezone,
        reminders: [...originalEvent.reminders], // Deep copy the reminders array
        description: originalEvent.description
    };

    events.push(duplicatedEvent);
    renderEvents(newId);
    showMessage('Event duplicated! Adjust the dates and times as needed.', 'success');
}

/**
 * Shows/hides the Clear All confirmation modal.
 * @param {boolean} show - Whether to show (true) or hide (false) the modal.
 */
function toggleClearModal(show) {
    if (confirmClearModal) {
        if (show) {
            if (events.length === 0) {
                showMessage('The event list is already empty.', 'error');
                return;
            }
            eventsToClearCount.textContent = events.length;
            confirmClearModal.classList.remove('hidden');
        } else {
            confirmClearModal.classList.add('hidden');
        }
    }
}


// --------------------------------------
// --- EVENT LISTENERS AND HANDLERS ---
// --------------------------------------

/**
 * Handles the form submission to add a new event.
 */
function handleEventSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('event-name').value.trim();
    const location = document.getElementById('event-location').value.trim();
    const datetimeStart = eventDateTimeStart.value;
    const datetimeEnd = eventDateTimeEnd.value;
    const timezone = document.getElementById('event-timezone').value;
    const description = document.getElementById('event-description').value.trim();

    // Simple validation
    if (!name || !datetimeStart || !datetimeEnd) {
        showMessage('Please enter event name, start time, and end time.', 'error');
        return;
    }

    if (new Date(datetimeStart) >= new Date(datetimeEnd)) {
        showMessage('The start time must be before the end time.', 'error');
        return;
    }
    
    const newId = eventIdCounter++;

    const newEvent = {
        id: newId,
        name,
        location,
        datetimeStart, 
        datetimeEnd,
        timezone,
        reminders: [...currentReminders], 
        description
    };

    events.push(newEvent);
    renderEvents(newId);
    eventForm.reset();
    currentReminders = []; // Reset reminders for the next event
    renderReminders();
    showMessage('Event added successfully!', 'success');
}

/**
 * Initializes DOM element references and sets up listeners.
 */
function initializeApp() {
    // Assign DOM elements
    eventListEl = document.getElementById('event-list');
    eventForm = document.getElementById('event-form');
    eventCountEl = document.getElementById('event-count');
    emptyStateEl = document.getElementById('empty-state');
    messageBox = document.getElementById('message-box');
    
    confirmClearModal = document.getElementById('confirm-clear-modal'); 
    eventsToClearCount = document.getElementById('events-to-clear-count'); 
    eventDateTimeStart = document.getElementById('event-datetime-start');
    eventDateTimeEnd = document.getElementById('event-datetime-end');
    
    remindersListEl = document.getElementById('reminders-list');
    reminderSelectionArea = document.getElementById('reminder-selection-area');
    customReminderValue = document.getElementById('custom-reminder-value');
    customReminderUnit = document.getElementById('custom-reminder-unit');

    // Setup Event Listeners
    if (eventForm) eventForm.addEventListener('submit', handleEventSubmit);

    if (document.getElementById('clear-all-btn')) {
        document.getElementById('clear-all-btn').addEventListener('click', () => toggleClearModal(true));
    }
    
    if (document.getElementById('execute-clear-btn')) {
        document.getElementById('execute-clear-btn').addEventListener('click', () => {
            const count = events.length;
            events = [];
            eventIdCounter = 1;
            renderEvents();
            toggleClearModal(false);
            showMessage(`Successfully cleared all ${count} events.`, 'success');
        });
    }
    
    // Initial UI render
    renderEvents();
    renderReminders();
}

document.addEventListener('DOMContentLoaded', initializeApp);


// --------------------------------------
// --- ICS EXPORT/IMPORT LOGIC ---
// --------------------------------------

/**
 * Formats ISO datetime string to iCalendar TZID format.
 * DTSTART;TZID=Europe/London:20251027T100000
 * @param {string} isoString - The date string from datetime-local input.
 * @param {string} tzid - The Time Zone ID (e.g., Asia/Kolkata).
 * @returns {string} - The formatted iCalendar date string with TZID.
 */
function formatICSDateTZ(isoString, tzid) {
    if (!isoString) return '';
    // Input: 2025-10-27T10:00 -> Output: 20251027T100000
    const formattedDate = isoString.slice(0, 16).replace(/[-:]/g, '').replace('T', 'T') + '00';
    return `TZID=${tzid}:${formattedDate}`;
}

/**
 * Creates a single VALARM block for a given reminder duration.
 * @param {string} reminderValue - The duration (e.g., -PT15M).
 * @returns {string} - The VALARM block string.
 */
function createAlarmBlock(reminderValue) {
    // DTSTAMP must be UTC
    const now = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', 'T') + 'Z';

    return [
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:Reminder for Calibridge event`, 
        `TRIGGER:${reminderValue}`, // e.g., TRIGGER:-PT15M
        `UID:${generateUniqueId()}-alarm`,
        `DTSTAMP:${now}`,
        'END:VALARM'
    ].join('\r\n');
}

/**
 * Initiates the ICS file download.
 */
document.getElementById('export-btn')?.addEventListener('click', () => {
    if (events.length === 0) {
        showMessage('Please add events before exporting.', 'error');
        return;
    }
    
    const fileNameInput = document.getElementById('export-file-name').value.trim();
    let fileName = fileNameInput || 'Calibridge_Export'; 
    if (!fileName.toLowerCase().endsWith('.ics')) {
        fileName += '.ics';
    }

    const icsLines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Calibridge//Calendar Export v3.0//EN', 
        'CALSCALE:GREGORIAN',
        IST_VTIMEZONE // Include VTIMEZONE definition for IST
    ];

    const now = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', 'T') + 'Z';
    
    events.forEach(event => {
        const tzid = event.timezone || 'Asia/Kolkata'; 

        const dtStart = formatICSDateTZ(event.datetimeStart, tzid);
        const dtEnd = formatICSDateTZ(event.datetimeEnd, tzid);

        icsLines.push('BEGIN:VEVENT');
        icsLines.push(`UID:${generateUniqueId()}`);
        icsLines.push(`DTSTAMP:${now}`);
        icsLines.push(`DTSTART;${dtStart}`); 
        icsLines.push(`DTEND;${dtEnd}`);
        icsLines.push(`SUMMARY:${event.name.replace(/(\r\n|\n|\r)/gm, " ")}`); 
        
        if (event.location) {
            icsLines.push(`LOCATION:${event.location.replace(/(\r\n|\n|\r)/gm, " ")}`);
        }
        if (event.description) {
            const desc = event.description.replace(/(\r\n|\n|\r)/gm, "\\n");
            icsLines.push(`DESCRIPTION:${desc}`);
        }
        
        // Add multiple VALARM blocks for each reminder
        if (event.reminders && event.reminders.length > 0) {
            event.reminders.forEach(reminder => {
                 icsLines.push(createAlarmBlock(reminder));
            });
        }

        icsLines.push('END:VEVENT');
    });

    icsLines.push('END:VCALENDAR');

    const icsContent = icsLines.join('\r\n');
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    
    // Trigger download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName; 
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    showMessage(`Exported ${events.length} events to ${fileName}!`, 'success');
});


/**
 * Converts ICS date format (YYYYMMDDTHHMMSS) to ISO format (YYYY-MM-DDTHH:MM)
 */
function formatICSDateToISO(icsDate) {
    let isoDate;
    if (icsDate.includes('T')) {
        // Date-Time format (YYYYMMDDTHHMMSS)
        isoDate = 
            icsDate.substring(0, 4) + '-' + 
            icsDate.substring(4, 6) + '-' + 
            icsDate.substring(6, 8) + 'T' + 
            icsDate.substring(9, 11) + ':' + 
            icsDate.substring(11, 13);
    } else {
        // Date-only format (YYYYMMDD) - treat as all-day start at 00:00
        isoDate = 
            icsDate.substring(0, 4) + '-' + 
            icsDate.substring(4, 6) + '-' + 
            icsDate.substring(6, 8) + 'T00:00';
    }
    return isoDate;
}

/**
 * Parses an uploaded ICS file and adds events to the list.
 */
function parseICS(icsContent) {
    const lines = icsContent.split(/\r\n|\n|\r/).map(line => line.trim());
    const importedEvents = [];
    let currentEvent = null;

    lines.forEach(line => {
        // Skip continuation lines
        if (line.startsWith(' ')) {
            return; 
        }

        if (line.startsWith('BEGIN:VEVENT')) {
            currentEvent = {
                name: 'Untitled Event',
                datetimeStart: '',
                datetimeEnd: '',
                description: '',
                location: '', 
                timezone: 'Asia/Kolkata', // Default timezone on import
                reminders: [] 
            };
        } else if (line.startsWith('END:VEVENT') && currentEvent) {
            // Validate and push event
            if (currentEvent.datetimeStart) {
                // If DTEND is missing, default to 1 hour duration
                if (!currentEvent.datetimeEnd) {
                    const start = new Date(currentEvent.datetimeStart);
                    const end = new Date(start.getTime() + 60 * 60 * 1000); 
                    currentEvent.datetimeEnd = end.toISOString().substring(0, 16);
                }
                importedEvents.push(currentEvent);
            }
            currentEvent = null;
        } else if (currentEvent) {
            const [key, ...rest] = line.split(':');
            const value = rest.join(':');

            if (key.startsWith('SUMMARY')) {
                currentEvent.name = value.replace(/\\n/g, '\n');
            } else if (key.startsWith('DESCRIPTION')) {
                currentEvent.description = value.replace(/\\n/g, '\n');
            } else if (key.startsWith('LOCATION')) { 
                currentEvent.location = value.replace(/\\n/g, '\n');
            } else if (key.startsWith('DTSTART')) {
                const tzidMatch = key.match(/TZID=([^;,\r\n]+)/);
                if (tzidMatch) {
                    currentEvent.timezone = tzidMatch[1];
                }
                const dateValueMatch = value.match(/(\d{8}T\d{6}|\d{8})/);
                if (dateValueMatch) {
                    currentEvent.datetimeStart = formatICSDateToISO(dateValueMatch[0]);
                }
            } else if (key.startsWith('DTEND')) {
                 const dateValueMatch = value.match(/(\d{8}T\d{6}|\d{8})/);
                if (dateValueMatch) {
                    currentEvent.datetimeEnd = formatICSDateToISO(dateValueMatch[0]);
                }
            } else if (line.startsWith('TRIGGER')) {
                // Extract negative duration triggers (reminders)
                const triggerMatch = line.match(/TRIGGER:(-P[0-9]+[DTWHMS])/);
                if (triggerMatch) {
                     // Check if reminder is already present to avoid duplicates from VALARM blocks
                     if (!currentEvent.reminders.includes(triggerMatch[1])) {
                        currentEvent.reminders.push(triggerMatch[1]);
                     }
                }
            }
        }
    });

    return importedEvents;
}

/**
 * Handles the file upload and initiates ICS parsing.
 * This function is called directly from the onclick event in index.html.
 */
function importICS(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const icsContent = e.target.result;
            const importedEvents = parseICS(icsContent);

            if (importedEvents.length === 0) {
                showMessage('No valid events found in the .ics file.', 'error');
                return;
            }
            
            let lastImportedId = null; 
            importedEvents.forEach(impEvent => {
                lastImportedId = eventIdCounter++; 
                events.push({...impEvent, id: lastImportedId});
            });

            renderEvents(lastImportedId);
            showMessage(`Successfully imported ${importedEvents.length} events!`, 'success');

        } catch (error) {
            console.error("Error during ICS import:", error);
            showMessage('Failed to process the .ics file. It may be corrupted or in an unsupported format.', 'error');
        }
        // Clear the file input for re-upload capability
        event.target.value = '';
    };
    
    reader.onerror = function() {
        showMessage('Error reading file.', 'error');
        event.target.value = '';
    };

    reader.readAsText(file);
}
