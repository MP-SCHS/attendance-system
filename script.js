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

function updateStatusTable() {
    console.log("Updating Table with:", attendanceTracker);
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

async function writeToArduino(message) {
    if (port && port.writable) {
        const writer = port.writable.getWriter();
        await writer.write(new TextEncoder().encode(message));
        writer.releaseLock();
    }
}

connectBtn.addEventListener('click', async () => {
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        statusSpn.innerText = "ONLINE";
        connectBtn.innerText = "CONNECTED";
        readLoop(); 
    } catch (err) {
        console.error("Connection error:", err);
    }
});

async function readLoop() {
    const decoder = new TextDecoder();
    let buffer = "";

    while (port && port.readable && keepReading) {
        const reader = port.readable.getReader();
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                if (buffer.includes("\n")) {
                    let lines = buffer.split("\n");
                    buffer = lines.pop(); 

                    for (let line of lines) {
                        let cleanLine = line.trim();
                        if (!cleanLine) continue;
                        
                        console.log("1. Received Line:", cleanLine);

                        if (!cleanLine.includes(",")) {
                            console.warn("2. Line skipped (No commas found)");
                            continue;
                        }

                        const parts = cleanLine.split(",");
                        console.log("3. Parts split:", parts);

                        if (parts.length >= 4) {
                            const [sName, sID, sMode, sOut] = parts.map(p => p.trim());
                            
                            // Check if the data actually exists
                            if(!sName || !sID) {
                                console.error("4. Error: Name or ID is blank!");
                                continue;
                            }

                            const outBool = sOut.toLowerCase().includes("true");

                            // UPDATE DATA
                            attendanceTracker[sID] = { 
                                name: sName, 
                                location: sMode, 
                                isOut: outBool 
                            };

                            // UPDATE UI
                            lastIDSpn.innerText = sName;
                            updateStatusTable();

                            // SYNC
                            fetch(`${GOOGLE_URL}?id=${encodeURIComponent(sID)}&name=${encodeURIComponent(sName)}&mode=${encodeURIComponent(sMode)}&isOut=${outBool}`, { mode: 'no-cors' });
                            
                            writeToArduino("K\n");
                            console.log("5. Success: UI Updated & Unlock Sent");
                        } else {
                            console.warn("4. Error: Line had less than 4 parts", parts.length);
                        }
                    }
                }
            }
        } catch (err) {
            console.error("READ ERROR:", err);
        } finally {
            reader.releaseLock();
        }
    }
}
