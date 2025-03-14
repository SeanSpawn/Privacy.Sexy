// Initializes Electron's main process, always runs in the background, and manages the main window.

import {
  app, protocol, BrowserWindow, screen,
} from 'electron/main';
import { shell } from 'electron/common';
import log from 'electron-log/main';
import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer';
import { validateRuntimeSanity } from '@/infrastructure/RuntimeSanity/SanityChecks';
import { ElectronLogger } from '@/infrastructure/Log/ElectronLogger';
import { setupAutoUpdater } from './Update/UpdateInitializer';
import {
  APP_ICON_PATH, IS_DEVELOPMENT, PRELOADER_SCRIPT_PATH,
} from './ElectronConfig';
import { registerAllIpcChannels } from './IpcRegistration';
import { loadWindowContents } from './WindowContentLoader';

const hideWindowUntilLoaded = true;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win: BrowserWindow | null;

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } },
]);

setupLogger();

validateRuntimeSanity({
  // Metadata is used by manual updates.
  validateEnvironmentVariables: true,

  // Environment is populated by the preload script and is in the renderer's context;
  // it's not directly accessible from the main process.
  validateWindowVariables: false,
});

async function createWindow() {
  // Create the browser window.
  const size = getWindowSize(1650, 955);
  win = new BrowserWindow({
    width: size.width,
    height: size.height,
    webPreferences: {
      nodeIntegration: true, // disabling does not work with electron-vite, https://electron-vite.org/guide/dev.html#nodeintegration
      contextIsolation: true,
      preload: PRELOADER_SCRIPT_PATH,
    },
    icon: APP_ICON_PATH,
    show: !hideWindowUntilLoaded,
  });
  focusAndShowOnceLoaded(win);
  win.setMenuBarVisibility(false);
  configureExternalsUrlsOpenBrowser(win);
  win.on('closed', () => {
    win = null;
  });
  await loadWindowContents(win);
}

configureAppQuitBehavior();
registerAllIpcChannels();

app.whenReady().then(async () => {
  await initializeApplication(app);
});

// Exit cleanly on request from parent process in development mode.
if (IS_DEVELOPMENT) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit();
      }
    });
  } else {
    process.on('SIGTERM', () => {
      app.quit();
    });
  }
}

async function initializeApplication(
  electronApp: Electron.App,
) {
  await installVueDevTools();
  await Promise.allSettled([
    createWindow(),
    checkForUpdates(),
  ]);
  electronApp.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      createWindow();
    }
  });
}

async function installVueDevTools() {
  if (!IS_DEVELOPMENT) {
    return;
  }
  try {
    await installExtension(VUEJS_DEVTOOLS);
  } catch (e) {
    ElectronLogger.error('Vue Devtools failed to install:', e.toString());
  }
}

async function checkForUpdates() {
  if (IS_DEVELOPMENT) {
    ElectronLogger.debug('Development Mode: Skipping automatic update checks');
    return;
  }
  const updater = setupAutoUpdater();
  await updater.checkForUpdates();
}

function configureExternalsUrlsOpenBrowser(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function getWindowSize(idealWidth: number, idealHeight: number) {
  let { width, height } = screen.getPrimaryDisplay().workAreaSize;
  // To ensure not creating a screen bigger than current screen size
  // Not using "enableLargerThanScreen" as it's macOS only (see https://www.electronjs.org/docs/api/browser-window)
  width = Math.min(width, idealWidth);
  height = Math.min(height, idealHeight);
  return { width, height };
}

function setupLogger(): void {
  // log.initialize(); ← We inject logger to renderer through preloader, this is not needed.
  log.transports.file.level = 'silly';
  log.eventLogger.startLogging();
}

function configureAppQuitBehavior() {
  let macOsQuit = false;
  // Quit when all windows are closed.
  app.on('window-all-closed', () => {
    if (process.platform === 'darwin'
      && !macOsQuit) {
      /*
        On macOS it is common for applications and their menu bar
        to stay active until the user quits explicitly with Cmd + Q
      */
      return;
    }
    app.quit();
  });
  if (process.platform === 'darwin') {
    /*
      On macOS we application quit is stopped if user does not Cmd + Q
      But we still want to be able to use app.quit() and quit the application
      on menu bar, after updates etc.
    */
    app.on('before-quit', () => {
      macOsQuit = true;
    });
  }
}

function focusAndShowOnceLoaded(window: BrowserWindow) {
  window.once('ready-to-show', () => {
    window.show(); // Shows and focuses
    bringToFront(window);
  });
}

function bringToFront(window: BrowserWindow) {
  // Only needed for Windows, tested on GNOME 42.5, Windows 11 23H2 Pro and macOS Sonoma 14.4.1.
  // Some report it's also needed for some versions of GNOME.
  // - https://github.com/electron/electron/issues/2867#issuecomment-409858459
  // - https://github.com/signalapp/Signal-Desktop/blob/0999df2d6e93da805b2135f788ffc739ba69832d/app/SystemTrayService.ts#L277-L284
  window.setAlwaysOnTop(true);
  window.setAlwaysOnTop(false);
}
