---
title: "Building a Real-Time Chat Application with WebSockets"
date: "2026-09-18"
summary: "From socket connections to message broadcasting, authentication, and scaling."
tags: ["WebSockets", "Node.js", "Backend", "System Design"]
author: "John Smith"
---

Real-time communication is one of those features that looks simple from the outside but gets interesting once multiple users start interacting simultaneously.

## Why WebSockets?

Traditional HTTP follows a request-response model. The client asks for something, and the server responds. This works perfectly for most applications, but it isn't ideal when updates need to happen instantly.

WebSockets establish a persistent, two-way connection between the client and server. Once connected, either side can send messages without waiting for another request.

## Setting up the server

For this project, we'll use Node.js with the `ws` library. The server handles incoming connections and broadcasts messages to connected clients.

```javascript
import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("message", (message) => {
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(message.toString());
      }
    }
  });

  socket.on("close", () => {
    console.log("Client disconnected");
  });
});
```

This is enough for a basic chat server, although a production application needs additional handling for authentication, validation, and disconnected clients.

## Handling connections on the frontend

The browser provides a native WebSocket API, so no additional client library is necessary.

```javascript
const socket = new WebSocket("ws://localhost:8080");

socket.addEventListener("message", (event) => {
  console.log("New message:", event.data);
});

function sendMessage(message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(message);
  }
}
```

The important part is checking the connection state before sending data. Otherwise, messages can be lost when the connection hasn't been established yet.

## What about scaling?

A single WebSocket server works well for small applications. However, things become more complicated when multiple server instances are involved.

If two users connect to different instances, they won't automatically receive each other's messages.

A message broker such as Redis Pub/Sub solves this problem by allowing instances to exchange events.

## Lessons learned

- Always implement reconnection logic on the client.
- Authenticate connections instead of trusting client-provided user IDs.
- Validate incoming messages before broadcasting them.
- Use Redis or another message broker when scaling horizontally.
- Monitor connection counts and clean up inactive sessions.

## Final thoughts

WebSockets are a great fit for applications that need low-latency, bidirectional communication. They're not necessary for every application, but when real-time updates are a core feature, they provide a clean foundation to build on.