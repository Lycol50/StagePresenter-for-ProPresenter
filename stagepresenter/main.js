// Modules to control application life and create native browser window
const { app, BrowserWindow, BrowserView, screen, ipcMain, Menu, shell } = require('electron')
let dummyWindow = undefined
let waitingForDisplay = undefined
let stagePresenterWindow = undefined
let settingsWindow = undefined
let operatorWindow = undefined
let welcomeWindow = undefined
let screenConfigChangedTimeout = undefined

// App Icon color: #3478F6 - #53B6F9
// App Icon middle color: #4497f8

// setUserTasks is only available on windows
if (app.setUserTasks) {
	// Windows menu when right click on app icon
	app.setUserTasks([
		{
			program: process.execPath,
			arguments: '--open=settings',
			iconPath: process.execPath,
			iconIndex: 0,
			title: 'Open Settings',
			description: 'Open the settings window'
		},
		{
			program: process.execPath,
			arguments: '--open=controller',
			iconPath: process.execPath,
			iconIndex: 0,
			title: 'Open Controller',
			description: 'Open the controller window'
		}
	])

	const additionalData = { open: app.commandLine.getSwitchValue('open') }
	if (!app.requestSingleInstanceLock(additionalData)) {
		// This is not the first instance of this application
		// The first instance of this application has been notified.
		console.log("Another instance of this application is already running. Quitting now.")
		app.quit()
	} else {
		app.on("second-instance", (event, commandLine, workingDirectory, additionalData) => {
			console.log("second-instance")
			if (app.dock) {
				app.dock.bounce()
			}
			if (additionalData.open) {
				if (additionalData.open == "settings") {
					createSettingsWindow()
				} else if (additionalData.open == "controller") {
					createOperatorWindow()
				} else {
					console.log("Unexpected additionalData.open", additionalData.open)
				}
			} else {
				console.log("Unexpected additionalData", additionalData)
			}
		})
	}
}

if (!app.isPackaged) {
	// Enable live reload for Electron too
	require('electron-reload')(__dirname, {
		// Note that the path to electron may vary according to the main file
		electron: require(`${__dirname}/node_modules/electron`)
	})
}

app.setAboutPanelOptions({ authors: ['Tim Vogel, Frizth Lyco Tatierra (princepines)'] })

ipcMain.on('displaySelected', (event) => {
	if (stagePresenterWindow && !stagePresenterWindow.isDestroyed()) {
		stagePresenterWindow.close()
	}

	localStorageGet('showOnDisplay').then(displayId => {
		if (displayId == "window") {
			createStagePresenterWindow(undefined)
			waitingForDisplay = false
		} else {
			const allDisplays = screen.getAllDisplays()
			if (allDisplays.length > 1) {
				const display = getDisplayById(displayId, allDisplays)
				if (display) {
					createStagePresenterWindow(display.bounds)
				}
			}
		}
	})
})
ipcMain.handle('get-open-at-login', (event) => app.getLoginItemSettings().openAtLogin)
ipcMain.handle('is-stagepresenter-window-visible', (event) => {
	return stagePresenterWindow != undefined && !stagePresenterWindow.isDestroyed() && stagePresenterWindow.isVisible()
})
ipcMain.handle('get-all-displays', (event) => screen.getAllDisplays())
ipcMain.handle('get-primary-display-id', (event) => screen.getPrimaryDisplay().id)
ipcMain.handle('set-login-item-settings', (event, settings) => app.setLoginItemSettings(settings))
ipcMain.handle('get-stage-presenter-window-zoom-factor', (event) => {
	if (stagePresenterWindow && !stagePresenterWindow.isDestroyed() && stagePresenterWindow.webContents) {
		return stagePresenterWindow.webContents.zoomFactor
	}
	return -1
})
ipcMain.handle('set-stage-presenter-window-zoom-factor', (event, zoomFactor) => {
	if (stagePresenterWindow && !stagePresenterWindow.isDestroyed() && stagePresenterWindow.webContents) {
		stagePresenterWindow.webContents.setZoomFactor(zoomFactor)
		return true
	}
	return false
})

