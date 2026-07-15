document.addEventListener('DOMContentLoaded', () => {
    const hostButton = document.getElementById('hostSubmitButton');
    const clientButton = document.getElementById('clientSubmitButton');
    const clientInput = document.getElementById('clientInput');
    const messagesDiv = document.getElementById('messages');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const chatContainer = document.getElementById('chat-container');
    const chatURL = document.getElementById('chatURL');
    const chatStatus = document.getElementById('chatStatus');
    const usernameInput = document.getElementById('usernameInput');

    let host = false;

    function displayMessage(message, isSender = false) {
        const messageContainer = document.createElement('div');
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
            
        messageContainer.classList.add('message-container');
      
        if (isSender) {
            messageContainer.classList.add('sender-message-container');
            messageElement.classList.add('message-bubble', 'sender-message-bubble');
        } else {
            messageElement.classList.add('message-bubble');
        }
      
        messageContainer.appendChild(messageElement);
        messagesDiv.appendChild(messageContainer);
      
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    async function initHostChat() {
        chatStatus.innerText = 'Initializing server...';
        const Lynk = await import('../lynk.js');
        const host = new Lynk.Host();
        await host.connect();
        const server = await host.createServer('ws', { name: 'Chat Room', service: 'lynk_chat', url: window.location, version: '0.0.1' });
        chatStatus.innerText = 'Server created';
        chatURL.innerText = 'ws://'+window.location.hostname+':' + server.getPort();
        chatURL.title = 'Click to copy';
        chatURL.addEventListener('click', () => {
            if(navigator && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText('ws://'+window.location.hostname+':' + server.getPort());
                chatURL.innerText = 'Copied!';
                setTimeout(() => chatURL.innerText = 'ws://'+window.location.hostname+':' + server.getPort(), 2000);
            }
        });

        server.on('clientMessage', (data) => {
            displayMessage(data.payload);
            server.broadcast(data.payload);
        }, 'chat-message-listener');

        server.on('clientJoined', (data) => {
            displayMessage('A member joined the chat');
            server.broadcast('A member joined the chat');
        }, 'chat-client-joined-listener');

        server.on('clientLeft', (data) => {
            displayMessage('A member left the chat');
            server.broadcast('A member left the chat');
        }, 'chat-client-left-listener');

        sendButton.addEventListener('click', () => {
            const message = usernameInput.value + ': ' + messageInput.value;
            server.broadcast(message);
            displayMessage(message, true);
            messageInput.value = '';
        });

        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendButton.click();
        });

        document.addEventListener('beforeunload', (e) => {
            server.close();
        });
    }

    async function initClientChat() {
        let url = new URL(clientInput.value);
        url.protocol = 'ws';
        url = url.toString().trimEnd('/');
        const ws = new WebSocket(url);
        chatURL.innerText = url;
        chatURL.title = 'Click to copy';
        chatURL.addEventListener('click', () => {
            if(navigator && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url);
                chatURL.innerText = 'Copied!';
                setTimeout(() => chatURL.innerText = url, 2000);
            }
        });
        chatStatus.innerText = 'Connecting to server...';

        ws.addEventListener('open', () => {
            chatStatus.innerText = 'Connected to server';
        });
        ws.addEventListener('close', () => {
            chatStatus.innerText = 'Disconnected from server';
        });
        ws.addEventListener('error', () => {
            chatStatus.innerText = 'Error connecting to server';
        });

        let lastSentMessage = 'A member joined the chat';
        ws.addEventListener('message', (event) => {
            const message = event.data;
            if (message == lastSentMessage) {
                lastSentMessage = null;
                return;
            }
            displayMessage(message);
        });
        sendButton.addEventListener('click', () => {
            const message = usernameInput.value + ': ' + messageInput.value;
            ws.send(message);
            lastSentMessage = message;
            displayMessage(message, true);
            messageInput.value = '';
        });

        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendButton.click();
        });

        document.addEventListener('beforeunload', (e) => {
            ws.close();
        });
    }

    hostButton.addEventListener('click', () => {
        host = true;
        chatContainer.classList.remove('hidden');
        document.getElementById('login').classList.add('hidden');
        initHostChat();
    });

    clientButton.addEventListener('click', () => {
        chatContainer.classList.remove('hidden');
        document.getElementById('login').classList.add('hidden');
        initClientChat();
    });
});