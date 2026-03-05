const GOOGLE_URL = "https://script.google.com/macros/s/AKfycbxshlkitd9gapxoN6gdkguZp8diyy1Mo8I_hNwWRXScMvQooxv_IuEl6vFpFyhYjvBz/exec";

const studentNames = {
    "82 6D A1 04": "Madden (Blue)",
    "7B B8 D7 05": "Jay (White)"
};

let attendanceTracker = {};
let port; 

const connectBtn = document.getElementById('connectBtn');
const statusSpn = document.getElementById('status');
const lastIDSpn = document.getElementById('lastID');
const serverMsg = document.getElementById('serverMsg');
const statusBody = document.getElementById('statusBody');

// --- UPDATED TAB LOGIC ---
function showTab(event, tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}

function updateStatusTable() {
    statusBody.innerHTML = ""; 
    for (const [id, state] of Object.entries(attendanceTracker)) {
        const name = studentNames[id] || "Unknown";
        const stateClass = state === 'HERE' ? 'status-here' : 'status-out';
        const row = `<tr>
            <td>${name}</td>
            <td>${id}</td>
            <td><span class="${stateClass}">${state}</span></td>
        </tr>`;
        statusBody.innerHTML += row;
    }
}

connectBtn.addEventListener('click', async () => {
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        statusSpn.innerText = "ONLINE";
        statusSpn.style.color = "#1b5e20";
        connectBtn.innerText = "ARDUINO ACTIVE";
        connectBtn.style.background = "#080708";
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
                    lastIDSpn.innerText = tagID;
                    attendanceTracker[tagID] = mode;
                    updateStatusTable();

                    fetch(`${GOOGLE_URL}?id=${encodeURIComponent(tagID)}&mode=${mode}`, { mode: 'no-cors' })
                    .then(async () => {
                        serverMsg.innerText = `Synced: ${mode}`;
                        setTimeout(async () => {
                            if (port.writable) {
                                const writer = port.writable.getWriter();
                                await writer.write(new TextEncoder().encode("K"));
                                writer.releaseLock();
                            }
                        }, 600);
                        setTimeout(() => { serverMsg.innerText = ""; }, 3000);
                    });
                }
            }
        }
    } catch (err) { console.error(err); }
});