async function createStagePresenterWindow(displayBounds) {
	if (stagePresenterWindow && !stagePresenterWindow.isDestroyed()) {
		stagePresenterWindow.close()
	}

	if (displayBounds) {
		localStorageSet("stagePresenterWindowModeWindowBounds", '')
		localStorageSet("stagePresenterWindowModeWindowFullscreen", 'false')
		stagePresenterWindow = new BrowserWindow({
			x: displayBounds.x,
			y: displayBounds.y,
			width: displayBounds.width,
			height: displayBounds.height,
			backgroundColor: '#000000',
			darkTheme: true,
			fullscreen: true,
			title: 'StagePresenter',
			titleBarStyle: 'hidden', // For Windows, to not show File, Edit, ... bar
			show: false
		})
	} else {
		let bounds = { x: undefined, y: undefined, width: 4096, height: 2304 }
		const boundsValue = await localStorageGet("stagePresenterWindowModeWindowBounds")
		try {
			if (boundsValue != undefined && boundsValue.length > 0) {
				const v = boundsValue.split(';')
				const b = {
					x: parseInt(v[0]), y: parseInt(v[1]),
					width: parseInt(v[2]), height: parseInt(v[3])
				}
				const display = screen.getDisplayMatching(b)
				const intersectAmount = rectIntersectionAmount(display.bounds, b)
				if (intersectAmount / (b.width * b.height) > 0.5) {
					bounds = b
				}
			}
		} catch (e) {
			console.log("Error parsing stagePresenterWindowModeWindowBounds", e)
		}
		const isFullscreen = await localStorageGet("stagePresenterWindowModeWindowFullscreen") == 'true'

		stagePresenterWindow = new BrowserWindow({
			x: bounds.x,
			y: bounds.y,
			width: bounds.width,
			height: bounds.height,
			minWidth: 640,
			minHeight: 360,
			backgroundColor: '#000000',
			darkTheme: true,
			fullscreenable: true,
			fullscreen: isFullscreen,
			title: 'StagePresenter',
			show: false,
		})
	}
	stagePresenterWindow.webContents.setMaxListeners(100)

	const isMac = process.platform === 'darwin'
	if (isMac && displayBounds != undefined) {
		// When showing the operator window, this line is important to keep the
		// stagePresenterWindow always in fullscreen always on top on mac os
		stagePresenterWindow.setAlwaysOnTop(true, "pop-up-menu")
		function move(ev) {
			waitingForDisplay = true
			stagePresenterWindow.removeListener('move', move)
			stagePresenterWindow.close()
			stagePresenterWindow = undefined
			screenConfigChanged()
		}
		stagePresenterWindow.on('move', move)
	}

	stagePresenterWindow.loadFile(`${__dirname}/application/stagePresenter.html`)

	stagePresenterWindow.once('close', function (ev) {
		try {
			if (ev.sender === stagePresenterWindow) {
				if (move && displayBounds != undefined) {
					stagePresenterWindow.removeListener('move', move)
				} else {
					const b = stagePresenterWindow.getBounds()
					const value = b.x + ";" + b.y + ";" + b.width + ";" + b.height
					localStorageSet("stagePresenterWindowModeWindowBounds", value)
					const fullscreen = stagePresenterWindow.isFullScreen()
					localStorageSet("stagePresenterWindowModeWindowFullscreen", fullscreen)
				}

				stagePresenterWindow = undefined
				if (operatorWindow != undefined && !operatorWindow.isDestroyed()) {
					operatorWindow.close()
				}
			}
		} catch (e) {
			console.log('stagePresenterWindow close did not work', e)
		}
	})
	stagePresenterWindow.once('closed', function (ev) {
		checkIfShouldQuit()
		if (settingsWindow && !settingsWindow.isDestroyed()) {
			settingsWindow.webContents.send('updateDisplays')
		}
		if (welcomeWindow && !welcomeWindow.isDestroyed()) {
			welcomeWindow.webContents.send('updateDisplays')
		}
		if (operatorWindow && !operatorWindow.isDestroyed()) {
			operatorWindow.close()
		}
	})
	stagePresenterWindow.webContents.setWindowOpenHandler(
		details => {
			if (details.url.endsWith("settings.html")) {
				if (stagePresenterWindow.isFullScreen()) {
					const b = stagePresenterWindow.getBounds()
					const display = screen.getDisplayMatching(b)
					const primaryDisplay = screen.getPrimaryDisplay()
					if (display.id == primaryDisplay.id) {
						stagePresenterWindow.close()
					}
				}
				createSettingsWindow()
			} else if (details.url.endsWith("operator.html")) {
				createOperatorWindow()
			}
			return { action: 'deny' }
		}
	)

	// TODO: Windows Set Overlay Icon based on connection status?
	// TODO: Windows Set Thumbbar Icons
	stagePresenterWindow.show()

	localStorageGet("showOperatorWindow").then(showOperatorWindow => {
		if (showOperatorWindow == 'true') {
			createOperatorWindow()
		}
	})
}

