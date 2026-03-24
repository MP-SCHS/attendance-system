const GOOGLE_URL = "https://script.google.com/macros/s/AKfycbxshlkitd9gapxoN6gdkguZp8diyy1Mo8I_hNwWRXScMvQooxv_IuEl6vFpFyhYjvBz/exec";

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

// --- TABLE UPDATE LOGIC ---
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
        alert("Could not connect to Serial Port. Ensure Serial Monitor is closed in Arduino IDE.");
    }
});

async function readLoop() {
    while (port && port.readable && keepReading) {
        const reader = port.readable.getReader();
        try {
            let buffer = ""; // This stays alive to catch fragments
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                // 1. Decode the chunk and add to our buffer
                const chunk = new TextDecoder().decode(value);
                buffer += chunk;

                // 2. Check if we have at least one complete line
                if (buffer.includes("\n")) {
                    let lines = buffer.split("\n");
                    
                    // Keep the last (potentially incomplete) part in the buffer
                    buffer = lines.pop(); 

                    for (let line of lines) {
                        let rawData = line.trim();
                        if (!rawData || !rawData.includes(",")) continue;

                        console.log("Valid Line Found:", rawData);

                        // 3. Split and Clean
                        const parts = rawData.split(",");
                        if (parts.length >= 4) {
                            const [scannedName, scannedID, strMode, outModeStr] = parts.map(p => p.trim());
                            const isOut = outModeStr.toLowerCase().includes("true") || outModeStr === "1";

                            // 4. Update Tracking Object
                            attendanceTracker[scannedID] = { 
                                name: scannedName, 
                                location: strMode, 
                                isOut: isOut 
                            };

                            // 5. Trigger UI Updates
                            lastIDSpn.innerText = scannedName;
                            updateStatusTable();

                            // 6. Network sync
                            const fetchURL = `${GOOGLE_URL}?id=${encodeURIComponent(scannedID)}&name=${encodeURIComponent(scannedName)}&mode=${encodeURIComponent(strMode)}&isOut=${isOut}`;
                            fetch(fetchURL, { mode: 'no-cors' });
                            
                            serverMsg.innerText = `Synced: ${scannedName}`;

                            // 7. Unlock Arduino
                            writeToArduino("K\n");
                            
                            setTimeout(() => { serverMsg.innerText = ""; }, 3000);
                        } else {
                            console.warn("Discarding incomplete CSV line:", rawData);
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Read error:", err);
        } finally {
            reader.releaseLock();
        }
    }
}
