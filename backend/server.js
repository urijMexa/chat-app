import { randomUUID } from "node:crypto";
import http from "node:http";
import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import pino from "pino";
import pinoPretty from "pino-pretty";
import WebSocket, { WebSocketServer } from "ws";

const app = express();
const logger = pino(pinoPretty());

// ИЗМЕНЕНИЕ 1: Создаем более детальные настройки CORS
const corsOptions = {
    origin: '*',
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    preflightContinue: false,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions)); // Используем новые настройки

app.use(
    bodyParser.json({
        type(req) {
            return true;
        },
    })
);
app.use((req, res, next) => {
    res.setHeader("Content-Type", "application/json");
    next();
});

const userState = [];

// ИЗМЕНЕНИЕ 2: Явно обрабатываем OPTIONS запросы для нашего пути
app.options('/new-user', cors(corsOptions));

app.post("/new-user", async (request, response) => {
    if (Object.keys(request.body).length === 0) {
        const result = {
            status: "error",
            message: "This name is already taken!",
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
        response.send(JSON.stringify(result)).end();
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
            [...wsServer.clients]
                .filter((o) => o.readyState === WebSocket.OPEN)
                .forEach((o) => o.send(JSON.stringify(userState)));
            logger.info(`User with name "${receivedMSG.user.name}" has been deleted`);
            return;
        }
        if (receivedMSG.type === "send") {
            [...wsServer.clients]
                .filter((o) => o.readyState === WebSocket.OPEN)
                .forEach((o) => o.send(msg, { binary: isBinary }));
            logger.info("Message sent to all users");
        }
    });

    [...wsServer.clients]
        .filter((o) => o.readyState === WebSocket.OPEN)
        .forEach((o) => o.send(JSON.stringify(userState)));
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
