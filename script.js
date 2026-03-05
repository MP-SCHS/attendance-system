const GOOGLE_URL = "https://script.google.com/macros/s/AKfycbxshlkitd9gapxoN6gdkguZp8diyy1Mo8I_hNwWRXScMvQooxv_IuEl6vFpFyhYjvBz/exec";

// Dictionary to link IDs to Names
const studentNames = {
    "82 6D A1 04": "Madden (Blue)",
    "7B B8 D7 05": "Jay (White)"
};

// Object to track the current state of each scanned student
let attendanceTracker = {};

const connectBtn = document.getElementById('connectBtn');
const statusSpn = document.getElementById('status');
const lastIDSpn = document.getElementById('lastID');
const serverMsg = document.getElementById('serverMsg');
const statusBody = document.getElementById('statusBody');

// --- TAB SWITCHING LOGIC ---
function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}

// --- TABLE UPDATE LOGIC ---
function updateStatusTable() {
    statusBody.innerHTML = ""; // Clear table
    for (const [id, state] of Object.entries(attendanceTracker)) {
        const name = studentNames[id] || "Unknown";
        const row = `<tr>
            <td>${name}</td>
            <td>${id}</td>
            <td class="${state === 'HERE' ? 'status-here' : 'status-out'}">${state}</td>
        </tr>`;
        statusBody.innerHTML += row;
    }
}

// --- SERIAL LOGIC ---
let port; 
connectBtn.addEventListener('click', async () => {
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        statusSpn.innerText = "CONNECTED";
        statusSpn.style.color = "green";
        connectBtn.disabled = true;

        const textDecoder = new TextDecoderStream();
        port.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();

        let buffer = "";
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;

            if (buffer.includes("\n")) {
                const rawData = buffer.trim(); 
                buffer = "";

                if (rawData.includes(",")) {
                    const [tagID, mode] = rawData.split(",");
                    
                    // Update UI and Tracker
                    lastIDSpn.innerText = tagID;
                    attendanceTracker[tagID] = mode; // This ensures each student is listed once
                    updateStatusTable();

                    // Send to Google
                    fetch(`${GOOGLE_URL}?id=${encodeURIComponent(tagID)}&mode=${mode}`, { mode: 'no-cors' })
                    .then(async () => {
                        serverMsg.innerText = "✅ Success";
                        setTimeout(async () => {
                            if (port.writable) {
                                const writer = port.writable.getWriter();
                                await writer.write(new TextEncoder().encode("K"));
                                writer.releaseLock();
                            }
                        }, 600);
                    });
                }
            }
        }
    } catch (err) { console.error(err); }
});
