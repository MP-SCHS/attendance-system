const GOOGLE_URL = "https://script.google.com/macros/s/AKfycbxshlkitd9gapxoN6gdkguZp8diyy1Mo8I_hNwWRXScMvQooxv_IuEl6vFpFyhYjvBz/exec";

const studentNames = {
    "82 6D A1 04": "Madden Pucci",
    "7B B8 D7 05": "Jay Slavin"
};

let attendanceTracker = {};
let port; 

const connectBtn = document.getElementById('connectBtn');
const statusSpn = document.getElementById('status');
const lastIDSpn = document.getElementById('lastID');
const serverMsg = document.getElementById('serverMsg');
const statusBody = document.getElementById('statusBody');

// --- TAB LOGIC ---
function showTab(event, tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}

// --- TABLE UPDATE LOGIC ---
function updateStatusTable() {
    statusBody.innerHTML = ""; 
    for (const [id, data] of Object.entries(attendanceTracker)) {
        const name = studentNames[id] || "Unknown";
        
        // Green if entering (isOut is false), Red if leaving (isOut is true)
        const stateClass = data.isOut ? 'status-out' : 'status-here'; 
        
        const row = `<tr>
            <td>${name}</td>
            <td>${id}</td>
            <td><span class="${stateClass}">${data.location}</span></td>
        </tr>`;
        statusBody.innerHTML += row;
    }
}

// --- SERIAL CONNECTION ---
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
            // CRITICAL FIX: We must actually read the data here
            const { value, done } = await reader.read();
            if (done) break;
            
            buffer += value;

            // Check if we have a full line of data
            if (buffer.includes("\n")) {
                const rawData = buffer.trim(); 
                buffer = "";
                
                if (rawData.includes(",")) {
                    // Split the three pieces: ID, Destination Name, True/False
                    const [tagID, strMode, outModeStr] = rawData.split(",");
                    
                    // Convert "1" or "true" to a real boolean
                    const isOut = outModeStr.toLowerCase().includes("true") || outModeStr === "1";

                    // Update local tracker
                    attendanceTracker[tagID] = {
                        location: strMode,
                        isOut: isOut
                    };

                    // Update UI
                    lastIDSpn.innerText = tagID;
                    updateStatusTable();

                    // Send to Google Sheets
                    fetch(`${GOOGLE_URL}?id=${encodeURIComponent(tagID)}&mode=${strMode}&isOut=${isOut}`, { mode: 'no-cors' })
                    .then(async () => {
                        serverMsg.innerText = `Synced: ${strMode}`;
                        
                        // Look up Student Name
                        const name = studentNames[tagID] || "";
                        const responseToArduino = name ? `>${name}\n` : "K\n";

                        // Send response back to Arduino LCD
                        if (port.writable) {
                            const writer = port.writable.getWriter();
                            await writer.write(new TextEncoder().encode(responseToArduino));
                            writer.releaseLock();
                            console.log("Sent to Arduino:", responseToArduino);
                        }

                        setTimeout(() => { serverMsg.innerText = ""; }, 3000);
                    });
                }
            }
        }
    } catch (err) { 
        console.error("Serial Error:", err);
        statusSpn.innerText = "ERROR";
        statusSpn.style.color = "red";
    }
});
