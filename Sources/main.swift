import AppKit
import CoreText
import SQLite3
import WebKit

enum Palette {
    static let paper = NSColor(srgbRed: 0xF3 / 255, green: 0xEF / 255, blue: 0xE8 / 255, alpha: 1)
    static let ink = NSColor(srgbRed: 0x1D / 255, green: 0x1A / 255, blue: 0x16 / 255, alpha: 1)
    static let muted = NSColor(srgbRed: 0x7A / 255, green: 0x70 / 255, blue: 0x64 / 255, alpha: 1)
    static let accent = NSColor(srgbRed: 0x1E / 255, green: 0x4A / 255, blue: 0x38 / 255, alpha: 1)
    static let danger = NSColor(srgbRed: 0x8A / 255, green: 0x30 / 255, blue: 0x30 / 255, alpha: 1)
    static let hairline = NSColor(srgbRed: 58 / 255, green: 45 / 255, blue: 30 / 255, alpha: 0.1)
}

enum ShellDates {
    static let months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    static let monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    static func startOfDay(_ date: Date) -> Date {
        Calendar.current.date(bySettingHour: 0, minute: 0, second: 0, of: date) ?? date
    }

    static func monday(of date: Date) -> Date {
        let day = Calendar.current.component(.weekday, from: date)
        let delta = day == 1 ? -6 : 2 - day
        return Calendar.current.date(byAdding: .day, value: delta, to: startOfDay(date)) ?? date
    }

    static func ordinal(_ day: Int) -> String {
        let tens = day % 100
        var suffix = "th"
        if tens < 11 || tens > 13 {
            switch day % 10 {
            case 1: suffix = "st"
            case 2: suffix = "nd"
            case 3: suffix = "rd"
            default: break
            }
        }
        return "\(day)\(suffix)"
    }

    static func dayTab(_ date: Date) -> String {
        let month = Calendar.current.component(.month, from: date) - 1
        let day = Calendar.current.component(.day, from: date)
        return "\(months[month]) \(ordinal(day))"
    }

    static func weekTab(_ date: Date) -> String {
        let start = monday(of: date)
        let end = Calendar.current.date(byAdding: .day, value: 4, to: start) ?? start
        let startMonth = Calendar.current.component(.month, from: start) - 1
        let endMonth = Calendar.current.component(.month, from: end) - 1
        let startDay = Calendar.current.component(.day, from: start)
        let endDay = Calendar.current.component(.day, from: end)
        if startMonth == endMonth {
            return "\(monthsShort[startMonth]) \(startDay) - \(endDay)"
        }
        return "\(monthsShort[startMonth]) \(startDay) - \(monthsShort[endMonth]) \(endDay)"
    }

    static func monthTab(_ date: Date) -> String {
        months[Calendar.current.component(.month, from: date) - 1]
    }
}

final class TabControl: NSView {
    let id: String
    var title: String
    var selected = false
    var onPress: ((String) -> Void)?

    static let font: NSFont = {
        let base = NSFont(name: "Iowan Old Style", size: 16) ?? NSFont.systemFont(ofSize: 16)
        let features: [[NSFontDescriptor.FeatureKey: Int]] = [
            [.typeIdentifier: kNumberSpacingType, .selectorIdentifier: kMonospacedNumbersSelector],
            [.typeIdentifier: kNumberCaseType, .selectorIdentifier: kUpperCaseNumbersSelector]
        ]
        let descriptor = base.fontDescriptor.addingAttributes([.featureSettings: features])
        return NSFont(descriptor: descriptor, size: 16) ?? base
    }()

    init(id: String, title: String) {
        self.id = id
        self.title = title
        super.init(frame: .zero)
    }

    required init?(coder: NSCoder) { nil }

    override var intrinsicContentSize: NSSize {
        let size = (title as NSString).size(withAttributes: [.font: TabControl.font])
        return NSSize(width: ceil(size.width) + 8, height: 32)
    }

