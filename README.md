# Screego Electron Screenshare

A completely headless, daemonized Electron wrapper for starting screen sharing sessions on [Screego](https://app.screego.net/) directly from your terminal.

This project bypasses browser restrictions by utilizing Electron's native `desktopCapturer` to automatically select and stream your display without any visual windows or manual confirmation dialogues getting in your way.

## Features

- **Headless:** Runs completely in the background without spawning any visible windows.
- **Automated:** Automatically clicks through the Screego UI to create a room and start presenting.
- **Daemonized CLI:** Built into a single executable that spawns background tasks and returns the URL.
- **Single Instance:** Prevents multiple streams from colliding.

## Building from Source

To compile the standalone executable yourself:

```bash
# Install dependencies
npm install

# Build the Linux AppImage
npm run build
```

The resulting executable will be placed in the `dist/` directory.

## Usage

If you have the bundled executable, you can use the following commands:

```bash
# Start a background screen sharing session and get the room URL
./screego-electron-screenshare --start

# Get the current room URL if a session is active
./screego-electron-screenshare --url

# Check if a session is currently running (returns Active / Inactive)
./screego-electron-screenshare --status

# Stop the current session and restart it
./screego-electron-screenshare --restart

# Kill the background session
./screego-electron-screenshare --stop
```

### Global Installation (Optional)

If you'd like to use the command anywhere on your system, you can move the compiled binary to your `/usr/bin`:

```bash
wget -o screego-electron-screenshare https://github.com/Ritze03/screego-electron-screenshare/releases/download/v1.0-AppImage/screego-electron-screenshare
chmod +x screego-electron-screenshare
sudo mv screego-electron-screenshare /usr/bin/
```

or

```bash
wget -o screego-electron-screenshare https://github.com/Ritze03/screego-electron-screenshare/releases/download/v1.0-AppImage/screego-electron-screenshare
chmod +x screego-electron-screenshare
sudo mv screego-electron-screenshare /usr/local/bin/
```
