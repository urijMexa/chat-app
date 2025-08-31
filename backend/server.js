import { randomUUID } from "node:crypto";
import http from "node:http";
import express from "express"; // Убираем body-parser, используем встроенный в express
import pino from "pino";
import pinoPretty from "pino-pretty";
import WebSocket, { WebSocketServer } from "ws";

const app = express();
const logger = pino(pinoPretty());

// Middleware для CORS, размещаем его САМЫМ ПЕРВЫМ
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Если это OPTIONS-запрос (preflight), просто отвечаем 200 OK
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    next();
});

// Используем встроенный в Express обработчик JSON
app.use(express.json());

app.use((req, res, next) => {
    res.setHeader("Content-Type", "application/json");
    next();
});

const userState = [];

app.post("/new-user", async (request, response) => {
    if (!request.body || !request.body.name) {
        const result = {
            status: "error",
            message: "Invalid request body!",
        };
        response.status(400).send(JSON.stringify(result)).end();
        return;
    }
    const { name } = request.body;
    const isExist = userState.find((user) => user.name === name);
    if (!isExist) {
        const newUser = {
            id: randomUUID(),
            name: name,
        };
        userState.push(newUser);
        const result = {
            status: "ok",
            user: newUser,
        };
        logger.info(`New user created: ${JSON.stringify(newUser)}`);
        response.status(200).send(JSON.stringify(result)).end();
    } else {
        const result = {
            status: "error",
            message: "This name is already taken!",
        };
        logger.error(`User with name "${name}" already exist`);
        response.status(409).send(JSON.stringify(result)).end();
    }
});

const server = http.createServer(app);
const wsServer = new WebSocketServer({ server });

wsServer.on("connection", (ws) => {
    ws.on("message", (msg, isBinary) => {
        const receivedMSG = JSON.parse(msg);
        logger.info(`Message received: ${JSON.stringify(receivedMSG)}`);
        if (receivedMSG.type === "exit") {
            const idx = userState.findIndex(
                (user) => user.name === receivedMSG.user.name
            );
            if (idx !== -1) {
                userState.splice(idx, 1);
            }
            const dataToSend = JSON.stringify(userState);
            [...wsServer.clients]
                .filter((o) => o.readyState === WebSocket.OPEN)
                .forEach((o) => o.send(dataToSend));
            logger.info(`User with name "${receivedMSG.user.name}" has been deleted`);
            return;
        }
        if (receivedMSG.type === "send") {
            const dataToSend = JSON.stringify(receivedMSG);
            [...wsServer.clients]
                .filter((o) => o.readyState === WebSocket.OPEN)
                .forEach((o) => o.send(dataToSend, { binary: isBinary }));
            logger.info("Message sent to all users");
        }
    });

    const dataToSend = JSON.stringify(userState);
    [...wsServer.clients]
        .filter((o) => o.readyState === WebSocket.OPEN)
        .forEach((o) => o.send(dataToSend));
});

const port = process.env.PORT || 3000;

const bootstrap = async () => {
    try {
        server.listen(port, () =>
            logger.info(`Server has been started on http://localhost:${port}`)
        );
    } catch (error) {
        logger.error(`Error: ${error.message}`);
    }
};

bootstrap();
