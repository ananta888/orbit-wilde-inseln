/** Durable bounded journal. Never silently drop unacknowledged intentions. */
export class Journal {
  async open() {
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('orbit-creature-editor', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('commands', { keyPath: 'command_id' });
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  async transaction(mode, action) {
    if (!this.db) throw Error('Lokaler Wiederherstellungsspeicher fehlt');
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('commands', mode); const result = action(tx.objectStore('commands'));
      tx.oncomplete = () => resolve(result?.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  }
  async list() { return (await this.transaction('readonly', s => s.getAll())).sort((a, b) => a.created - b.created); }
  async put(command) {
    const commands = await this.list();
    if (commands.length >= 64 || JSON.stringify(commands).length + JSON.stringify(command).length > 1024 * 1024)
      throw Error('Lokaler Puffer voll. Verbindung wiederherstellen oder Änderungen exportieren.');
    return this.transaction('readwrite', s => s.put({ ...command, created: Date.now() }));
  }
  async remove(id) { return this.transaction('readwrite', s => s.delete(id)); }
}
