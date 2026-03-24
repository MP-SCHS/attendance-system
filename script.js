const GOOGLE_URL = "https://script.google.com/macros/s/AKfycbzFl4M2pyzkhUvrLex691-3fZ4yeb6_11BUTAKGLYX8-UgSWhLkDl-vDTe7ExncgX3-/exec";

// This is now used as a fallback or for manual overrides
let attendanceTracker = {};
let port; 
let keepReading = true;

const connectBtn = document.getElementById('connectBtn');
const statusSpn = document.getElementById('status');
const lastIDSpn = document.getElementById('lastID');
const serverMsg = document.getElementById('serverMsg');
const statusBody = document.getElementById('statusBody');

// --- TAB LOGIC ---
window.showTab = function(event, tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
};

function updateStatusTable() {
    statusBody.innerHTML = ""; 
    for (const [id, data] of Object.entries(attendanceTracker)) {
        const stateClass = data.isOut ? 'status-out' : 'status-here'; 
        const row = `<tr>
            <td>${data.name}</td>
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
            writer.releaseLock(); 
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
                buffer = lines.pop(); 

                for (let line of lines) {
                    let rawData = line.trim();
                    if (!rawData || !rawData.includes(",")) continue;

                    console.log("Arduino says:", rawData);

                    // --- NEW LOGIC START ---
                    // Splitting the 4 parts sent by Arduino: Name, ID, Mode, OutMode
                    const [scannedName, scannedID, strMode, outModeStr] = rawData.split(",");
                    const isOut = outModeStr.toLowerCase().includes("true") || outModeStr === "1";

                    // Update tracking & UI using data FROM THE CARD
                    attendanceTracker[scannedID] = { 
                        name: scannedName, 
                        location: strMode, 
                        isOut: isOut 
                    };
                    
                    lastIDSpn.innerText = scannedName; // Update display box to show name
                    updateStatusTable();

                    // Network Log (Including name for the Google Sheet)
                    fetch(`${GOOGLE_URL}?id=${encodeURIComponent(scannedID)}&name=${encodeURIComponent(scannedName)}&mode=${strMode}&isOut=${isOut}`, { mode: 'no-cors' });
                    serverMsg.innerText = `Synced: ${strMode}`;

                    // Response Logic: We just send "K" to unlock the Arduino
                    // because the Arduino already knows the name from the card!
                    writeToArduino("K\n");
                    // --- NEW LOGIC END ---

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