    override func draw(_ dirtyRect: NSRect) {
        let attributes: [NSAttributedString.Key: Any] = [
            .font: TabControl.font,
            .foregroundColor: selected ? Palette.ink : Palette.muted
        ]
        let size = (title as NSString).size(withAttributes: attributes)
        let rect = NSRect(
            x: (bounds.width - size.width) / 2,
            y: (bounds.height - size.height) / 2 + 1,
            width: size.width,
            height: size.height
        )
        (title as NSString).draw(in: rect, withAttributes: attributes)
        if selected {
            Palette.accent.setFill()
            NSRect(x: 2, y: 2, width: bounds.width - 4, height: 2).fill()
        }
    }

    override func mouseDown(with event: NSEvent) {
        onPress?(id)
    }

    override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }
}

final class TitleBarView: NSView {
    let titleField = NSTextField(labelWithString: "")
    let statusField = NSTextField(labelWithString: "")
    var tabs: [TabControl] = []

    override var isOpaque: Bool { true }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        let titleFont = NSFont(name: "Iowan Old Style", size: 22) ?? NSFont.systemFont(ofSize: 22)
        titleField.font = titleFont
        titleField.textColor = Palette.ink
        titleField.alignment = .center
        titleField.lineBreakMode = .byTruncatingTail
        titleField.drawsBackground = false
        titleField.isBezeled = false
        titleField.isEditable = false
        titleField.isSelectable = false
        addSubview(titleField)