function createSettingsWindow() {
	if (settingsWindow && !settingsWindow.isDestroyed()) {
		settingsWindow.close()
	}

	settingsWindow = new BrowserWindow({
		backgroundColor: '#000000',
		darkTheme: true,
		title: 'StagePresenter Settings',
		width: 1024,
		height: 800,
		fullscreenable: false,
		maximizable: false,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false
		}
	})
	settingsWindow.loadFile(`${__dirname}/application/settings.html`)
	settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url)
		return { action: 'deny' }
	})
	settingsWindow.once('closed', function (ev) {
		checkIfShouldQuit()
	})
}

function createWelcomeWindow() {
	if (welcomeWindow && !welcomeWindow.isDestroyed()) {
		welcomeWindow.close()
	}

	welcomeWindow = new BrowserWindow({
		backgroundColor: '#000000',
		darkTheme: true,
		title: 'Welcome to StagePresenter',
		width: 1024,
		height: 800,
		center: true,
		fullscreenable: true,
		maximizable: false,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false
		}
	})
	welcomeWindow.loadFile(`${__dirname}/application/index.html`)
	welcomeWindow.once('closed', function (ev) {
		checkIfShouldQuit()
	})
}

async function createOperatorWindow() {
	// It is required to hide the dock, to show the Operator Window above other Fullscreen Windows
	// https://syobochim.medium.com/electron-keep-apps-on-top-whether-in-full-screen-mode-or-on-other-desktops-d7d914579fce
	// Needs to be done before operatorWindow is created
	if (app.dock) {
		app.dock.hide()
	}

	if (operatorWindow && !operatorWindow.isDestroyed()) {
		operatorWindow.close()
	}

	const boundsValue = await localStorageGet("operatorWindowBounds")

	let bounds = { x: undefined, y: undefined, width: 350, height: 124 }
	const isMac = process.platform === 'darwin'
	if (isMac) {
		bounds.height = 108
	}

	if (boundsValue != undefined && boundsValue.length > 0) {
		// TODO: avoid controller is behind Stagemonitor
		const v = boundsValue.split(';')
		const b = {
			x: parseInt(v[0]), y: parseInt(v[1]),
			width: parseInt(v[2]), height: parseInt(v[3])
		}
		const display = screen.getDisplayMatching(b)
		let intersectsWithStagePresenterWindow = false
		if (stagePresenterWindow != undefined && !stagePresenterWindow.isDestroyed()) {
			const stagePresenterBounds = stagePresenterWindow.getBounds()
			const intersectAmount = rectIntersectionAmount(stagePresenterBounds, b)
			intersectsWithStagePresenterWindow = intersectAmount > 0
		}
		if (!intersectsWithStagePresenterWindow) {
			const intersectAmount = rectIntersectionAmount(display.bounds, b)
			if (intersectAmount / (b.width * b.height) > 0.5) {
				bounds = b
			}
		}
	}

	operatorWindow = new BrowserWindow({
		backgroundColor: '#000000',
		opacity: 0.7,
		darkTheme: true,
		title: 'StagePresenter Controller',
		minWidth: 80,
		minHeight: 108,
		maxHeight: 256,
		x: bounds.x,
		y: bounds.y,
		width: bounds.width,
		height: bounds.height,
		show: false, // Important!
		alwaysOnTop: true,
		fullscreen: false,
		maximizable: false,
		autoHideMenuBar: true
	})
	// Important to set visible on all workspaces with visibleOnFullScreen
	operatorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
	operatorWindow.loadFile(`${__dirname}/application/operator.html`)
	// Show window after setting things up
	operatorWindow.show()
	localStorageSet("showOperatorWindow", true)

	// Set initial position to the bottom right
	if (bounds.x == undefined || bounds.y == undefined) {
		const pos = operatorWindow.getPosition()
		const display = screen.getDisplayNearestPoint({ x: pos[0], y: pos[1] })
		const isMac = process.platform === 'darwin'
		const workArea = isMac ? display.bounds : display.workArea
		bounds.x = workArea.x + workArea.width - bounds.width
		bounds.y = workArea.y + workArea.height - bounds.height
	}
	// Always set the position explicitly, because mac is reluctant sometimes
	operatorWindow.setPosition(bounds.x, bounds.y, true)

	// Show dock again
	if (app.dock) {
		app.dock.show()
	}

	operatorWindow.on('focus', function () {
		if (operatorWindow && !operatorWindow.isDestroyed()) {
			operatorWindow.setOpacity(1)
		}
	})
	operatorWindow.on('blur', function () {
		if (operatorWindow && !operatorWindow.isDestroyed()) {
			operatorWindow.setOpacity(0.7)
		}
	})
	operatorWindow.once('close', function (ev) {
		if (ev.sender === operatorWindow) {
			const b = operatorWindow.getBounds()
			const value = b.x + ";" + b.y + ";" + b.width + ";" + b.height
			localStorageSet("operatorWindowBounds", value)
			operatorWindow = undefined
			setTimeout(function () {
				if (stagePresenterWindow != undefined && !stagePresenterWindow.isDestroyed()) {
					console.log("showOperatorWindow -> false")
					// stagePresenterWindow window has not been destroyed
					// This means only the operator window was closed
					// Therefore do not show it automatically, next time
					localStorageSet("showOperatorWindow", false)
				}
			}, 0)
		}
	})
	operatorWindow.once('closed', function (ev) {
		checkIfShouldQuit()
	})
}

