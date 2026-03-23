const GOOGLE_URL = "https://script.google.com/macros/s/AKfycbxshlkitd9gapxoN6gdkguZp8diyy1Mo8I_hNwWRXScMvQooxv_IuEl6vFpFyhYjvBz/exec";

const studentNames = {
    "82 6D A1 04": "Madden Pucci",
    "7B B8 D7 05": "Jay Slavin"
};

let attendanceTracker = {};
let port; 
let keepReading = true;

const connectBtn = document.getElementById('connectBtn');
const statusSpn = document.getElementById('status');
const lastIDSpn = document.getElementById('lastID');
const serverMsg = document.getElementById('serverMsg');
const statusBody = document.getElementById('statusBody');

// --- TAB LOGIC (STAYS ACTIVE) ---
window.showTab = function(event, tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
};

function updateStatusTable() {
    statusBody.innerHTML = ""; 
    for (const [id, data] of Object.entries(attendanceTracker)) {
        const name = studentNames[id] || "Unknown";
        const stateClass = data.isOut ? 'status-out' : 'status-here'; 
        const row = `<tr>
            <td>${name}</td>
            <td>${id}</td>
            <td><span class="${stateClass}">${data.location}</span></td>
        </tr>`;
        statusBody.innerHTML += row;
    }
}

// --- ARDUINO COMMUNICATION ---
async function writeToArduino(message) {
    if (port && port.writable) {
        const writer = port.writable.getWriter();
        try {
            await writer.write(new TextEncoder().encode(message));
            console.log("Sent to Arduino:", message.trim());
        } finally {
            writer.releaseLock(); // CRITICAL: Always unlock so reading can continue
        }
    }
}

connectBtn.addEventListener('click', async () => {
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        
        statusSpn.innerText = "ONLINE";
        statusSpn.style.color = "#1b5e20";
        connectBtn.innerText = "ARDUINO ACTIVE";
        connectBtn.disabled = true;

        // Start the reading loop in the background
        readLoop(); 

    } catch (err) {
        console.error("Connection error:", err);
        alert("Could not connect to Serial Port.");
    }
});

async function readLoop() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();

    let buffer = "";

    try {
        while (keepReading) {
            const { value, done } = await reader.read();
            if (done) break;
            
            buffer += value;

            if (buffer.includes("\n")) {
                let lines = buffer.split("\n");
                buffer = lines.pop(); // Keep partial line in buffer

                for (let line of lines) {
                    let rawData = line.trim();
                    if (!rawData || !rawData.includes(",")) continue;

                    console.log("Arduino says:", rawData);

                    const [tagID, strMode, outModeStr] = rawData.split(",");
                    const isOut = outModeStr.toLowerCase().includes("true") || outModeStr === "1";

                    // Update tracking & UI
                    attendanceTracker[tagID] = { location: strMode, isOut: isOut };
                    lastIDSpn.innerText = tagID;
                    updateStatusTable();

                    // Network Log
                    fetch(`${GOOGLE_URL}?id=${encodeURIComponent(tagID)}&mode=${strMode}&isOut=${isOut}`, { mode: 'no-cors' });
                    serverMsg.innerText = `Synced: ${strMode}`;

                    // Response Logic
                    const name = studentNames[tagID] || "";
                    const response = name ? `>${name}\n` : "K\n";
                    
                    // We call this without 'await' to keep the loop moving
                    writeToArduino(response);

                    setTimeout(() => { serverMsg.innerText = ""; }, 3000);
                }
            }
        }
    } catch (err) {
        console.error("Read error:", err);
    } finally {
        reader.releaseLock();
    }
}
