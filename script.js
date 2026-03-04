const GOOGLE_URL = "https://script.google.com/macros/s/AKfycbzaGdnRjCc9blj2KsYA1jbtd61b1FmByEn_wLKrFxh-dWgK_XAlgR1PA80QUie_LHcv/exec";

const connectBtn = document.getElementById('connectBtn');
const statusSpn = document.getElementById('status');
const lastIDSpn = document.getElementById('lastID');
const serverMsg = document.getElementById('serverMsg');

connectBtn.addEventListener('click', async () => {
  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    
    statusSpn.innerText = "CONNECTED";
    statusSpn.style.color = "green";
    connectBtn.style.opacity = "0.5";
    connectBtn.innerText = "Listening...";

    const textDecoder = new TextDecoderStream();
    port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();

    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += value;

      if (buffer.includes("\n")) {
        const cleanID = buffer.trim();
        buffer = "";

        // Check if the input is a valid ID (like 827345)
        if (cleanID.length >= 5) {
          lastIDSpn.innerText = cleanID;
          serverMsg.innerText = "Syncing with Google Sheets...";

          fetch(`${GOOGLE_URL}?id=${cleanID}`, { mode: 'no-cors' })
            .then(() => {
              serverMsg.innerText = "✅ SUCCESS: Logged " + cleanID;
              setTimeout(() => { serverMsg.innerText = ""; }, 4000);
            })
            .catch(err => {
              serverMsg.innerText = "❌ Google Error";
              serverMsg.style.color = "red";
            });
        }
      }
    }
  } catch (err) {
    statusSpn.innerText = "Error: Check Connection";
    statusSpn.style.color = "red";
  }
});