function screenConfigChanged() {
	clearTimeout(screenConfigChangedTimeout)
	screenConfigChangedTimeout = setTimeout(async () => {
		if (settingsWindow && !settingsWindow.isDestroyed()) {
			settingsWindow.webContents.send('updateDisplays')
		}

		if (waitingForDisplay) {
			const displayId = await localStorageGet('showOnDisplay')
			const allDisplays = screen.getAllDisplays()
			if (displayId && displayId !== '-1' && allDisplays.length > 1) {
				const display = getDisplayById(displayId, allDisplays)
				if (display) {
					waitingForDisplay = false
					createStagePresenterWindow(display.bounds)
				} else {
					console.log('Still waiting for display (a)')
				}
			} else {
				console.log('Still waiting for display (b)')
			}
		}
	}, 2000)
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
	const { initApplicationMenu } = require('./init_application_menu')
	initApplicationMenu(app, Menu)

	if (app.dock) {
		const dockMenu = Menu.buildFromTemplate([
			{
				label: 'Open Settings',
				click() { createSettingsWindow() }
			},
			{
				label: 'Open Controller',
				click() { createOperatorWindow() }
			},
			{
				label: 'View Tips and Tricks Document',
				click() { shell.openExternal('https://github.com/tim4724/StagePresenter-for-ProPresenter/blob/main/tips_and_tricks.md#tips-and-tricks-for-stagepresenter') }
			}
		])
		app.dock.setMenu(dockMenu)
	}

	dummyWindow = new BrowserWindow({
		show: false,
		title: 'dummyWindow',
		paintWhenInitiallyHidden: false,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true
		}
	})
	dummyWindow.loadFile(__filename)

	screen.on('display-removed', screenConfigChanged)
	screen.on('display-added', screenConfigChanged)
	screen.on('display-metrics-changed', screenConfigChanged)

	try {
		const version = await localStorageGet('localStorageVersion')
		if (version == undefined || version.length <= 0) {
			const featuresString = await localStorageGet('features')
			if (featuresString) {
				let features = featuresString.split(' ')
				features.push('doNotShowDisabledSlides')
				await localStorageSet('features', features.join(' '))
			}
			await localStorageSet('localStorageVersion', '1')
		} else if (parseInt(version) <= 1) {
			const sidebarSize = await localStorageGet('sidebarMaxSize')
			if (sidebarSize) {
				await localStorageSet('sidebarSize', sidebarSize)
				await localStorageSet('sidebarMaxSize', undefined)
			}
			await localStorageSet('localStorageVersion', '2')
		}
	} catch (e) {
		console.log("localStorageVersionCheckFailed", e)
	}

	const displayId = await localStorageGet('showOnDisplay')
	if (displayId !== undefined && displayId !== '-1') {
		if (displayId == "window") {
			createStagePresenterWindow(undefined)
		} else {
			const allDisplays = screen.getAllDisplays()
			if (allDisplays.length <= 1) {
				waitingForDisplay = false
				createWelcomeWindow()
			} else {
				const display = getDisplayById(displayId, allDisplays)
				if (display) {
					waitingForDisplay = false
					createStagePresenterWindow(display.bounds)
				} else {
					console.log('Waiting for Display', displayId)
					waitingForDisplay = true
				}
			}
		}
	} else {
		waitingForDisplay = false
		createWelcomeWindow()
	}
})

