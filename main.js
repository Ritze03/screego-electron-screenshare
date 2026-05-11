const { app, BrowserWindow, desktopCapturer, session, shell } = require("electron");
const fs = require('fs');
const { execSync, spawn } = require('child_process');
const net = require('net');

const PID_FILE = '/tmp/screego-electron-screenshare.pid';
const URL_FILE = '/tmp/screego-electron-screenshare.url';
const SOCKET_FILE = '/tmp/screego-electron-screenshare.sock';

function isRunning() {
    if (fs.existsSync(PID_FILE)) {
        const pid = fs.readFileSync(PID_FILE, 'utf8').trim();
        try {
            process.kill(pid, 0);
            return true;
        } catch (e) {
            fs.unlinkSync(PID_FILE);
            return false;
        }
    }
    return false;
}

const args = process.argv;

if (!args.includes('--daemon')) {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-software-rasterizer');
    app.commandLine.appendSwitch('disable-dev-shm-usage');
}

const openIndex = args.indexOf('--open');
const openUrl = openIndex !== -1 && openIndex + 1 < args.length ? args[openIndex + 1] : null;

if (args.includes('--open') && !openUrl) {
    console.error("Error: --open requires a URL argument.");
    process.exit(1);
}

if (args.includes('--status')) {
    console.log(isRunning() ? "Active" : "Inactive");
    process.exit(0);
}

if (args.includes('--url')) {
    if (isRunning()) {
        if (fs.existsSync(URL_FILE)) {
            console.log(fs.readFileSync(URL_FILE, 'utf8').trim());
        } else {
            console.error("Error: Stream is active but URL is not available yet.");
            process.exit(1);
        }
    } else {
        console.error("Error: Not active.");
        process.exit(1);
    }
    process.exit(0);
}

if (args.includes('--stop')) {
    if (isRunning()) {
        const pid = fs.readFileSync(PID_FILE, 'utf8').trim();
        try { execSync(`pkill -P ${pid} 2>/dev/null`); } catch (e) { }
        try { process.kill(pid); } catch (e) { }
        if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
        if (fs.existsSync(URL_FILE)) fs.unlinkSync(URL_FILE);
        if (fs.existsSync(SOCKET_FILE)) fs.unlinkSync(SOCKET_FILE);
        console.log("Instance stopped.");
    } else {
        if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
        if (fs.existsSync(URL_FILE)) fs.unlinkSync(URL_FILE);
        if (fs.existsSync(SOCKET_FILE)) fs.unlinkSync(SOCKET_FILE);
        console.log("No instance running.");
    }
    process.exit(0);
}

if (args.includes('--restart')) {
    if (isRunning()) {
        console.log("Restarting instance...");
        const pid = fs.readFileSync(PID_FILE, 'utf8').trim();
        try { execSync(`pkill -P ${pid} 2>/dev/null`); } catch (e) { }
        try { process.kill(pid); } catch (e) { }
        if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
        if (fs.existsSync(URL_FILE)) fs.unlinkSync(URL_FILE);
        if (fs.existsSync(SOCKET_FILE)) fs.unlinkSync(SOCKET_FILE);
        console.log("Instance stopped.");
    }
    args.push('--start');
}

if (!args.includes('--daemon') && args.includes('--open') && isRunning()) {
    sendCommand(`open ${openUrl}`, `Opening URL in active instance: ${openUrl}`);
    return;
}

if (!args.includes('--daemon') && (args.includes('--start') || args.includes('--open'))) {
    if (isRunning()) {
        console.error("Error: screego-electron-screenshare is already running.");
        process.exit(1);
    }

    if (fs.existsSync(URL_FILE)) fs.unlinkSync(URL_FILE);
    if (fs.existsSync(SOCKET_FILE)) fs.unlinkSync(SOCKET_FILE);

    // Spawn background process
    const isPackaged = app.isPackaged;
    const execPath = process.execPath;
    const spawnArgs = isPackaged ? ['--daemon'] : [__filename, '--daemon'];
    if (openUrl) spawnArgs.push('--open', openUrl);

    const child = spawn(execPath, spawnArgs, {
        detached: true,
        stdio: 'ignore'
    });

    child.unref();
    fs.writeFileSync(PID_FILE, child.pid.toString());

    console.log("Starting screen sharing session...");

    let tries = 0;
    const checkInterval = setInterval(() => {
        if (fs.existsSync(URL_FILE)) {
            const url = fs.readFileSync(URL_FILE, 'utf8').trim();
            console.log("Success! Stream URL:", url);
            clearInterval(checkInterval);
            process.exit(0);
        }
        tries++;
        if (tries >= 30) {
            console.error("Error: Timed out waiting for stream to start.");
            try { process.kill(child.pid); } catch (e) { }
            if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
            clearInterval(checkInterval);
            process.exit(1);
        }
    }, 1000);

    // Return here so we don't start the electron app code in this CLI instance
    return;
}

function sendCommand(cmd, successMsg) {
    if (!isRunning()) {
        console.error("Error: Not active.");
        process.exit(1);
    }
    if (!fs.existsSync(SOCKET_FILE)) {
        console.error("Error: Daemon socket not found.");
        process.exit(1);
    }
    const client = net.createConnection({ path: SOCKET_FILE }, () => {
        client.write(cmd);
        client.end();
        console.log(successMsg);
        process.exit(0);
    });
    client.on('error', (err) => {
        console.error("Error connecting to daemon:", err.message);
        process.exit(1);
    });
}

