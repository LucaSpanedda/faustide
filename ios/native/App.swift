// Faust Notes: native iOS shell around the web app in www/ (WKWebView).
// - the web app is served from the bundle through the "faustnotes://" scheme (secure context:
//   Web Audio worklets and the microphone work as on a web site)
// - the notes are .dsp files in Documents (visible in the Files app, "On My iPhone > Faust Notes")
// - share, import, microphone permission, audio session for playback and recording

import AVFoundation
import UIKit
import UniformTypeIdentifiers
import WebKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // play and record, through the speaker by default, also with the silent switch on
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP, .mixWithOthers])
        try? session.setActive(true)

        window = UIWindow(frame: UIScreen.main.bounds)
        window?.overrideUserInterfaceStyle = .light
        window?.rootViewController = NotesViewController()
        window?.makeKeyAndVisible()
        return true
    }

    // a .dsp file opened from another app ("Open in Faust Notes")
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        (window?.rootViewController as? NotesViewController)?.importFiles([url])
        return true
    }
}

/// Serves the files of the www/ folder of the bundle
class BundleSchemeHandler: NSObject, WKURLSchemeHandler {

    let root = Bundle.main.url(forResource: "www", withExtension: nil)!

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        let path = task.request.url?.path ?? "/"
        let file = root.appendingPathComponent(path == "/" ? "index.html" : String(path.dropFirst()))
        guard let data = try? Data(contentsOf: file) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let types = ["html": "text/html", "js": "text/javascript", "css": "text/css", "json": "application/json",
                     "wasm": "application/wasm", "svg": "image/svg+xml", "mp3": "audio/mpeg", "dsp": "text/plain"]
        let mime = types[file.pathExtension] ?? "application/octet-stream"
        let response = HTTPURLResponse(url: task.request.url!, statusCode: 200, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": mime, "Content-Length": "\(data.count)"])!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

class NotesViewController: UIViewController, WKScriptMessageHandlerWithReply, WKUIDelegate, UIDocumentPickerDelegate {

    var webView: WKWebView!
    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "faustnotes")
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "notes")
        webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .white
        overrideUserInterfaceStyle = .light      // always white, also in dark mode
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        installExamples()
        webView.load(URLRequest(url: URL(string: "faustnotes://app/index.html")!))
        // notes changed in the Files app while the app was in the background
        NotificationCenter.default.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
            self?.webView.evaluateJavaScript("window.notesChanged && window.notesChanged()")
        }
    }

    /// First launch: copy the examples of the bundle into Documents
    func installExamples() {
        let flag = "examplesInstalled"
        guard !UserDefaults.standard.bool(forKey: flag) else { return }
        let examples = Bundle.main.url(forResource: "www/examples", withExtension: nil)!
        for url in (try? FileManager.default.contentsOfDirectory(at: examples, includingPropertiesForKeys: nil)) ?? [] where url.pathExtension == "dsp" {
            try? FileManager.default.copyItem(at: url, to: documents.appendingPathComponent(url.lastPathComponent))
        }
        UserDefaults.standard.set(true, forKey: flag)
    }

    func fileURL(_ name: String) -> URL { documents.appendingPathComponent(name + ".dsp") }

    // MARK: messages of the web app (see app.js, nativeStore)

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else {
            replyHandler(nil, "bad message")
            return
        }
        let name = body["name"] as? String ?? ""
        let fm = FileManager.default
        switch cmd {
        case "list":
            let urls = (try? fm.contentsOfDirectory(at: documents, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
            let notes: [[String: Any]] = urls.filter { $0.pathExtension == "dsp" }.map { url in
                let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? Date()
                let text = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
                return ["name": url.deletingPathExtension().lastPathComponent,
                        "mtime": date.timeIntervalSince1970 * 1000,
                        "preview": String(text.prefix(400))]
            }
            replyHandler(notes, nil)
        case "read":
            replyHandler((try? String(contentsOf: fileURL(name), encoding: .utf8)) ?? "", nil)
        case "write":
            do {
                try (body["code"] as? String ?? "").write(to: fileURL(name), atomically: true, encoding: .utf8)
                replyHandler(true, nil)
            } catch {
                replyHandler(nil, error.localizedDescription)
            }
        case "remove":
            try? fm.removeItem(at: fileURL(name))
            replyHandler(true, nil)
        case "rename":
            try? fm.moveItem(at: fileURL(name), to: fileURL(body["to"] as? String ?? name))
            replyHandler(true, nil)
        case "share":
            let sheet = UIActivityViewController(activityItems: [fileURL(name)], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = view
            present(sheet, animated: true)
            replyHandler(true, nil)
        case "import":
            let types = [UTType(filenameExtension: "dsp") ?? .plainText, UTType(filenameExtension: "lib") ?? .plainText, .plainText]
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
            picker.allowsMultipleSelection = true
            picker.delegate = self
            present(picker, animated: true)
            replyHandler(true, nil)
        default:
            replyHandler(nil, "unknown command \(cmd)")
        }
    }

    // MARK: import

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        importFiles(urls)
    }

    /// Copy files into Documents as .dsp notes ("Name", "Name 2", ... if the name exists)
    func importFiles(_ urls: [URL]) {
        for url in urls {
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            guard let text = try? String(contentsOf: url, encoding: .utf8) else { continue }
            let base = url.deletingPathExtension().lastPathComponent
            var name = base, i = 2
            while FileManager.default.fileExists(atPath: fileURL(name).path) { name = "\(base) \(i)"; i += 1 }
            try? text.write(to: fileURL(name), atomically: true, encoding: .utf8)
        }
        webView.evaluateJavaScript("window.notesChanged && window.notesChanged()")
    }

    // MARK: permissions and dialogs of the web app

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)     // the system asks the user once (NSMicrophoneUsageDescription)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .destructive) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: prompt, message: nil, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText; $0.clearButtonMode = .whileEditing }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        present(alert, animated: true)
    }
}