app.on('window-all-closed', () => {
	if (!waitingForDisplay) {
		app.quit()
	}
})

function checkIfShouldQuit() {
	if (waitingForDisplay) {
		return
	}
	const wins = BrowserWindow.getAllWindows()
	if (wins.length === 0 || (wins.length == 1 && wins[0] === dummyWindow)) {
		app.quit()
	} else if (wins.length === 2) {
		if (wins[0] === dummyWindow && wins[1] === operatorWindow ||
			wins[1] === dummyWindow && wins[0] === operatorWindow) {
			app.quit()
		}
	}
}

function localStorageGet(key) {
	return dummyWindow.webContents.executeJavaScript('localStorage.' + key)
}

function localStorageSet(key, value) {
	if (dummyWindow != undefined && !dummyWindow.isDestroyed()) {
		const script = 'localStorage.' + key + ' = "' + value + '"'
		return dummyWindow.webContents.executeJavaScript(script)
	} else {
		console.log("localStorageSet failed; Dummy window is undefined or destroyed...")
		console.log("dummyWindow", dummyWindow)
		if (dummyWindow) {
			console.log("dummyWindow.isDestroyed()", dummyWindow.isDestroyed())
		}
	}
}

function getDisplayById(id, allDisplays) {
	// Do not use '===' !
	return allDisplays.find(d => d.id == id)
}

function rectIntersectionAmount(a, b) {
	const top = Math.max(a.y, b.y)
	const bottom = Math.min(a.y + a.height, b.y + b.height)
	const left = Math.max(a.x, b.x)
	const right = Math.min(a.x + a.width, b.x + b.width)
	return Math.max(0, right - left) * Math.max(0, bottom - top)
}