        statusField.font = NSFont.systemFont(ofSize: 11, weight: .medium)
        statusField.textColor = Palette.muted
        statusField.alignment = .right
        statusField.drawsBackground = false
        statusField.isBezeled = false
        statusField.isEditable = false
        statusField.isSelectable = false
        addSubview(statusField)
    }

    required init?(coder: NSCoder) { nil }

    func setTabs(_ tabs: [TabControl]) {
        self.tabs.forEach { $0.removeFromSuperview() }
        self.tabs = tabs
        tabs.forEach { addSubview($0) }
        needsLayout = true
    }

    override func draw(_ dirtyRect: NSRect) {
        Palette.paper.setFill()
        bounds.fill()
        Palette.hairline.setFill()
        NSRect(x: 0, y: 0, width: bounds.width, height: 1).fill()
    }

    override func layout() {
        super.layout()
        let width = bounds.width
        titleField.frame = NSRect(x: 88, y: bounds.height - 8 - 26, width: max(0, width - 176), height: 26)
        statusField.sizeToFit()
        let statusWidth = max(88, ceil(statusField.frame.width))
        statusField.frame = NSRect(x: width - 16 - statusWidth, y: bounds.height - 12 - 16, width: statusWidth, height: 16)

        let gap: CGFloat = 22
        let total = tabs.reduce(CGFloat(0)) { $0 + $1.intrinsicContentSize.width } + gap * CGFloat(max(0, tabs.count - 1))
        var x = max(78, (width - total) / 2)
        for tab in tabs {
            let size = tab.intrinsicContentSize
            tab.frame = NSRect(x: x, y: 12, width: size.width, height: 32)
            x += size.width + gap
        }
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        let local = convert(point, from: superview)
        guard bounds.contains(local) else { return nil }
        for tab in tabs where tab.frame.contains(local) {
            return tab
        }
        return self
    }

    override func mouseDown(with event: NSEvent) {
        guard let window = window else { return }
        if event.clickCount == 2 {
            window.performZoom(nil)
            return
        }
        window.performDrag(with: event)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    let supportDir: URL
    let resourcesDir: URL
    let ioQueue = DispatchQueue(label: "local.desktop.organizer.store")
    var window: NSWindow!
    var titleBar: TitleBarView!
    var webView: WKWebView!
    var tabControls: [TabControl] = []
    var activeTab = "day"
    let tabOrder = ["day", "week", "month", "archive"]
    var pendingWrites = 0
    var closeWhenSaved = false
    var terminateWhenSaved = false
    var lastIndexStamp: String?
    var pageReady = false
    var refreshRunning = false
    var activityRunning = false
    var pendingActivity: String?
    override init() {
        let env = ProcessInfo.processInfo.environment["ORGANIZER_SUPPORT_DIR"]
        if let env = env, !env.isEmpty {
            supportDir = URL(fileURLWithPath: env, isDirectory: true)
        } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
                ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
            supportDir = base.appendingPathComponent("DesktopOrganizer", isDirectory: true)
        }
        resourcesDir = Bundle.main.resourceURL ?? URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenus()
        buildWindow()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        guard webView != nil else { return }
        pushSalesforce(forceIndex: false)
        catchUpRefreshIfNeeded()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if pendingWrites == 0 { return .terminateNow }
        terminateWhenSaved = true
        return .terminateLater
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if pendingWrites == 0 { return true }
        closeWhenSaved = true
        return false
    }

    func buildMenus() {
        let main = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        appItem.submenu = appMenu
        main.addItem(appItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(NSMenuItem(title: "Undo", action: Selector(("undo:")), keyEquivalent: "z"))
        editMenu.addItem(NSMenuItem(title: "Redo", action: Selector(("redo:")), keyEquivalent: "Z"))
        editMenu.addItem(.separator())
        editMenu.addItem(NSMenuItem(title: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
        editMenu.addItem(NSMenuItem(title: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
        editMenu.addItem(NSMenuItem(title: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v"))
        editMenu.addItem(NSMenuItem(title: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))
        editItem.submenu = editMenu
        main.addItem(editItem)
        NSApp.mainMenu = main
    }

    func buildWindow() {
        let size = NSSize(width: 1180, height: 800)
        window = NSWindow(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.title = ""
        window.isMovableByWindowBackground = false
        window.backgroundColor = Palette.paper
        window.contentMinSize = NSSize(width: 1080, height: 620)
        window.setContentSize(size)
        window.center()
        window.delegate = self

        let content = NSView(frame: NSRect(origin: .zero, size: size))
        content.autoresizesSubviews = true
        window.contentView = content

        titleBar = TitleBarView(frame: NSRect(x: 0, y: size.height - 92, width: size.width, height: 92))
        titleBar.autoresizingMask = [.width, .minYMargin]
        content.addSubview(titleBar)

        let today = Date()
        let specs: [(String, String)] = [
            ("day", ShellDates.dayTab(today)),
            ("week", ShellDates.weekTab(today)),
            ("month", ShellDates.monthTab(today)),
            ("archive", "Running Account List")
        ]
        tabControls = specs.map { id, title in
            let tab = TabControl(id: id, title: title)
            tab.selected = id == activeTab
            tab.onPress = { [weak self] chosen in self?.selectTab(chosen, tellPage: true) }
            return tab
        }
        titleBar.setTabs(tabControls)

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let controller = WKUserContentController()
        controller.addUserScript(WKUserScript(
            source: bootScript(),
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        controller.add(self, name: "organizer")
        configuration.userContentController = controller

        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: size.width, height: size.height - 92), configuration: configuration)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        if #available(macOS 12.0, *) {
            webView.underPageBackgroundColor = Palette.paper
        }
        content.addSubview(webView)

        let html = resourcesDir.appendingPathComponent("index.html")
        webView.loadFileURL(html, allowingReadAccessTo: resourcesDir)
    }

    func bootScript() -> String {
        let payload = loadStorePayload()
        return """
        document.documentElement.classList.add("native-shell");
        window.__ORGANIZER_STORE_B64 = "\(payload)";
        """
    }

    func loadStorePayload() -> String {
        let url = supportDir.appendingPathComponent("store.json")
        guard let data = try? Data(contentsOf: url) else {
            return Data("{}".utf8).base64EncodedString()
        }
        if (try? JSONSerialization.jsonObject(with: data)) == nil {
            let stamp = Int(Date().timeIntervalSince1970)
            let bad = supportDir.appendingPathComponent("store.bad-\(stamp).json")
            try? FileManager.default.moveItem(at: url, to: bad)
            return Data("{}".utf8).base64EncodedString()
        }
        return data.base64EncodedString()
    }

    func selectTab(_ id: String, tellPage: Bool) {
        guard tabOrder.contains(id) else { return }
        activeTab = id
        for tab in tabControls {
            tab.selected = tab.id == id
            tab.needsDisplay = true
        }
        guard tellPage else { return }
        eval("window.Organizer && Organizer.setView(\"\(id)\")")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let body = message.body
        if Thread.isMainThread {
            handle(body)
        } else {
            DispatchQueue.main.async { self.handle(body) }
        }
    }

    func handle(_ body: Any) {
        guard let message = body as? [String: Any], let op = message["op"] as? String else { return }
        switch op {
        case "save":
            if let store = message["store"] { writeStore(store) }
        case "tabs":
            applyTabs(message)
        case "copy":
            let text = message["text"] as? String ?? ""
            let board = NSPasteboard.general
            board.clearContents()
            board.setString(text, forType: .string)
        case "status":
            let text = (message["text"] as? String ?? "").uppercased()
            let failed = message["failed"] as? Bool ?? false
            titleBar.statusField.stringValue = text
            titleBar.statusField.textColor = failed ? Palette.danger : Palette.muted
            titleBar.needsLayout = true
        case "config":
            let title = message["appTitle"] as? String ?? ""
            titleBar.titleField.stringValue = title
            window.title = title
            titleBar.needsLayout = true
        case "debug":
            let text = message["text"] as? String ?? ""
            FileHandle.standardError.write(Data("CHECK \(text)\n".utf8))
        case "salesforce:refresh":
            startRefresh()
        case "salesforce:signin":
            startSignIn()
        case "salesforce:record":
            let object = message["object"] as? String ?? ""
            let id = message["id"] as? String ?? ""
            fetchRecord(object: object, id: id)
        case "salesforce:activity":
            enqueueActivity(message)
        default:
            break
        }
    }

    func applyTabs(_ message: [String: Any]) {
        if let active = message["active"] as? String, tabOrder.contains(active) {
            activeTab = active
        }
        let labels = [
            "day": message["day"] as? String,
            "week": message["week"] as? String,
            "month": message["month"] as? String,
            "archive": message["archive"] as? String
        ]
        for tab in tabControls {
            if let label = labels[tab.id] ?? nil, !label.isEmpty {
                tab.title = label
                tab.invalidateIntrinsicContentSize()
            }
            tab.selected = tab.id == activeTab
            tab.needsDisplay = true
        }
        titleBar.needsLayout = true
    }

    func writeStore(_ object: Any) {
        pendingWrites += 1
        ioQueue.async {
            let ok = Self.persist(object, to: self.supportDir)
            DispatchQueue.main.async {
                self.pendingWrites -= 1
                if !ok { self.failSave() }
                self.finishPendingClose()
            }
        }
    }

    static func persist(_ object: Any, to directory: URL) -> Bool {
        guard JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys]) else {
            return false
        }
        var output = data
        if output.last != 0x0A { output.append(0x0A) }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let dest = directory.appendingPathComponent("store.json")
            let tmp = directory.appendingPathComponent(".store-\(UUID().uuidString).tmp")
            try output.write(to: tmp, options: .atomic)
            if FileManager.default.fileExists(atPath: dest.path) {
                _ = try FileManager.default.replaceItemAt(dest, withItemAt: tmp)
            } else {
                try FileManager.default.moveItem(at: tmp, to: dest)
            }
            return true
        } catch {
            return false
        }
    }

    func failSave() {
        titleBar.statusField.stringValue = "COULD NOT SAVE"
        titleBar.statusField.textColor = Palette.danger
        titleBar.needsLayout = true
        eval("window.Organizer && Organizer.markSaveFailed()")
    }

    func finishPendingClose() {
        guard pendingWrites == 0 else { return }
        if closeWhenSaved {
            closeWhenSaved = false
            window.close()
        }
        if terminateWhenSaved {
            terminateWhenSaved = false
            NSApp.reply(toApplicationShouldTerminate: true)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageReady = true
        pushSalesforce(forceIndex: true)
        runSnapshotsIfNeeded()
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        let external = navigationAction.navigationType == .linkActivated || navigationAction.targetFrame == nil
        if external, let url = url, let scheme = url.scheme?.lowercased(), ["http", "https", "mailto"].contains(scheme) {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    func eval(_ source: String) {
        let debugging = ProcessInfo.processInfo.environment["ORGANIZER_SNAPSHOT_DIR"] != nil
        webView?.evaluateJavaScript(source) { _, error in
            if debugging, let error = error {
                FileHandle.standardError.write(Data("CHECK eval-error=\(error.localizedDescription) source=\(source.prefix(60))\n".utf8))
            }
        }
    }

    func evalB64(_ function: String, _ json: String, trailer: String = "") {
        let b64 = Data(json.utf8).base64EncodedString()
        eval("window.Organizer && Organizer.\(function)(\"\(b64)\"\(trailer))")
    }

    func pushSalesforce(forceIndex: Bool) {
        // The app can become active before the page has loaded; wait for didFinish.
        guard pageReady else { return }
        let stamp = indexStamp()
        if forceIndex || (stamp != nil && stamp != lastIndexStamp) {
            if let raw = try? String(contentsOf: supportDir.appendingPathComponent("salesforce-index.json"), encoding: .utf8) {
                evalB64("receiveSalesforceIndex", raw)
                lastIndexStamp = stamp
            }
            // The cached activity goes with the index so the follow-up band has counts right away.
            if let cached = try? String(contentsOf: supportDir.appendingPathComponent("salesforce-activity.json"), encoding: .utf8) {
                evalB64("receiveSalesforceActivity", cached, trailer: ", true")
            }
        }
        let status = (try? String(contentsOf: supportDir.appendingPathComponent("salesforce-status.json"), encoding: .utf8)) ?? "{\"state\":\"none\"}"
        let busy = refreshRunning || readStatus().state == "running"
        evalB64("receiveSalesforceStatus", status, trailer: ", \(busy ? "true" : "false")")
    }

    func indexStamp() -> String? {
        let path = supportDir.appendingPathComponent("salesforce-index.json").path
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: path) else { return nil }
        let size = (attrs[.size] as? NSNumber)?.int64Value ?? 0
        let modified = (attrs[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
        return "\(size)-\(modified)"
    }

    func catchUpRefreshIfNeeded() {
        guard scriptURL() != nil else { return }
        let syncedAt = syncedAtDate()
        let stale = syncedAt == nil || Date().timeIntervalSince(syncedAt!) > 20 * 3600
        guard stale else { return }
        let status = readStatus()
        if status.state == "signin" { return }
        if status.state == "running", let started = status.startedAt, Date().timeIntervalSince(started) < 1800 { return }
        if status.state == "error", let finished = status.finishedAt, Date().timeIntervalSince(finished) < 1800 { return }
        startRefresh()
    }

    func syncedAtDate() -> Date? {
        guard let data = try? Data(contentsOf: supportDir.appendingPathComponent("salesforce-index.json")),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let value = obj["syncedAt"] as? String else { return nil }
        return parseTimestamp(value)
    }

    struct SyncStatus {
        var state = "none"
        var startedAt: Date?
        var finishedAt: Date?
    }

    func readStatus() -> SyncStatus {
        guard let data = try? Data(contentsOf: supportDir.appendingPathComponent("salesforce-status.json")),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return SyncStatus()
        }
        return SyncStatus(
            state: obj["state"] as? String ?? "none",
            startedAt: parseTimestamp(obj["startedAt"] as? String),
            finishedAt: parseTimestamp(obj["finishedAt"] as? String)
        )
    }

    func parseTimestamp(_ value: String?) -> Date? {
        guard let value = value, !value.isEmpty else { return nil }
        let formatter = ISO8601DateFormatter()
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value)
    }

    func scriptURL() -> URL? {
        let url = resourcesDir.appendingPathComponent("salesforce_sync.py")
        return FileManager.default.isExecutableFile(atPath: "/usr/bin/python3") && FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    func logHandle() -> FileHandle? {
        let dir = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Logs/Organizer")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent("salesforce-sync.log")
        if !FileManager.default.fileExists(atPath: url.path) {
            FileManager.default.createFile(atPath: url.path, contents: nil)
        }
        return try? FileHandle(forWritingTo: url)
    }

    func runPython(arguments: [String], completion: @escaping (Bool) -> Void) {
        guard let script = scriptURL() else {
            completion(false)
            return
        }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
        process.arguments = [script.path] + arguments
        var env = ProcessInfo.processInfo.environment
        env["ORGANIZER_SUPPORT_DIR"] = supportDir.path
        process.environment = env
        let log = logHandle()
        log?.seekToEndOfFile()
        process.standardOutput = log
        process.standardError = log
        process.terminationHandler = { process in
            log?.closeFile()
            DispatchQueue.main.async { completion(process.terminationStatus == 0) }
        }
        do {
            try process.run()
        } catch {
            completion(false)
        }
    }

    func startRefresh() {
        guard !refreshRunning else { return }
        guard scriptURL() != nil else { return }
        refreshRunning = true
        pushSalesforce(forceIndex: false)
        runPython(arguments: []) { [weak self] _ in
            guard let self = self else { return }
            self.refreshRunning = false
            self.pushSalesforce(forceIndex: true)
        }
    }

    func startSignIn() {
        guard let sf = sfBinary() else { return }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: sf)
        process.arguments = ["org", "login", "web", "--alias", orgAlias(), "--set-default"]
        let log = logHandle()
        log?.seekToEndOfFile()
        process.standardOutput = log
        process.standardError = log
        process.terminationHandler = { process in
            log?.closeFile()
            DispatchQueue.main.async {
                if process.terminationStatus == 0 { self.startRefresh() }
                else { self.pushSalesforce(forceIndex: false) }
            }
        }
        try? process.run()
    }

    func orgAlias() -> String {
        guard let data = try? Data(contentsOf: supportDir.appendingPathComponent("salesforce-config.json")),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let alias = obj["orgAlias"] as? String,
              !alias.isEmpty else { return "organizer" }
        return alias
    }

    func sfBinary() -> String? {
        let home = NSHomeDirectory()
        let candidates = [
            ProcessInfo.processInfo.environment["SF_CLI"],
            "\(home)/.local/sf/bin/sf",
            "/usr/local/bin/sf",
            "/opt/homebrew/bin/sf"
        ].compactMap { $0 }
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    func enqueueActivity(_ message: [String: Any]) {
        let payload: [String: Any] = [
            "contacts": message["contacts"] ?? [],
            "accounts": message["accounts"] ?? [],
            "after": message["after"] ?? ""
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        if activityRunning {
            pendingActivity = json
            return
        }
        runActivity(json)
    }

    func runActivity(_ json: String) {
        activityRunning = true
        runPython(arguments: ["--activity", json]) { [weak self] ok in
            guard let self = self else { return }
            let raw = (try? String(contentsOf: self.supportDir.appendingPathComponent("salesforce-activity.json"), encoding: .utf8)) ?? "{}"
            self.evalB64("receiveSalesforceActivity", raw, trailer: ", \(ok ? "true" : "false")")
            self.activityRunning = false
            if let next = self.pendingActivity {
                self.pendingActivity = nil
                self.runActivity(next)
            }
        }
    }

    func fetchRecord(object: String, id: String) {
        let allowed = ["Account", "Contact", "Opportunity", "OpportunityContactRole"]
        ioQueue.async {
            let result = Self.lookupRecord(object: object, id: id, allowed: allowed, database: self.supportDir.appendingPathComponent("salesforce.sqlite"))
            let data = (try? JSONSerialization.data(withJSONObject: result)) ?? Data("{}".utf8)
            let json = String(data: data, encoding: .utf8) ?? "{}"
            DispatchQueue.main.async { self.evalB64("receiveSalesforceRecord", json) }
        }
    }

    static func lookupRecord(object: String, id: String, allowed: [String], database: URL) -> [String: Any] {
        var response: [String: Any] = ["object": object, "id": id, "data": NSNull(), "fields": []]
        guard allowed.contains(object), isSalesforceId(id), FileManager.default.fileExists(atPath: database.path) else {
            return response
        }
        var db: OpaquePointer?
        guard sqlite3_open_v2(database.path, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK, let db = db else {
            return response
        }
        defer { sqlite3_close(db) }
        if let data = queryText(db, "SELECT data FROM records WHERE id = ? AND object = ?", [id, object]),
           let json = data.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: json) {
            response["data"] = parsed
        }
        if let fields = queryText(db, "SELECT fields FROM objects WHERE name = ?", [object]),
           let json = fields.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: json) {
            response["fields"] = parsed
        }
        return response
    }

    static func isSalesforceId(_ value: String) -> Bool {
        guard value.count == 15 || value.count == 18 else { return false }
        return value.unicodeScalars.allSatisfy { CharacterSet.alphanumerics.contains($0) }
    }

    static func queryText(_ db: OpaquePointer, _ sql: String, _ values: [String]) -> String? {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK, let statement = statement else { return nil }
        defer { sqlite3_finalize(statement) }
        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        for (index, value) in values.enumerated() {
            sqlite3_bind_text(statement, Int32(index + 1), value, -1, transient)
        }
        guard sqlite3_step(statement) == SQLITE_ROW, let raw = sqlite3_column_text(statement, 0) else { return nil }
        return String(cString: raw)
    }

    func runSnapshotsIfNeeded() {
        let env = ProcessInfo.processInfo.environment
        guard let dir = env["ORGANIZER_SNAPSHOT_DIR"], !dir.isEmpty,
              let stepsJSON = env["ORGANIZER_SNAPSHOT_STEPS"],
              let data = stepsJSON.data(using: .utf8),
              let steps = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return }
        let folder = URL(fileURLWithPath: dir, isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        titleBar.layoutSubtreeIfNeeded()
        let titleLocal = NSPoint(x: titleBar.bounds.midX, y: titleBar.bounds.height - 18)
        let titleHit = titleBar.hitTest(titleBar.convert(titleLocal, to: titleBar.superview))
        let tab = tabControls[1]
        let tabLocal = NSPoint(x: tab.frame.midX, y: tab.frame.midY)
        let tabHit = titleBar.hitTest(titleBar.convert(tabLocal, to: titleBar.superview))
        let labels = tabControls.map { "\($0.id)=\($0.title)\($0.selected ? "*" : "")" }.joined(separator: " | ")
        FileHandle.standardError.write(Data("CHECK title=\(window.title)\n".utf8))
        FileHandle.standardError.write(Data("CHECK tabs=\(labels)\n".utf8))
        FileHandle.standardError.write(Data("CHECK title-hit=\(titleHit === titleBar) tab-hit=\(tabHit === tab)\n".utf8))
        runSnapshot(steps, index: 0, folder: folder)
    }

    func runSnapshot(_ steps: [[String: Any]], index: Int, folder: URL) {
        guard index < steps.count else {
            FileHandle.standardError.write(Data("CHECK snapshots-done\n".utf8))
            return
        }
        let step = steps[index]
        let name = (step["name"] as? String) ?? "step-\(index)"
        let js = step["js"] as? String ?? ""
        let wait = step["wait"] as? Double ?? 0.3
        webView.evaluateJavaScript(js) { [weak self] _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + wait) {
                guard let self = self else { return }
                let config = WKSnapshotConfiguration()
                self.webView.takeSnapshot(with: config) { image, _ in
                    if let tiff = image?.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) {
                        try? png.write(to: folder.appendingPathComponent("\(name).png"))
                    }
                    if let view = self.window.contentView, let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) {
                        view.cacheDisplay(in: view.bounds, to: rep)
                        if let png = rep.representation(using: .png, properties: [:]) {
                            try? png.write(to: folder.appendingPathComponent("\(name)-chrome.png"))
                        }
                    }
                    self.runSnapshot(steps, index: index + 1, folder: folder)
                }
            }
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
