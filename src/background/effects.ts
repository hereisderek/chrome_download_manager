/** Saves text content as a downloadable file via a data: URL (service workers have no Blob URL access). */
export async function downloadTextFile(filename: string, content: string): Promise<void> {
  const base64 = btoa(unescape(encodeURIComponent(content)));
  await chrome.downloads.download({
    url: `data:text/plain;base64,${base64}`,
    filename,
    saveAs: false,
  });
}

export function notify(title: string, message: string, priority: 0 | 1 | 2 = 1): void {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon48.png",
    title,
    message,
    priority,
  });
}
