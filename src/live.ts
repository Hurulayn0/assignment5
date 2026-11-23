// Huriye Kayadelen, 2200005795
export class LiveUpdates {
  private clients = new Map<number, Set<WebSocket>>();
  connect(request: Request, userId: number) {
    const { socket, response } = Deno.upgradeWebSocket(request);
    socket.onopen = () => {
      const group = this.clients.get(userId) ?? new Set<WebSocket>();
      group.add(socket);
      this.clients.set(userId, group);
    };
    socket.onclose = () => {
      const group = this.clients.get(userId);
      group?.delete(socket);
      if (group?.size === 0) this.clients.delete(userId);
    };
    return response;
  }
  send(userId: number, type: string, task: unknown) {
    for (const socket of this.clients.get(userId) ?? []) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type, task }));
      }
    }
  }
}
