const GOOGLE_URL = "https://script.google.com/macros/s/AKfycbxshlkitd9gapxoN6gdkguZp8diyy1Mo8I_hNwWRXScMvQooxv_IuEl6vFpFyhYjvBz/exec";

const connectBtn = document.getElementById('connectBtn');
const statusSpn = document.getElementById('status');
const lastIDSpn = document.getElementById('lastID');
const serverMsg = document.getElementById('serverMsg');

let port; // Global variable to keep the connection alive

connectBtn.addEventListener('click', async () => {
    try {
        // 1. Request and open the Serial Port
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        
        statusSpn.innerText = "CONNECTED";
        statusSpn.style.color = "green";
        connectBtn.innerText = "LISTENING FOR SCANS...";
        connectBtn.style.opacity = "0.5";
        connectBtn.disabled = true; // Disable button after connection

        // 2. Setup the reader to listen to Arduino
        const textDecoder = new TextDecoderStream();
        port.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();

        let buffer = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += value;

            // 3. Process data when a full line (newline) arrives
            if (buffer.includes("\n")) {
                const rawData = buffer.trim(); // Format: "ID,MODE"
                buffer = "";

                if (rawData.includes(",")) {
                    const [tagID, mode] = rawData.split(",");
                    
                    lastIDSpn.innerText = tagID;
                    serverMsg.innerText = "Processing Scan...";

                    // 4. Construct the Google Sheets URL
                    const finalUrl = `${GOOGLE_URL}?id=${encodeURIComponent(tagID)}&mode=${mode}`;

                    // 5. Send data to Google Sheets
                    fetch(finalUrl, { mode: 'no-cors' })
                        .then(async () => {
                            serverMsg.innerText = `✅ Logged ${tagID} as ${mode}`;
                            
                            // --- HANDSHAKE: Send 'K' to unlock the Arduino ---
                            if (port.writable) {
                                const writer = port.writable.getWriter();
                                const data = new TextEncoder().encode("K");
                                await writer.write(data);
                                writer.releaseLock(); // Important: Release so next scan can use it
                            }
                            
                            // Clear message after 3 seconds
                            setTimeout(() => { serverMsg.innerText = ""; }, 3000);
                        })
                        .catch(err => {
                            serverMsg.innerText = "❌ Sync Error";
                            console.error("Fetch Error:", err);
                        });
                }
            }
        }
    } catch (err) {
        console.error("Serial Error:", err);
        statusSpn.innerText = "Connection Failed. Use HTTPS!";
        statusSpn.style.color = "red";
    }
});
