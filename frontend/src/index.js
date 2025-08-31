import './main.css';

const nicknameModal = document.getElementById('nickname-modal');
const nicknameForm = document.getElementById('nickname-form');
const nicknameInput = document.getElementById('nickname-input');
const nicknameError = document.getElementById('nickname-error');

const chatContainer = document.getElementById('chat-container');
const usersList = document.getElementById('users-list');
const messagesContainer = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');

let user = null;
let ws = null;

const API_URL = 'https://chat-app-backend-dc51.onrender.com';
const WS_URL = 'wss://chat-app-backend-dc51.onrender.com';

nicknameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nicknameInput.value.trim();
    if (!name) return;

    try {
        const response = await fetch(`${API_URL}/new-user`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name }),
        });

        const result = await response.json();

        if (result.status === 'ok') {
            user = result.user;
            nicknameModal.classList.remove('active');
            chatContainer.classList.add('active');
            initWebSocket();
        } else {
            nicknameError.textContent = result.message;
        }
    } catch (error) {
        nicknameError.textContent = 'Ошибка подключения к серверу.';
    }
});

function initWebSocket() {
    ws = new WebSocket(WS_URL);

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (Array.isArray(data)) {
            updateUsersList(data);
        } else if (data.type === 'send') {
            addMessage(data);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket connection closed');
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function updateUsersList(users) {
    usersList.innerHTML = '';
    users.forEach(u => {
        const li = document.createElement('li');
        if (u.id === user.id) {
            li.textContent = 'You';
            li.classList.add('you');
        } else {
            li.textContent = u.name;
        }
        usersList.appendChild(li);
    });
}

function addMessage(msg) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');

    const isYou = msg.user.id === user.id;
    messageElement.classList.add(isYou ? 'yours' : 'theirs');

    const author = isYou ? 'You' : msg.user.name;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    messageElement.innerHTML = `
        <div class="meta">${author}, ${time}</div>
        <div class="text">${msg.message}</div>
    `;

    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = messageInput.value.trim();
    if (!message) return;

    const msgData = {
        type: 'send',
        message: message,
        user: user
    };

    ws.send(JSON.stringify(msgData));
    messageInput.value = '';
});

window.addEventListener('beforeunload', () => {
    if (user && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'exit',
            user: user
        }));
    }
});
