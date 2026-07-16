
document.addEventListener('DOMContentLoaded', async () => {
    const Lynk = await import('../lynk.js');

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
    const availableChatsContainer = document.getElementById('availableChatsContainer');
    const noAvailableChatsText = document.getElementById('noAvailableChatsText');
    const availableChatsList = document.getElementById('availableChatsList');
    const chatName = document.getElementById('chatName');


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
        let members = 1;
        let name = 'Chat Room #' + Math.random().toString().substring(2, 6);
        const host = new Lynk.Host();
        await host.connect();
        const server = await host.createServer('ws', { name: name, service: 'lynk_chat', url: window.location.toString(), version: '0.0.1', options: {members: members} });
        chatStatus.innerText = 'Server created';
        chatName.value = name;
        chatURL.innerText = window.location.hostname;
        chatURL.title = 'Click to copy';
        chatURL.addEventListener('click', () => {
            if(navigator && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(window.location.hostname);
                chatURL.innerText = 'Copied!';
                setTimeout(() => chatURL.innerText = window.location.hostname, 2000);
            }
        });
        usernameInput.value = 'Host';

        server.on('clientMessage', (data) => {
            displayMessage(data.payload);
            server.broadcast({type:'message',text:data.payload});
        }, 'chat-message-listener');

        server.on('clientJoined', (data) => {
            displayMessage('A member joined the chat');
            members++;
            server.updateConfig({options: {members: members}});
            server.broadcast({type:'new_member'});
        }, 'chat-client-joined-listener');

        server.on('clientLeft', (data) => {
            displayMessage('A member left the chat');
            members--;
            server.updateConfig({options: {members: members}});
            server.broadcast({type:'member_left'});
        }, 'chat-client-left-listener');

        sendButton.addEventListener('click', () => {
            const message = usernameInput.value + ': ' + messageInput.value;
            server.broadcast({type:'message',text:message});
            displayMessage(message, true);
            messageInput.value = '';
        });

        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendButton.click();
        });

        chatName.addEventListener('change', () => {
            server.updateConfig({name: chatName.value});
            server.broadcast({type:'update_name', name:chatName.value});
            displayMessage('Chat name updated to ' + chatName.value);
        });

        document.addEventListener('beforeunload', (e) => {
            server.close();
        });
    }

    async function initClientChat(server) {
        chatContainer.classList.remove('hidden');
        document.getElementById('login').classList.add('hidden');
        let url = 'ws://'+server.url;
        const ws = new WebSocket(url);

        usernameInput.value = 'User #' + Math.random().toString().substring(2, 6);

        chatURL.innerText = new URL(url).hostname;
        chatURL.title = 'Click to copy';
        chatURL.addEventListener('click', () => {
            if(navigator && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(new URL(url).hostname);
                chatURL.innerText = 'Copied!';
                setTimeout(() => chatURL.innerText = new URL(url).hostname, 2000);
            }
        });
        
        chatName.disabled = true;
        chatName.value = server.name;
        chatName.originalText = server.name;
        chatName.title = 'Click to copy';
        chatName.addEventListener('click', () => {
            if(navigator && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(chatName.originalText);
                chatName.value = 'Copied!';
                setTimeout(() => chatName.value = chatName.originalText, 2000);
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
            let message = JSON.parse(event.data);
            if (message.type == 'member_left') {
                displayMessage('A member left the chat');
            } else if (message.type == 'update_name') {
                displayMessage('Chat name updated to ' + message.name);
                chatName.originalText = message.name;
                chatName.value = message.name;
            } else if (message.type == 'new_member') {
                displayMessage('A member joined the chat');
            } else if (message.type == 'message') {
                if (message.text == lastSentMessage) {
                    lastSentMessage = null;
                    return;
                }
                displayMessage(message.text);
            }
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

    async function getAvailableChats() {
        const servers = await Lynk.search('lynk_chat', clientInput.value);
        availableChatsContainer.classList.remove('hidden');
        if (servers.length === 0) {
            noAvailableChatsText.classList.remove('hidden');
            return;
        }
        noAvailableChatsText.classList.add('hidden');
        availableChatsList.innerHTML = '';
        servers.forEach(server => {
            const serverElement = document.createElement('div');
            serverElement.classList.add('server');
            serverElement.innerHTML = `<div class="info"><p class="name">${server.name}</p><p class="members">👥 ${server.options.members}</p></div>`;
            const joinButton = document.createElement('button');
            joinButton.innerText = 'Join';
            joinButton.addEventListener('click', () => {
                initClientChat(server);
            });
            serverElement.appendChild(joinButton);
            availableChatsList.appendChild(serverElement);
        });
    }

    hostButton.addEventListener('click', () => {
        host = true;
        chatContainer.classList.remove('hidden');
        document.getElementById('login').classList.add('hidden');
        initHostChat();
    });

    clientButton.addEventListener('click', () => {
        getAvailableChats();
    });
});