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
for (let line of lines) {
                    // 1. Clean the line thoroughly
                    let rawData = line.replace(/(\r\n|\n|\r)/gm, "").trim(); 
                    if (!rawData || !rawData.includes(",")) continue;

                    console.log("Cleaned Data:", rawData);

                    const parts = rawData.split(",");
                    if (parts.length < 4) {
                        console.error("Data missing parts! Expected 4, got:", parts);
                        continue;
                    }

                    // 2. Destructure and trim each individual part
                    let [scannedName, scannedID, strMode, outModeStr] = parts.map(p => p.trim());

                    console.log("Parsed Name:", scannedName);
                    console.log("Parsed ID:", scannedID);

                    // 3. Robust Boolean Check
                    const isOut = outModeStr.toLowerCase() === "true" || outModeStr === "1";

                    // 4. Update the Object
                    attendanceTracker[scannedID] = { 
                        name: scannedName, 
                        location: strMode, 
                        isOut: isOut 
                    };

                    // 5. Force UI Update
                    lastIDSpn.innerText = scannedName;
                    updateStatusTable();

                    // 6. Network Log
                    const fetchURL = `${GOOGLE_URL}?id=${encodeURIComponent(scannedID)}&name=${encodeURIComponent(scannedName)}&mode=${encodeURIComponent(strMode)}&isOut=${isOut}`;
                    fetch(fetchURL, { mode: 'no-cors' })
                        .then(() => { serverMsg.innerText = `Synced: ${scannedName}`; })
                        .catch(err => { console.error("Fetch Error:", err); });

                    writeToArduino("K\n");
                    setTimeout(() => { serverMsg.innerText = ""; }, 3000);
                }
}
