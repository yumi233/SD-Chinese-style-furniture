// A late session lookup must not undo a more recent login or logout.
export class AuthCoordinator {
  constructor(onPending = () => {}) {
    this.revision = 0;
    this.pending = false;
    this.onPending = onPending;
  }

  async read(request) {
    if (this.pending) return null;
    const revision = ++this.revision;
    try {
      const result = await request();
      return revision === this.revision && !this.pending ? result : null;
    } catch (error) {
      if (revision !== this.revision || this.pending) return null;
      throw error;
    }
  }

  async write(request) {
    if (this.pending) return null;
    this.pending = true;
    this.revision += 1;
    this.onPending(true);
    try {
      return await request();
    } finally {
      this.pending = false;
      this.onPending(false);
    }
  }
}