if (args.includes('--show')) {
    sendCommand('show', 'Window visibility set to: SHOW');
    return;
}

if (args.includes('--hide')) {
    sendCommand('hide', 'Window visibility set to: HIDE');
    return;
}

if (args.includes('--toggle-show')) {
    sendCommand('toggle', 'Window visibility toggled.');
    return;
}

if (args.includes('--restart-stream')) {
    sendCommand('restart-stream', 'Restarting stream in the active room...');
    return;
}

if (!args.includes('--daemon')) {
    console.log("Usage: screego-electron-screenshare {--start|--open <URL>|--status|--url|--stop|--restart|--show|--hide|--toggle-show|--restart-stream}");
    process.exit(1);
}

// ---------------- DAEMON MODE ---------------- //

async function startSession(win, url) {
    console.log(`Starting session with URL: ${url || "https://app.screego.net/"}`);
    await win.loadURL(url || "https://app.screego.net/");

    // Wait for the site to load
    await new Promise(r => setTimeout(r, 3000));

    // Step 1: Click "Create or Join a Room" if it exists
    const step1 = await win.webContents.executeJavaScript(`
        (() => {
            const buttons = Array.from(document.querySelectorAll("button"));
            const button = buttons.find(b => b.textContent.trim().includes("Create or Join a Room"));

            if (!button) {
                return { success: false, reason: "Button not found" };
            }

            button.click();

            return {
                success: true,
                buttonText: button.textContent.trim()
            };
        })();
    `);

    console.log("Step 1 (Create/Join Room):", step1);

    if (step1.success) {
        // Wait for the page URL to contain "?room=" (event-driven, up to 10s)
        try {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("Timed out waiting for room URL")), 10000);
                const check = setInterval(async () => {
                    if (win.isDestroyed()) {
                        clearInterval(check);
                        return;
                    }
                    const currentUrl = await win.webContents.executeJavaScript("window.location.href");
                    if (currentUrl.includes("?room=")) {
                        clearInterval(check);
                        clearTimeout(timeout);
                        resolve();
                    }
                }, 500);
            });
        } catch (e) {
            console.error(e.message);
        }
    }

    // Poll for the Start Presentation button to appear (up to 5s)
    let buttonFound = false;
    for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (win.isDestroyed()) return;
        buttonFound = await win.webContents.executeJavaScript(`
            !!document.querySelector('button[aria-label="Start Presentation"]')
        `);
        if (buttonFound) break;
    }

    if (!win.isDestroyed()) {
        win.webContents.sendInputEvent({ type: 'mouseMove', x: 100, y: 100 });
    }

    // Step 2: Click "Start Presentation" button (identified by aria-label)
    const step2 = await win.webContents.executeJavaScript(`
        (async () => {
            window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 100, clientY: 100 }));
            await new Promise(r => setTimeout(r, 100));
            const button = document.querySelector('button[aria-label="Start Presentation"]');

            if (!button) {
                return {
                    success: false,
                    error: "Start Presentation button not found"
                };
            }

            button.click();

            return {
                success: true,
                buttonLabel: button.getAttribute("aria-label"),
                url: window.location.href
            };
        })();
    `);

    console.log("Step 2 (Start Presentation):", step2);

    if (step2.success) {
        // Write the URL to a file so the wrapper script can read it
        fs.writeFileSync(URL_FILE, step2.url);
        console.log("Ready:", step2.url);
    }
}

async function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false, // Run headlessly
        webPreferences: {
            contextIsolation: true,
            backgroundThrottling: false // Keep page running at full speed when hidden
        }
    });

    if (fs.existsSync(SOCKET_FILE)) fs.unlinkSync(SOCKET_FILE);
    const server = net.createServer((c) => {
        c.on('data', (data) => {
            const cmd = data.toString().trim();
            if (cmd === 'show') {
                if (!win.isDestroyed()) win.show();
            } else if (cmd === 'hide') {
                if (!win.isDestroyed()) win.hide();
            } else if (cmd === 'toggle') {
                if (!win.isDestroyed()) {
                    if (win.isVisible()) win.hide();
                    else win.show();
                }
            } else if (cmd === 'restart-stream') {
                if (!win.isDestroyed()) {
                    win.webContents.sendInputEvent({ type: 'mouseMove', x: 100, y: 100 });
                    win.webContents.executeJavaScript(`
                        (async () => {
                            window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 100, clientY: 100 }));
                            await new Promise(r => setTimeout(r, 100));
                            const getBtn = () => document.querySelector('button[aria-label="Cancel Presentation"], button[aria-label="Start Presentation"]');
                            let btn = getBtn();
                            if (btn) {
                                btn.click();
                                await new Promise(r => setTimeout(r, 100));
                                btn = getBtn();
                                if (btn) btn.click();
                            }
                        })();
                    `).catch(console.error);
                }
            } else if (cmd.startsWith('open ')) {
                const url = cmd.substring(5).trim();
                if (!win.isDestroyed()) {
                    startSession(win, url).catch(console.error);
                }
            }
        });
    });
    server.listen(SOCKET_FILE);

    // Allow screen capture: intercept getDisplayMedia() calls from the page
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
            // Pick the first available screen
            callback({ video: sources[0], audio: "loopback" });
        }).catch((err) => {
            console.error("desktopCapturer error:", err);
            callback({});
        });
    });

    await startSession(win, openUrl);
}

app.whenReady().then(createWindow);
